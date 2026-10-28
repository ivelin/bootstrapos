/**
 * Self-serve create_company on real Postgres connections.
 * Never supabase-pirin-ai. Starts a throwaway PostgreSQL 16 cluster.
 * Skips only when those binaries are absent and CI is not set.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRELUDE = path.join(__dirname, "pglite", "self-serve-prelude.sql");
const MIGRATION = path.join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20261028_create_company_self_serve.sql",
);
const DOWN = path.join(
  __dirname,
  "..",
  "supabase",
  "rollbacks",
  "20261028_create_company_self_serve.sql",
);
const DB = "self_serve_proof";
const LOG = "/opt/cursor/artifacts/self-serve-migration.log";
const BIN = "/usr/lib/postgresql/16/bin";
const hasPg = fs.existsSync(path.join(BIN, "initdb"));
if (process.env.CI === "true" && !hasPg) {
  throw new Error("PostgreSQL 16 initdb is required when CI=true");
}

let dataDir;
let port;
let psqlBin;

const ALICE = "11111111-1111-4111-8111-111111111111";
const ALICE_EMAIL = "alice@example.test";
const BOB = "22222222-2222-4222-8222-222222222222";
const BOB_EMAIL = "bob@example.test";

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const assigned = server.address().port;
      server.close(() => resolve(String(assigned)));
    });
  });
}

function psql(args, input, database = DB) {
  return spawnSync(psqlBin, ["-h", dataDir, "-p", port, "-d", database, "-v", "ON_ERROR_STOP=1", ...args], {
    encoding: "utf8",
    input,
  });
}

function note(line) {
  try {
    fs.appendFileSync(LOG, line);
  } catch {
    /* proof log is optional */
  }
}

function sql(statement) {
  const result = psql(["-c", statement]);
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "psql failed");
  }
  return result.stdout;
}

function call(uid, email, name) {
  const statement = `
BEGIN;
SELECT set_config('request.jwt.claim.sub', '${uid}', true);
SELECT set_config('request.jwt.claim.email', '${email}', true);
SET LOCAL ROLE authenticated;
SELECT public.create_company_self_serve('${name}') AS id;
COMMIT;
`;
  return psql(["-v", "ON_ERROR_STOP=1", "-c", statement]);
}

describe("create_company_self_serve real Postgres", { skip: hasPg ? false : "PostgreSQL 16 is not installed", concurrency: false }, () => {
  before(async () => {
    if (process.env.CI === "true" && !hasPg) {
      throw new Error("PostgreSQL 16 initdb is required when CI=true");
    }
    psqlBin = path.join(BIN, "psql");
    if (process.env.BOS_PG_DIR && process.env.BOS_PG_PORT) {
      dataDir = process.env.BOS_PG_DIR;
      port = process.env.BOS_PG_PORT;
    } else {
      port = await freePort();
      dataDir = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP || os.tmpdir(), "bos-self-serve-"));
      spawnSync(
        path.join(BIN, "initdb"),
        ["-D", dataDir, "--auth=trust", "--username", process.env.USER || "postgres", "--no-instructions"],
        { stdio: "ignore" },
      );
      const pgCtl = path.join(BIN, "pg_ctl");
      const started = spawnSync(
        pgCtl,
        ["-D", dataDir, "-w", "-t", "30", "-l", path.join(dataDir, "server.log"), "-o", `-p ${port} -k ${dataDir} -c listen_addresses=`, "start"],
        { encoding: "utf8" },
      );
      if (started.status !== 0) throw new Error(started.stderr || "pg_ctl start failed");
    }
    try {
      fs.mkdirSync("/opt/cursor/artifacts", { recursive: true });
    } catch {
      /* the proof log is local evidence; the assertions do not need it */
    }
    const created = psql(["-c", `CREATE DATABASE ${DB}`], undefined, "postgres");
    if (created.status !== 0) throw new Error(created.stderr);
    const prelude = psql(["-f", PRELUDE]);
    if (prelude.status !== 0) throw new Error(prelude.stderr);
    const migration = psql(["-f", MIGRATION]);
    if (migration.status !== 0) throw new Error(migration.stderr);
    sql(
      `INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
        ('${ALICE}', '${ALICE_EMAIL}', '2026-01-01T00:00:00Z'),
        ('${BOB}', '${BOB_EMAIL}', '2026-01-01T00:00:00Z')`,
    );
    try {
      fs.writeFileSync(LOG, `applied ${MIGRATION}\n`);
    } catch {
      /* proof log is optional */
    }
  });

  after(() => {
    if (process.env.BOS_PG_DIR) return;
    if (dataDir) {
      spawnSync(path.join(BIN, "pg_ctl"), ["-D", dataDir, "-w", "-t", "30", "-m", "immediate", "stop"], {
        stdio: "ignore",
      });
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("an unconfirmed account is denied", () => {
    const uid = "33333333-3333-4333-8333-333333333333";
    sql(`INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ('${uid}', 'carol@example.test', NULL)`);
    const denied = psql([
      "-c",
      `DO $body$
       BEGIN
         PERFORM set_config('request.jwt.claim.sub', '${uid}', true);
         PERFORM set_config('request.jwt.claim.email', 'carol@example.test', true);
         EXECUTE 'SET LOCAL ROLE authenticated';
         PERFORM public.create_company_self_serve('carol');
         RAISE EXCEPTION 'expected_denial';
       EXCEPTION
         WHEN SQLSTATE 'P0001' THEN
           IF SQLERRM IS DISTINCT FROM 'email_unconfirmed' THEN
             RAISE EXCEPTION 'unexpected %', SQLERRM;
           END IF;
       END
       $body$;`,
    ]);
    assert.equal(denied.status, 0, denied.stderr);
    const count = sql(
      `SELECT count(*) FROM bootstrap_os.companies WHERE created_by = '${uid}'`,
    );
    assert.match(count, /\n\s*0\n/);
  });

  it("the 4th create is denied and a second tenant cannot read the first", () => {
    for (const name of ["alpha", "bravo", "charlie"]) {
      const created = call(ALICE, ALICE_EMAIL, name);
      assert.equal(created.status, 0, created.stderr);
    }
    const fourth = call(ALICE, ALICE_EMAIL, "delta");
    assert.notEqual(fourth.status, 0);
    assert.match(fourth.stderr, /company_limit_reached/);
    const count = sql(
      `SELECT count(*) FROM bootstrap_os.companies WHERE created_by = '${ALICE}' AND starter IS NOT TRUE`,
    );
    assert.match(count, /\n\s*3\n/);

    const alice = psql([
      "-c",
      `BEGIN;
       SELECT set_config('request.jwt.claim.sub', '${ALICE}', true);
       SELECT set_config('request.jwt.claim.email', '${ALICE_EMAIL}', true);
       SET LOCAL ROLE authenticated;
       SELECT count(*) AS n FROM bootstrap_os.companies;
       COMMIT;`,
    ]);
    assert.equal(alice.status, 0, alice.stderr);
    assert.match(alice.stdout, /\n\s*3\n/);

    const bob = psql([
      "-c",
      `BEGIN;
       SELECT set_config('request.jwt.claim.sub', '${BOB}', true);
       SELECT set_config('request.jwt.claim.email', '${BOB_EMAIL}', true);
       SET LOCAL ROLE authenticated;
       SELECT count(*) AS n FROM bootstrap_os.companies;
       COMMIT;`,
    ]);
    assert.equal(bob.status, 0, bob.stderr);
    assert.match(bob.stdout, /\n\s*0\n/);
  });

  it("a direct INSERT fails", () => {
    const inserted = psql([
      "-c",
      `BEGIN;
       SELECT set_config('request.jwt.claim.sub', '${BOB}', true);
       SELECT set_config('request.jwt.claim.email', '${BOB_EMAIL}', true);
       SET LOCAL ROLE authenticated;
       INSERT INTO bootstrap_os.companies (slug, label) VALUES ('echo', 'echo');
       COMMIT;`,
    ]);
    assert.notEqual(inserted.status, 0);
    assert.match(inserted.stderr, /permission denied/i);
  });

  it("the audit row holds ids only", () => {
    const audit = sql(
      `SELECT who, client, what_changed::text AS changed
       FROM bootstrap_os.audit_events
       WHERE who = '${ALICE}'`,
    );
    assert.match(audit, /create_company_self_serve/);
    assert.doesNotMatch(audit, /@/);
    assert.doesNotMatch(audit, /alpha|bravo|charlie/);
    const owners = sql(
      `SELECT count(*) FROM public.bootstrap_os_roles WHERE role = 'owner' AND company_id IS NOT NULL`,
    );
    assert.match(owners, /\n\s*3\n/);
  });

  it("concurrent_fourth_create_race", async () => {
    const cara = "44444444-4444-4444-8444-444444444444";
    sql(
      `INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ('${cara}', 'cara@example.test', '2026-01-01T00:00:00Z')`,
    );
    assert.equal(call(cara, "cara@example.test", "india").status, 0, "seed india");
    assert.equal(call(cara, "cara@example.test", "juliet").status, 0, "seed juliet");
    const fromTwo = await Promise.all([
      psqlAsync(concurrentSql(cara, "cara@example.test", "kilo")),
      psqlAsync(concurrentSql(cara, "cara@example.test", "lima")),
    ]);
    const won = fromTwo.filter((result) => result.status === 0);
    const lost = fromTwo.filter((result) => result.status !== 0);
    assert.equal(won.length, 1, fromTwo.map((result) => `${result.status}\n${result.stderr}`).join("\n"));
    assert.equal(lost.length, 1);
    assert.match(lost[0].stderr, /company_limit_reached/);
    const ended = sql(`SELECT count(*) FROM bootstrap_os.companies WHERE created_by = '${cara}'`);
    assert.match(ended, /\n\s*3\n/);

    const fromThree = await Promise.all([
      psqlAsync(concurrentSql(ALICE, ALICE_EMAIL, "golf")),
      psqlAsync(concurrentSql(ALICE, ALICE_EMAIL, "hotel")),
    ]);
    assert.equal(fromThree.filter((result) => result.status === 0).length, 0);
    assert.equal(
      fromThree.filter((result) => /company_limit_reached/.test(result.stderr)).length,
      2,
      fromThree.map((result) => result.stderr).join("\n"),
    );
    const aliceCount = sql(
      `SELECT count(*) FROM bootstrap_os.companies WHERE created_by = '${ALICE}' AND starter IS NOT TRUE`,
    );
    assert.match(aliceCount, /\n\s*3\n/);
    note(`concurrent_fourth_create_race passed\nfrom-2 ${won.length} won\nfrom-3 both denied\n`);
  });

  it("the down migration drops the function and keeps the company", () => {
    const down = psql(["-f", DOWN]);
    assert.equal(down.status, 0, down.stderr);
    const gone = psql(["-c", "SELECT public.create_company_self_serve('india')"]);
    assert.notEqual(gone.status, 0);
    assert.match(gone.stderr, /create_company_self_serve/);
    const kept = sql("SELECT count(*) FROM bootstrap_os.companies WHERE slug = 'alpha'");
    assert.match(kept, /\n\s*1\n/);
    note(`applied down ${DOWN}\ncompany rows kept\n`);
  });
});

function concurrentSql(uid, email, name) {
  return `
BEGIN;
SELECT set_config('request.jwt.claim.sub', '${uid}', true);
SELECT set_config('request.jwt.claim.email', '${email}', true);
SELECT pg_sleep(0.3);
SET LOCAL ROLE authenticated;
SELECT public.create_company_self_serve('${name}') AS id;
COMMIT;
`;
}

function psqlAsync(statement) {
  return new Promise((resolve) => {
    const child = spawn(
      psqlBin,
      ["-h", dataDir, "-p", port, "-d", DB, "-v", "ON_ERROR_STOP=1", "-c", statement],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (status) => resolve({ status: status ?? 1, stdout, stderr }));
  });
}

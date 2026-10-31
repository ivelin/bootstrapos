/**
 * PostgreSQL 16. SOP table is append-only. Never prod.
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = path.join(__dirname, "..", "supabase", "migrations");
const SQL = path.join(MIGRATIONS, "20261030_bootstrap_os_sops.sql");
const SHA_FIX = path.join(MIGRATIONS, "20261030b_bootstrap_os_sops_sha_fix.sql");
const BIN = "/usr/lib/postgresql/16/bin";

let dataDir;
let psqlBin;
let pgCtl;
let port;

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

function psql(sql, { stop = true } = {}) {
  const file = path.join(dataDir, `stmt-${process.hrtime.bigint()}.sql`);
  fs.writeFileSync(file, sql);
  const args = ["-h", dataDir, "-p", port, "-d", "postgres", "-t", "-A"];
  if (stop) args.push("-v", "ON_ERROR_STOP=1");
  args.push("-f", file);
  return execFileSync(psqlBin, args, { encoding: "utf8" });
}

function sha(body) {
  return crypto.createHash("sha256").update(body, "utf8").digest("hex");
}

describe("PostgreSQL 16 SOP store", { concurrency: false }, () => {
  before(async () => {
    assert.ok(fs.existsSync(path.join(BIN, "initdb")), "PostgreSQL 16 initdb is required");
    port = await freePort();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "bos-sop-pg16-"));
    execFileSync(
      path.join(BIN, "initdb"),
      ["-D", dataDir, "--auth=trust", "--username", process.env.USER || "postgres", "--no-instructions"],
      { stdio: "ignore" },
    );
    pgCtl = path.join(BIN, "pg_ctl");
    psqlBin = path.join(BIN, "psql");
    execFileSync(
      pgCtl,
      [
        "-D",
        dataDir,
        "-w",
        "-t",
        "30",
        "-l",
        path.join(dataDir, "server.log"),
        "-o",
        `-p ${port} -k ${dataDir} -c listen_addresses=`,
        "start",
      ],
      { stdio: "ignore" },
    );
  });

  after(() => {
    if (pgCtl && dataDir) {
      try {
        execFileSync(pgCtl, ["-D", dataDir, "-w", "-t", "30", "-m", "immediate", "stop"], { stdio: "ignore" });
      } catch {
        /* cluster already stopped */
      }
    }
    if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("rejects updates, orders semver, and lets anon execute but not select", () => {
    psql(`
      DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      CREATE SCHEMA IF NOT EXISTS extensions;
      CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;
    `);
    psql(fs.readFileSync(SQL, "utf8"));
    psql(fs.readFileSync(SHA_FIX, "utf8"));
    const low = "fixture body nine";
    const high = "fixture body ten";
    psql(`
      INSERT INTO public.bootstrap_os_sops (name, version, body, sha256)
      VALUES ('alpha-sop', '1.9.0', '${low}', '${sha(low)}');
      INSERT INTO public.bootstrap_os_sops (name, version, body, sha256)
      VALUES ('alpha-sop', '1.10.0', '${high}', '${sha(high)}');
    `);

    const xSha = sha("x");
    assert.throws(
      () =>
        psql(
          `INSERT INTO public.bootstrap_os_sops (name, version, body, sha256) VALUES ('alpha-sop', '99999999999.0.0', 'x', '${xSha}')`,
        ),
      /check constraint/,
    );
    assert.throws(
      () =>
        psql(
          `INSERT INTO public.bootstrap_os_sops (name, version, body, sha256) VALUES ('alpha-sop', '01.2.3', 'x', '${xSha}')`,
        ),
      /check constraint/,
    );
    const afterBad = JSON.parse(psql(`SELECT public.bootstrap_os_list_sops()::text;`).trim());
    assert.equal(afterBad[0].version, "1.10.0");

    assert.throws(() => psql(`UPDATE public.bootstrap_os_sops SET body = body`), /append-only/);
    assert.throws(() => psql(`DELETE FROM public.bootstrap_os_sops`), /append-only/);
    assert.throws(
      () =>
        psql(
          `INSERT INTO public.bootstrap_os_sops (name, version, body, sha256) VALUES ('alpha-sop', '1.0.0', 'x', repeat('ab', 32))`,
        ),
      /sha256 does not match body/,
    );

    const listed = psql(`SELECT public.bootstrap_os_list_sops()::text;`);
    const list = JSON.parse(listed.trim());
    assert.equal(list[0].version, "1.10.0");
    assert.deepEqual(
      list[0].versions.map((row) => row.version),
      ["1.9.0", "1.10.0"],
    );
    const latest = JSON.parse(psql(`SELECT public.bootstrap_os_get_sop('alpha-sop', NULL)::text;`).trim());
    assert.equal(latest.body, high);
    const pinned = JSON.parse(psql(`SELECT public.bootstrap_os_get_sop('alpha-sop', '1.9.0')::text;`).trim());
    assert.equal(pinned.body, low);
    const missing = JSON.parse(psql(`SELECT public.bootstrap_os_get_sop('no-such', NULL)::text;`).trim());
    assert.equal(missing.error, "unknown_name");
    assert.deepEqual(missing.valid_names, ["alpha-sop"]);
    const badVersion = JSON.parse(
      psql(`SELECT public.bootstrap_os_get_sop('alpha-sop', '9.9.9')::text;`).trim(),
    );
    assert.equal(badVersion.error, "unknown_version");
    assert.deepEqual(badVersion.valid_versions, ["1.9.0", "1.10.0"]);

    const paths = psql(`
      SELECT string_agg(coalesce(array_to_string(p.proconfig, ','), 'missing'), ' ')
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('bootstrap_os_list_sops', 'bootstrap_os_get_sop');
    `);
    assert.equal((paths.match(/search_path=pg_catalog, public/g) || []).length, 2);

    assert.throws(() => psql(`SET ROLE service_role; TRUNCATE public.bootstrap_os_sops;`), /append-only|permission denied/);
    assert.throws(() => psql(`TRUNCATE public.bootstrap_os_sops;`), /append-only/);

    assert.throws(() => psql(`SET ROLE anon; SELECT * FROM public.bootstrap_os_sops;`), /permission denied/);
    const anonText = psql(`SET ROLE anon; SELECT public.bootstrap_os_list_sops()::text;`);
    const asAnon = JSON.parse(anonText.trim().split("\n").filter(Boolean).at(-1));
    assert.equal(asAnon[0].version, "1.10.0");
  });
});

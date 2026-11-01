/**
 * PostgreSQL 16. Never supabase-pirin-ai. Never prod.
 */
import { execFileSync } from "node:child_process";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import {
  FIX_SQL,
  HARNESS,
  NON_STARTER_IDEA_COUNT,
  NON_STARTER_SEED,
  RPCS,
  SCENARIO,
  STARTER_SQL,
} from "./starter-ensure-shared.mjs";

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

function psql(sql) {
  const file = path.join(dataDir, `stmt-${process.hrtime.bigint()}.sql`);
  fs.writeFileSync(file, sql);
  return execFileSync(
    psqlBin,
    ["-h", dataDir, "-p", port, "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", file],
    { encoding: "utf8" },
  );
}

describe("PostgreSQL 16 starter ensure_company", { concurrency: false }, () => {
  before(async () => {
    assert.ok(fs.existsSync(path.join(BIN, "initdb")), "PostgreSQL 16 initdb is required");
    port = await freePort();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "bos-starter-ensure-"));
    execFileSync(
      path.join(BIN, "initdb"),
      ["-D", dataDir, "--auth=trust", "--username", process.env.USER || "postgres", "--no-instructions"],
      { stdio: "ignore" },
    );
    pgCtl = path.join(BIN, "pg_ctl");
    psqlBin = path.join(BIN, "psql");
    execFileSync(
      pgCtl,
      ["-D", dataDir, "-w", "-t", "30", "-l", path.join(dataDir, "server.log"), "-o", `-p ${port} -k ${dataDir} -c listen_addresses=`, "start"],
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

  it("backfill is idempotent and owner journey calls keep one ACL row", () => {
    const version = psql("SHOW server_version_num;");
    assert.match(version, /\b16\d{4}\b/);
    psql(HARNESS);
    psql(fs.readFileSync(STARTER_SQL, "utf8"));
    psql(`
      SELECT set_config('app.actor_email', 'backfill@example.test', false);
      SELECT public.bootstrap_os_create_starter_board();
    `);
    psql(NON_STARTER_SEED);
    const before = psql(`
      SELECT count(*)::text
      FROM bootstrap_os.ideas i
      JOIN bootstrap_os.starter_boards s ON s.company_id = i.company_id
      WHERE s.owner_email = 'backfill@example.test';
    `);
    assert.equal(before.trim(), "0");
    psql(fs.readFileSync(FIX_SQL, "utf8"));
    psql(fs.readFileSync(FIX_SQL, "utf8"));
    const after = psql(`
      SELECT count(*)::text
      FROM bootstrap_os.ideas i
      JOIN bootstrap_os.starter_boards s ON s.company_id = i.company_id
      WHERE s.owner_email = 'backfill@example.test';
    `);
    assert.equal(after.trim(), "1");
    const plain = psql(NON_STARTER_IDEA_COUNT);
    assert.equal(plain.trim(), "0");
    psql(RPCS);
    psql(SCENARIO);
    const acl = psql(`
      SELECT count(*)::text
      FROM bootstrap_os.company_acl a
      JOIN bootstrap_os.starter_boards s ON s.company_id = a.company_id
      WHERE s.owner_email = 'founder@example.test';
    `);
    assert.equal(acl.trim(), "1");
  });
});

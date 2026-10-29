/**
 * Two real Postgres connections accept one scoped invite.
 * Never supabase-pirin-ai. Skips only when PostgreSQL 16 is absent and CI is not set.
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
const migrations = path.join(__dirname, "..", "supabase", "migrations");
const BIN = "/usr/lib/postgresql/16/bin";
const hasPg = fs.existsSync(path.join(BIN, "initdb"));
if (process.env.CI === "true" && !hasPg) {
  throw new Error("PostgreSQL 16 initdb is required when CI=true");
}

const DB = "scoped_accept_race";
const TOKEN = "abcdef0123456789abcdef0123456789";

let dataDir;
let port;
let psqlBin;

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

function psqlSync(args, input, database = DB) {
  return spawnSync(psqlBin, ["-h", dataDir, "-p", port, "-d", database, "-v", "ON_ERROR_STOP=1", ...args], {
    encoding: "utf8",
    input,
  });
}

function psqlAsync(sql) {
  return new Promise((resolve) => {
    const child = spawn(psqlBin, ["-h", dataDir, "-p", port, "-d", DB, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", sql], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

describe("scoped invite accept race (PostgreSQL 16)", { skip: hasPg ? false : "PostgreSQL 16 is not installed", concurrency: false }, () => {
  before(async () => {
    port = await freePort();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "bos-invite-race-"));
    spawnSync(path.join(BIN, "initdb"), ["-D", dataDir, "--auth=trust", "--username", process.env.USER || "postgres", "--no-instructions"], {
      stdio: "ignore",
    });
    psqlBin = path.join(BIN, "psql");
    const started = spawnSync(
      path.join(BIN, "pg_ctl"),
      ["-D", dataDir, "-w", "-t", "30", "-l", path.join(dataDir, "server.log"), "-o", `-p ${port} -k ${dataDir} -c listen_addresses=`, "start"],
      { encoding: "utf8" },
    );
    if (started.status !== 0) throw new Error(started.stderr || "pg_ctl start failed");
    const created = psqlSync(["-c", `CREATE DATABASE ${DB}`], undefined, "postgres");
    if (created.status !== 0) throw new Error(created.stderr);
    const harness = psqlSync([
      "-c",
      `
      DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
        SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
      $$;
      `,
    ]);
    if (harness.status !== 0) throw new Error(harness.stderr);
    const journeySql = fs
      .readFileSync(path.join(migrations, "20260902_bootstrap_os_journey.sql"), "utf8")
      .replace(/CREATE EXTENSION IF NOT EXISTS pgcrypto;/, "CREATE EXTENSION IF NOT EXISTS pgcrypto;");
    const journey = psqlSync(["-f", "-"], journeySql);
    if (journey.status !== 0) throw new Error(journey.stderr);
    const invite = psqlSync(["-f", path.join(migrations, "20261029_bootstrap_os_scoped_invites.sql")]);
    if (invite.status !== 0) throw new Error(invite.stderr);
    const seed = psqlSync([
      "-c",
      `
      SELECT set_config('request.jwt.claims', '{"email":"founder@example.test"}', false);
      INSERT INTO bootstrap_os.companies (id, slug, label)
      VALUES ('11111111-1111-1111-1111-111111111111', 'alpha', 'alpha');
      INSERT INTO bootstrap_os.company_acl (company_id, principal, principal_kind, role)
      VALUES ('11111111-1111-1111-1111-111111111111', 'founder@example.test', 'email', 'founder');
      INSERT INTO bootstrap_os.invites (token_hash, invitee_email, inviter_email, expires_at)
      VALUES (encode(sha256(convert_to('${TOKEN}', 'UTF8')), 'hex'), 'member@example.test', 'founder@example.test', now() + interval '1 day');
      INSERT INTO bootstrap_os.invite_companies (invite_id, company_id, role)
      SELECT id, '11111111-1111-1111-1111-111111111111', 'viewer'
      FROM bootstrap_os.invites WHERE invitee_email = 'member@example.test';
      `,
    ]);
    if (seed.status !== 0) throw new Error(seed.stderr);
  });

  after(() => {
    if (dataDir) {
      spawnSync(path.join(BIN, "pg_ctl"), ["-D", dataDir, "-w", "-t", "30", "-m", "immediate", "stop"], { stdio: "ignore" });
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("exactly one of two connections accepts", async () => {
    const statement = `
      SELECT public.bootstrap_os_invite_accept('${TOKEN}')::text
      FROM (SELECT set_config('request.jwt.claims', '{"email":"member@example.test"}', true)) cfg;
    `;
    const [left, right] = await Promise.all([psqlAsync(statement), psqlAsync(statement)]);
    assert.equal(left.code, 0, left.stderr);
    assert.equal(right.code, 0, right.stderr);
    const reasons = [left.stdout, right.stdout].map((text) => JSON.parse(text.trim()));
    const wins = reasons.filter((row) => row.ok === true);
    const losses = reasons.filter((row) => row.reason === "already_accepted");
    assert.equal(wins.length, 1);
    assert.equal(losses.length, 1);
    const count = psqlSync([
      "-t",
      "-A",
      "-c",
      "SELECT count(*) FROM bootstrap_os.company_acl WHERE principal = 'member@example.test'",
    ]);
    assert.equal(count.stdout.trim(), "1");
  });
});

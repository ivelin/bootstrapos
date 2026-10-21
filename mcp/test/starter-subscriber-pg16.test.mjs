/**
 * PostgreSQL 16. Authenticated role. Never supabase-pirin-ai. Never prod.
 */
import { execFileSync } from "node:child_process";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL = path.join(__dirname, "..", "supabase", "migrations", "20261021_bootstrap_os_starter_board.sql");
const BIN = "/usr/lib/postgresql/16/bin";

const HARNESS = `
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS bootstrap_os;
CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'email', NULLIF(current_setting('app.actor_email', true), ''),
    'sub', NULLIF(current_setting('app.actor_sub', true), '')
  );
$$;
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.auth_uid', true), '')::uuid;
$$;
CREATE TABLE bootstrap_os.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  label text NOT NULL
);
CREATE TABLE bootstrap_os.company_acl (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES bootstrap_os.companies (id) ON DELETE CASCADE,
  principal text NOT NULL,
  principal_kind text NOT NULL,
  role text NOT NULL,
  CONSTRAINT company_acl_unique UNIQUE (company_id, principal, principal_kind)
);
CREATE TABLE bootstrap_os.board_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES bootstrap_os.companies (id) ON DELETE CASCADE
);
CREATE TABLE bootstrap_os.notify_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES bootstrap_os.companies (id) ON DELETE CASCADE,
  channel text NOT NULL
);
CREATE TABLE public.bootstrap_os_companies (
  slug text PRIMARY KEY
);
CREATE TABLE public.bootstrap_mcp_mentees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  auth_user_id uuid UNIQUE
);
CREATE TABLE public.bootstrap_company_labels (
  mentee_id uuid NOT NULL REFERENCES public.bootstrap_mcp_mentees (id),
  label text NOT NULL
);
CREATE TABLE public.bootstrap_mcp_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_label text NOT NULL,
  invitee_email text NOT NULL
);
`;

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
  const args = ["-h", dataDir, "-p", port, "-d", "postgres"];
  if (stop) args.push("-v", "ON_ERROR_STOP=1");
  args.push("-t", "-A", "-f", file);
  return execFileSync(psqlBin, args, { encoding: "utf8" });
}

describe("PostgreSQL 16 starter subscribe", { concurrency: false }, () => {
  before(async () => {
    assert.ok(fs.existsSync(path.join(BIN, "initdb")), "PostgreSQL 16 initdb is required");
    port = await freePort();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "bos-pg16-"));
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

  it("a signed-in founder who is not the sandbox owner can subscribe to a normal company and cannot subscribe to that starter board", () => {
    const version = psql("SHOW server_version_num;");
    assert.match(version, /\b16\d{4}\b/);
    psql(HARNESS);
    psql(`SET client_min_messages = warning;\n${fs.readFileSync(SQL, "utf8")}`);

    const opened = psql(`
      SELECT set_config('app.actor_email', 'owner@example.test', false);
      SELECT set_config('app.auth_uid', '11111111-1111-1111-1111-111111111111', false);
      SELECT public.bootstrap_os_create_starter_board();
    `);
    assert.match(opened, /"ok"\s*:\s*true/);
    const ids = psql(`
      UPDATE public.bootstrap_mcp_mentees
      SET auth_user_id = '11111111-1111-1111-1111-111111111111'
      WHERE email = 'owner@example.test';
      INSERT INTO public.bootstrap_mcp_mentees (email, auth_user_id)
      VALUES ('founder@example.test', '22222222-2222-2222-2222-222222222222');
      INSERT INTO bootstrap_os.companies (slug, label) VALUES ('alpha', 'Alpha');
      GRANT USAGE ON SCHEMA bootstrap_os TO authenticated;
      GRANT INSERT ON TABLE bootstrap_os.board_subscribers TO authenticated;
      SELECT c.slug || ' ' || c.id::text
      FROM bootstrap_os.companies c
      ORDER BY c.slug;
    `);
    const lines = ids.trim().split("\n").filter((line) => line.includes(" "));
    const alphaId = lines.find((line) => line.startsWith("alpha "))?.split(" ")[1];
    const starterId = lines.find((line) => line.startsWith("sb"))?.split(" ")[1];
    assert.ok(alphaId);
    assert.ok(starterId);

    const def = psql(`
      SELECT format(
        'definer=%s config=%s auth_exec=%s public_exec=%s',
        p.prosecdef,
        coalesce(array_to_string(p.proconfig, ','), ''),
        has_function_privilege('authenticated', p.oid, 'execute'),
        EXISTS (
          SELECT 1 FROM aclexplode(p.proacl) AS a
          WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
        )
      )
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'bootstrap_os' AND p.proname = 'starter_block_subscriber';
    `);
    assert.match(def, /definer=t/);
    assert.match(def, /config=search_path=pg_catalog, public/);
    assert.match(def, /auth_exec=t/);
    assert.match(def, /public_exec=f/);

    let refused = false;
    let sessionOut = "";
    try {
      sessionOut = psql(`
        SELECT set_config('app.actor_email', 'founder@example.test', false);
        SELECT set_config('app.auth_uid', '22222222-2222-2222-2222-222222222222', false);
        SET ROLE authenticated;
        SELECT current_user;
        INSERT INTO bootstrap_os.board_subscribers (company_id) VALUES ('${alphaId}'::uuid);
        INSERT INTO bootstrap_os.board_subscribers (company_id) VALUES ('${starterId}'::uuid);
      `);
    } catch (error) {
      refused = true;
      sessionOut = `${error.stdout || ""}\n${error.stderr || ""}`;
      assert.match(sessionOut, /cannot send webhooks/);
    }
    assert.equal(refused, true);
    assert.match(sessionOut, /authenticated/);

    const counts = psql(`
      SELECT
        (SELECT count(*) FROM bootstrap_os.board_subscribers WHERE company_id = '${alphaId}'::uuid)::text
        || ' '
        || (SELECT count(*) FROM bootstrap_os.board_subscribers WHERE company_id = '${starterId}'::uuid)::text;
    `);
    assert.match(counts, /^1 0/);
  });
});

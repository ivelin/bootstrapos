/**
 * PostgreSQL 16: MCP email reads use the JWT when auth.users has no row.
 * Never supabase-pirin-ai. Never prod. Fictional fixtures only.
 */
import { execFileSync } from "node:child_process";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BIN = "/usr/lib/postgresql/16/bin";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UP = path.join(__dirname, "..", "supabase", "migrations", "20261115_bootstrap_mcp_jwt_email.sql");
const DOWN = path.join(__dirname, "..", "supabase", "rollbacks", "20261115_bootstrap_mcp_jwt_email.sql");

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

function psqlFile(file) {
  return execFileSync(
    psqlBin,
    ["-h", dataDir, "-p", port, "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", file],
    { encoding: "utf8" },
  );
}

function psql(sql) {
  const file = path.join(dataDir, `stmt-${process.hrtime.bigint()}.sql`);
  fs.writeFileSync(file, sql);
  return psqlFile(file);
}

describe("PostgreSQL 16 JWT email without an auth.users row", { concurrency: false }, () => {
  before(async () => {
    if (!fs.existsSync(path.join(BIN, "initdb"))) return;
    port = await freePort();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "bos-jwt-email-"));
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

  it("labels, accept, invite, and self-serve use the JWT email", () => {
    if (!fs.existsSync(path.join(BIN, "initdb"))) return;
    psql(`
      DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE SCHEMA IF NOT EXISTS bootstrap_os;
      CREATE TABLE auth.users (
        id uuid PRIMARY KEY,
        email text,
        email_confirmed_at timestamptz
      );
      CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
        SELECT jsonb_build_object(
          'email', NULLIF(current_setting('app.actor_email', true), ''),
          'sub', NULLIF(current_setting('app.actor_sub', true), '')
        );
      $$;
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('app.actor_sub', true), '')::uuid;
      $$;
      CREATE OR REPLACE FUNCTION bootstrap_os.actor_email() RETURNS text LANGUAGE sql STABLE AS $$
        SELECT NULLIF(lower(auth.jwt() ->> 'email'), '');
      $$;
      CREATE TABLE public.bootstrap_mcp_mentees (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text NOT NULL UNIQUE,
        auth_user_id uuid
      );
      CREATE TABLE public.bootstrap_company_labels (
        mentee_id uuid NOT NULL,
        label text NOT NULL,
        UNIQUE (mentee_id, label)
      );
      CREATE OR REPLACE FUNCTION public.bootstrap_os_live_role(uuid) RETURNS text LANGUAGE sql AS $$ SELECT 'member' $$;
      CREATE OR REPLACE FUNCTION public.bootstrap_os_membership_for(uuid, text) RETURNS jsonb LANGUAGE sql AS $$ SELECT NULL::jsonb $$;
      CREATE TABLE public.bootstrap_mcp_invites (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        invitee_email text NOT NULL,
        company_label text NOT NULL,
        accepted_at timestamptz,
        expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
        created_at timestamptz NOT NULL DEFAULT now(),
        invited_by_mentee_id uuid,
        invited_by_email text,
        token_hash text
      );
      CREATE TABLE public.bootstrap_mcp_oauth_subjects (
        auth_user_id uuid PRIMARY KEY,
        email text,
        rotated_at timestamptz,
        mentee_id uuid
      );
      CREATE TABLE public.bootstrap_mcp_access_tokens (
        token_hash text PRIMARY KEY,
        auth_user_id uuid,
        revoked_at timestamptz
      );
    `);
    psql(`
      DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    psqlFile(UP);
    const actor = "11111111-1111-4111-8111-111111111111";
    psql(`
      INSERT INTO public.bootstrap_mcp_mentees (email) VALUES ('founder@example.test');
      INSERT INTO public.bootstrap_company_labels (mentee_id, label)
      SELECT id, 'alpha' FROM public.bootstrap_mcp_mentees WHERE email = 'founder@example.test';
    `);
    assert.equal(psql("SELECT count(*) FROM auth.users;").trim(), "0");
    const call = (expr) =>
      psql(`
        WITH cfg AS (
          SELECT
            set_config('app.actor_email', 'founder@example.test', false),
            set_config('app.actor_sub', '${actor}', false)
        )
        SELECT ${expr} FROM cfg;
      `).trim();
    const labels = call("public.bootstrap_mcp_my_labels()::text");
    assert.match(labels, /"authenticated": true/);
    assert.match(labels, /founder@example.test/);
    assert.match(labels, /alpha/);
    const pending = call("public.bootstrap_mcp_accept_pending_invites(NULL)::text");
    assert.match(pending, /"ok": true/);
    assert.match(pending, /founder@example.test/);
    const invite = call("public.bootstrap_mcp_invite_member('invitee@example.test', 'bravo') ->> 'reason'");
    assert.match(invite, /label_not_held/);
    let selfServe = "";
    try {
      call("public.create_company_self_serve('!!!')");
    } catch (err) {
      selfServe = String(err.stderr || err.stdout || err.message || err);
    }
    assert.match(selfServe, /invalid_name/);
    assert.doesNotMatch(selfServe, /email_unconfirmed/);
    const def = psql("SELECT pg_get_functiondef('public.bootstrap_mcp_my_labels()'::regprocedure);");
    assert.match(def, /actor_email\(\)/);
    assert.doesNotMatch(def, /FROM auth\.users/);

    psqlFile(DOWN);
    const restored = psql("SELECT pg_get_functiondef('public.bootstrap_mcp_my_labels()'::regprocedure);");
    assert.match(restored, /FROM auth\.users/);
    const withoutRow = call("coalesce(public.bootstrap_mcp_my_labels() ->> 'email', '')");
    assert.equal(withoutRow, "");
    psqlFile(UP);
    const again = call("public.bootstrap_mcp_my_labels() ->> 'email'");
    assert.equal(again, "founder@example.test");
  });
});

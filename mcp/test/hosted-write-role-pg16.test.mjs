/**
 * PostgreSQL 16 up/down/up for 20261111. Never supabase-pirin-ai. Never prod.
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
const BASE = path.join(__dirname, "..", "supabase", "migrations", "20261110_bootstrap_os_ensure_company_founder_email.sql");
const UP = path.join(__dirname, "..", "supabase", "migrations", "20261111_bootstrap_os_hosted_write_role_enforcement.sql");
const DOWN = path.join(__dirname, "..", "supabase", "rollbacks", "20261111_bootstrap_os_hosted_write_role_enforcement.sql");

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

describe("PostgreSQL 16 hosted write-role round trip", { concurrency: false }, () => {
  before(async () => {
    if (!fs.existsSync(path.join(BIN, "initdb"))) return;
    port = await freePort();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "bos-write-role-"));
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

  it("applies 20261111, rolls it back, and applies it again", () => {
    if (!fs.existsSync(path.join(BIN, "initdb"))) return;
    psql(`
      DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE SCHEMA IF NOT EXISTS bootstrap_os;
      CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
        SELECT jsonb_build_object(
          'email', NULLIF(current_setting('app.actor_email', true), ''),
          'sub', NULLIF(current_setting('app.actor_sub', true), '')
        );
      $$;
      DO $$ BEGIN
        CREATE TYPE bootstrap_os.gate_decision AS ENUM ('advance', 'iterate', 'hold', 'kill');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      CREATE TABLE bootstrap_os.companies (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text NOT NULL UNIQUE, label text NOT NULL, founder text
      );
      CREATE TABLE bootstrap_os.company_acl (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL REFERENCES bootstrap_os.companies (id),
        principal text NOT NULL, principal_kind text NOT NULL, role text NOT NULL,
        UNIQUE (company_id, principal, principal_kind)
      );
      CREATE TABLE bootstrap_os.ideas (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL REFERENCES bootstrap_os.companies (id),
        slug text NOT NULL, name text NOT NULL,
        journey_phase smallint NOT NULL, loop_stage smallint NOT NULL,
        current_gate bootstrap_os.gate_decision NOT NULL DEFAULT 'hold',
        scoreboard jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (company_id, slug)
      );
      CREATE TABLE bootstrap_os.comments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), idea_id uuid, body text, who text, at timestamptz DEFAULT now()
      );
      CREATE TABLE bootstrap_os.gate_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), idea_id uuid, action text, why text, who text, at timestamptz DEFAULT now()
      );
      CREATE TABLE bootstrap_os.audit_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, idea_id uuid, at timestamptz DEFAULT now(),
        who text, client text, what_changed jsonb
      );
      CREATE TABLE bootstrap_os.board_subscribers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, idea_id uuid,
        principal text, principal_kind text, webhook_url text, email_opt_in boolean, created_by text
      );
      CREATE TABLE public.bootstrap_mcp_mentees (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE, auth_user_id uuid
      );
      CREATE TABLE public.bootstrap_company_labels (
        mentee_id uuid NOT NULL REFERENCES public.bootstrap_mcp_mentees (id), label text NOT NULL, UNIQUE (mentee_id, label)
      );
      CREATE TABLE public.bootstrap_os_roles (
        mentee_id uuid NOT NULL, role text NOT NULL, revoked_at timestamptz
      );
      CREATE TABLE public.bootstrap_request_cap (name text PRIMARY KEY, max_value int NOT NULL);
      INSERT INTO public.bootstrap_request_cap VALUES ('comment_body_bytes', 4096);
      CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
      CREATE OR REPLACE FUNCTION public.bootstrap_os_held_label(p_company text) RETURNS boolean LANGUAGE sql AS $$
        SELECT EXISTS (
          SELECT 1 FROM public.bootstrap_mcp_mentees m
          JOIN public.bootstrap_company_labels l ON l.mentee_id = m.id
          WHERE l.label = lower(p_company) AND m.email = NULLIF(lower(auth.jwt() ->> 'email'), '')
        );
      $$;
      CREATE OR REPLACE FUNCTION bootstrap_os.actor_email() RETURNS text LANGUAGE sql AS $$
        SELECT NULLIF(lower(auth.jwt() ->> 'email'), '');
      $$;
      CREATE OR REPLACE FUNCTION bootstrap_os.actor_sub() RETURNS text LANGUAGE sql AS $$
        SELECT NULLIF(auth.jwt() ->> 'sub', '');
      $$;
      CREATE OR REPLACE FUNCTION bootstrap_os.rank_of(p_role text) RETURNS int LANGUAGE sql AS $$
        SELECT CASE p_role
          WHEN 'founder' THEN 4 WHEN 'owner' THEN 4
          WHEN 'founder_authorized' THEN 3 WHEN 'editor' THEN 3
          WHEN 'advisor' THEN 2 WHEN 'mentor' THEN 2 WHEN 'commenter' THEN 2
          WHEN 'viewer' THEN 1 ELSE 0 END;
      $$;
      CREATE OR REPLACE FUNCTION bootstrap_os.actor_principal() RETURNS text LANGUAGE sql AS $$ SELECT 'roundtrip' $$;
      CREATE OR REPLACE FUNCTION bootstrap_os.emit_audit(uuid, uuid, text, text, jsonb) RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;
      CREATE OR REPLACE FUNCTION bootstrap_os.notify_bundle(uuid, uuid, text) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
      CREATE OR REPLACE FUNCTION bootstrap_os.idea_board_snapshot(smallint, smallint, bootstrap_os.gate_decision, jsonb) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
      CREATE OR REPLACE FUNCTION bootstrap_os.portfolio_view(uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
      CREATE OR REPLACE FUNCTION bootstrap_os.read_portfolio_score(jsonb) RETURNS jsonb LANGUAGE sql AS $$ SELECT NULL::jsonb $$;
      CREATE OR REPLACE FUNCTION public.bootstrap_hosted_take(text) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"ok":true}'::jsonb $$;
      CREATE OR REPLACE FUNCTION public.bootstrap_os_starter_is_sandbox(text) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
      CREATE OR REPLACE FUNCTION bootstrap_os.require_actor() RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;
      CREATE OR REPLACE FUNCTION bootstrap_os.resolved_actor_email() RETURNS text LANGUAGE sql AS $$ SELECT bootstrap_os.actor_email() $$;
      CREATE OR REPLACE FUNCTION bootstrap_os.resolved_actor_sub() RETURNS text LANGUAGE sql AS $$ SELECT NULL::text $$;
      CREATE FUNCTION public.bootstrap_os_ensure_company(text) RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
      CREATE FUNCTION public.bootstrap_os_put_journey(text, text, text, boolean, int, int, text, text, text, jsonb, text)
        RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
    `);
    psqlFile(BASE);
    psqlFile(UP);
    const upRank = psql("SELECT to_regprocedure('bootstrap_os.has_rank(uuid,int)')::text;").trim();
    assert.equal(upRank, "bootstrap_os.has_rank(uuid,integer)");
    const seeded = psql(`
      SELECT set_config('app.actor_email', 'admin@example.invalid', false);
      SELECT public.bootstrap_os_put_journey('q3co', 'default', 'seed clocks', true, 2, NULL, NULL, 'week', NULL, NULL, NULL, 'founder@example.invalid')::text;
    `);
    assert.match(seeded, /"ok": true/);
    const second = psql(`
      SELECT set_config('app.actor_email', 'admin@example.invalid', false);
      SELECT public.bootstrap_os_put_journey('q3co', 'default', 'again', false, 4, NULL, NULL, 'no', NULL, NULL, NULL, NULL) ->> 'error';
    `).trim();
    assert.equal(second, "forbidden_role");
    psqlFile(DOWN);
    const dropped = psql("SELECT to_regprocedure('bootstrap_os.has_rank(uuid,int)') IS NULL;").trim();
    assert.equal(dropped, "t");
    const restored = psql("SELECT pg_get_functiondef('public.bootstrap_os_ensure_company(text,text,boolean)'::regprocedure);");
    assert.match(restored, /founder_authorized/);
    psqlFile(UP);
    const again = psql("SELECT to_regprocedure('bootstrap_os.has_rank(uuid,int)')::text;").trim();
    assert.equal(again, "bootstrap_os.has_rank(uuid,integer)");
    const cleared = psql("SELECT pg_get_functiondef('public.bootstrap_os_ensure_company(text,text,boolean)'::regprocedure);");
    assert.equal(/founder_authorized/.test(cleared), false);
  });
});

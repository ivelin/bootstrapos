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
const FOUNDER_INVITE = path.join(__dirname, "..", "supabase", "migrations", "20261112_bootstrap_os_founder_invite_on_create.sql");
const FOUNDER_INVITE_DOWN = path.join(__dirname, "..", "supabase", "rollbacks", "20261112_bootstrap_os_founder_invite_on_create.sql");

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
      CREATE OR REPLACE FUNCTION bootstrap_os.normalize_gate_enrichment(jsonb) RETURNS jsonb LANGUAGE sql AS $$
        SELECT '{"whatChanged":"seed","whatWereNotDoing":"scope"}'::jsonb;
      $$;
      CREATE OR REPLACE FUNCTION bootstrap_os.normalize_kill_postmortem(jsonb, text) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
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
      WITH cfg AS (SELECT set_config('app.actor_email', 'admin@example.invalid', false) AS email)
      SELECT public.bootstrap_os_put_journey('q3co', 'default', 'seed clocks', true, 2, NULL, NULL, 'week', NULL, NULL, NULL, 'founder@example.invalid')::text
      FROM cfg;
    `);
    assert.match(seeded, /"ok": true/);
    const second = psql(`
      WITH cfg AS (SELECT set_config('app.actor_email', 'admin@example.invalid', false) AS email)
      SELECT public.bootstrap_os_put_journey('q3co', 'default', 'again', false, 4, NULL, NULL, 'no', NULL, NULL, NULL, NULL) ->> 'error'
      FROM cfg;
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

  it("mints one founder invite on a new board only when the email differs", () => {
    if (!fs.existsSync(path.join(BIN, "initdb"))) return;
    psql(`
      CREATE SCHEMA IF NOT EXISTS extensions;
      CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;
      CREATE OR REPLACE FUNCTION public.bootstrap_mcp_hash_token(p_token text)
      RETURNS text LANGUAGE sql IMMUTABLE AS $$
        SELECT encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex');
      $$;
      CREATE TABLE public.bootstrap_mcp_invites (
        id uuid PRIMARY KEY,
        invitee_email text NOT NULL,
        company_label text NOT NULL,
        invited_by_mentee_id uuid NOT NULL REFERENCES public.bootstrap_mcp_mentees (id),
        invited_by_email text NOT NULL,
        token_hash text NOT NULL UNIQUE,
        expires_at timestamptz NOT NULL,
        accepted_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE public.bootstrap_mcp_invite_outbox (
        id uuid PRIMARY KEY,
        invite_id uuid NOT NULL REFERENCES public.bootstrap_mcp_invites (id),
        channel text NOT NULL,
        payload jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX bootstrap_mcp_invites_pending_email_label_idx
        ON public.bootstrap_mcp_invites (invitee_email, company_label)
        WHERE accepted_at IS NULL;
    `);
    psqlFile(FOUNDER_INVITE);
    psql("INSERT INTO public.bootstrap_mcp_mentees (email) VALUES ('admin@example.invalid') ON CONFLICT (email) DO NOTHING;");
    const created = psql(`
      WITH cfg AS (SELECT set_config('app.actor_email', 'admin@example.invalid', false) AS email)
      SELECT public.bootstrap_os_put_journey('charlie', 'default', 'open charlie', false, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'founder@example.test')::text
      FROM cfg;
    `);
    assert.match(created, /"inviteeEmail": "founder@example.test"/);
    const counts = psql(`
      SELECT (SELECT count(*) FROM public.bootstrap_mcp_invites WHERE company_label = 'charlie')::text
        || ' ' ||
        (SELECT count(*) FROM public.bootstrap_mcp_invite_outbox o
          JOIN public.bootstrap_mcp_invites i ON i.id = o.invite_id
          WHERE i.company_label = 'charlie' AND o.channel = 'email')::text;
    `).trim();
    assert.equal(counts, "1 1");
    const self = psql(`
      WITH cfg AS (SELECT set_config('app.actor_email', 'founder@example.test', false) AS email)
      SELECT public.bootstrap_os_put_journey('bravo', 'default', 'self board', false, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'founder@example.test')::text
      FROM cfg;
    `);
    assert.equal(self.includes("founderInvite"), false);
    const bravo = psql("SELECT count(*)::text FROM public.bootstrap_mcp_invites WHERE company_label = 'bravo';").trim();
    assert.equal(bravo, "0");
    psql(`
      WITH cfg AS (SELECT set_config('app.actor_email', 'admin@example.invalid', false) AS email)
      SELECT public.bootstrap_os_put_journey('charlie', 'default', 'later write', false, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'founder@example.test')::text
      FROM cfg;
    `);
    const still = psql("SELECT count(*)::text FROM public.bootstrap_mcp_invites WHERE company_label = 'charlie';").trim();
    assert.equal(still, "1");
    psqlFile(FOUNDER_INVITE_DOWN);
    const restored = psql("SELECT pg_get_functiondef('bootstrap_os.ensure_company_for_actor(text,text,boolean)'::regprocedure);");
    assert.equal(restored.includes("bootstrap_mcp_invites"), false);
    psqlFile(FOUNDER_INVITE);
  });

  it("rotates a pending invite and skips when allowlist or rate limit fails", () => {
    if (!fs.existsSync(path.join(BIN, "initdb"))) return;
    psql(`
      INSERT INTO public.bootstrap_mcp_mentees (email) VALUES ('admin@example.invalid') ON CONFLICT (email) DO NOTHING;
      INSERT INTO public.bootstrap_mcp_invites (
        id, invitee_email, company_label, invited_by_mentee_id, invited_by_email, token_hash, expires_at
      )
      SELECT gen_random_uuid(), 'founder@example.test', 'echo', id, 'admin@example.invalid', 'old-hash', now() + interval '1 day'
      FROM public.bootstrap_mcp_mentees WHERE email = 'admin@example.invalid';
    `);
    const rotated = psql(`
      WITH cfg AS (SELECT set_config('app.actor_email', 'admin@example.invalid', false) AS email)
      SELECT public.bootstrap_os_put_journey('echo', 'default', 'open echo', false, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'founder@example.test')::text
      FROM cfg;
    `);
    assert.match(rotated, /"ok": true/);
    const pending = psql(`
      SELECT count(*)::text || ' ' || (token_hash <> 'old-hash')::text
      FROM public.bootstrap_mcp_invites
      WHERE company_label = 'echo' AND accepted_at IS NULL
      GROUP BY token_hash;
    `).trim();
    assert.equal(pending, "1 true");
    psql(`CREATE OR REPLACE FUNCTION public.bootstrap_hosted_take(text) RETURNS jsonb LANGUAGE sql AS $$
      SELECT '{"ok":false,"error":"rate_limited","reason":"rate_limited"}'::jsonb $$;`);
    const limited = psql(`
      WITH cfg AS (SELECT set_config('app.actor_email', 'admin@example.invalid', false) AS email)
      SELECT public.bootstrap_os_put_journey('foxtrot', 'default', 'over the limit', false, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'founder@example.test')::text
      FROM cfg;
    `);
    assert.match(limited, /"reason": "rate_limited"/);
    assert.match(limited, /"skipped": true/);
    assert.equal(limited.includes("inviteToken"), false);
    assert.equal(psql("SELECT count(*)::text FROM public.bootstrap_mcp_invites WHERE company_label = 'foxtrot';").trim(), "0");
    assert.equal(psql("SELECT count(*)::text FROM bootstrap_os.companies WHERE slug = 'foxtrot';").trim(), "1");
  });
});

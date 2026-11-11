/**
 * PostgreSQL 16: email grant writes the company label; revoke removes it.
 * Never supabase-pirin-ai. Never prod. Fictional fixtures only.
 */
import { execFileSync, spawn } from "node:child_process";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BIN = "/usr/lib/postgresql/16/bin";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIG = path.join(__dirname, "..", "supabase", "migrations");

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

describe("PostgreSQL 16 change_acl writes the company label", { concurrency: false }, () => {
  before(async () => {
    if (!fs.existsSync(path.join(BIN, "initdb"))) return;
    port = await freePort();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "bos-change-acl-"));
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

  it("owner grant makes held_label true and get_journey open; revoke closes it", () => {
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
      CREATE OR REPLACE FUNCTION bootstrap_os.emit_audit(uuid, uuid, text, text, jsonb) RETURNS uuid LANGUAGE plpgsql AS $$
      DECLARE nid uuid := gen_random_uuid();
      BEGIN
        INSERT INTO bootstrap_os.audit_events (id, company_id, idea_id, who, client, what_changed)
        VALUES (nid, $1, $2, $3, $4, $5);
        RETURN nid;
      END $$;
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
    psqlFile(path.join(MIG, "20261110_bootstrap_os_ensure_company_founder_email.sql"));
    psqlFile(path.join(MIG, "20261111_bootstrap_os_hosted_write_role_enforcement.sql"));
    psqlFile(path.join(MIG, "20261114_bootstrap_os_change_acl_label.sql"));
    psql(`
      CREATE OR REPLACE FUNCTION bootstrap_os.emit_audit(uuid, uuid, text, text, jsonb) RETURNS uuid LANGUAGE plpgsql AS $$
      DECLARE nid uuid := gen_random_uuid();
      BEGIN
        INSERT INTO bootstrap_os.audit_events (id, company_id, idea_id, who, client, what_changed)
        VALUES (nid, $1, $2, $3, $4, $5);
        RETURN nid;
      END $$;
      CREATE OR REPLACE FUNCTION public.bootstrap_os_starter_is_sandbox(p_company text) RETURNS boolean LANGUAGE sql AS $$
        SELECT lower(p_company) = 'sandbox';
      $$;
    `);

    const priv = psql(`
      SELECT has_function_privilege('anon', 'public.bootstrap_os_change_acl(text,text,text,text,text)', 'execute')::text
        || ' ' ||
        has_function_privilege('authenticated', 'public.bootstrap_os_change_acl(text,text,text,text,text)', 'execute')::text
        || ' ' ||
        has_function_privilege('public', 'public.bootstrap_os_change_acl(text,text,text,text,text)', 'execute')::text;
    `).trim();
    assert.equal(priv, "false true false");
    const def = psql("SELECT pg_get_functiondef('public.bootstrap_os_change_acl(text,text,text,text,text)'::regprocedure);");
    assert.match(def, /SECURITY DEFINER/);
    assert.match(def, /search_path TO 'public', 'bootstrap_os'/);
    assert.match(def, /bootstrap_os_grant_acl_internal\(cid, v_principal, v_role, true\)/);
    assert.match(def, /has_rank\(cid, 4\)/);

    psql(`
      INSERT INTO bootstrap_os.companies (id, slug, label) VALUES
        ('11111111-1111-4111-8111-111111111111', 'alpha', 'Alpha'),
        ('22222222-2222-4222-8222-222222222222', 'sandbox', 'Sandbox');
      INSERT INTO public.bootstrap_mcp_mentees (id, email) VALUES
        ('33333333-3333-4333-8333-333333333333', 'owner@example.test'),
        ('44444444-4444-4444-8444-444444444444', 'editor@example.test'),
        ('55555555-5555-4555-8555-555555555555', 'commenter@example.test');
      INSERT INTO public.bootstrap_company_labels (mentee_id, label) VALUES
        ('33333333-3333-4333-8333-333333333333', 'alpha'),
        ('33333333-3333-4333-8333-333333333333', 'sandbox'),
        ('44444444-4444-4444-8444-444444444444', 'alpha'),
        ('55555555-5555-4555-8555-555555555555', 'alpha');
      INSERT INTO bootstrap_os.company_acl (company_id, principal, principal_kind, role) VALUES
        ('11111111-1111-4111-8111-111111111111', 'owner@example.test', 'email', 'owner'),
        ('11111111-1111-4111-8111-111111111111', 'editor@example.test', 'email', 'editor'),
        ('11111111-1111-4111-8111-111111111111', 'commenter@example.test', 'email', 'commenter'),
        ('22222222-2222-4222-8222-222222222222', 'owner@example.test', 'email', 'owner');
      INSERT INTO bootstrap_os.ideas (company_id, slug, name, journey_phase, loop_stage, current_gate, scoreboard)
      VALUES ('11111111-1111-4111-8111-111111111111', 'default', 'Default', 1, 1, 'hold', '{}'::jsonb);
    `);

    const onlyOwner = psql(`
      SELECT count(*)::text FROM bootstrap_os.company_acl
      WHERE company_id = '11111111-1111-4111-8111-111111111111' AND role = 'founder';
    `).trim();
    assert.equal(onlyOwner, "0");

    const granted = psql(`
      WITH cfg AS (SELECT set_config('app.actor_email', 'owner@example.test', false) AS email)
      SELECT public.bootstrap_os_change_acl('alpha', 'founder@example.test', 'email', 'founder', 'grant')::text
      FROM cfg;
    `);
    assert.match(granted, /"ok": true/);

    const held = psql(`
      WITH cfg AS (SELECT set_config('app.actor_email', 'founder@example.test', false) AS email)
      SELECT public.bootstrap_os_held_label('alpha')::text FROM cfg;
    `).trim();
    assert.equal(held, "true");
    const opened = psql(`
      WITH cfg AS (SELECT set_config('app.actor_email', 'founder@example.test', false) AS email)
      SELECT public.bootstrap_os_get_journey('alpha', NULL)::text FROM cfg;
    `);
    assert.match(opened, /"ok": true/);
    assert.match(opened, /"slug": "alpha"/);

    const editor = psql(`
      WITH cfg AS (SELECT set_config('app.actor_email', 'editor@example.test', false) AS email)
      SELECT public.bootstrap_os_change_acl('alpha', 'extra@example.test', 'email', 'commenter', 'grant') ->> 'error'
      FROM cfg;
    `).trim();
    assert.equal(editor, "forbidden_role");
    const editorMessage = psql(`
      WITH cfg AS (SELECT set_config('app.actor_email', 'editor@example.test', false) AS email)
      SELECT public.bootstrap_os_change_acl('alpha', 'extra@example.test', 'email', 'commenter', 'grant') ->> 'message'
      FROM cfg;
    `).trim();
    assert.equal(editorMessage, "Only board owners can change roles.");
    const commenter = psql(`
      WITH cfg AS (SELECT set_config('app.actor_email', 'commenter@example.test', false) AS email)
      SELECT public.bootstrap_os_change_acl('alpha', 'extra@example.test', 'email', 'commenter', 'grant') ->> 'error'
      FROM cfg;
    `).trim();
    assert.equal(commenter, "forbidden_role");

    const sandbox = psql(`
      WITH cfg AS (SELECT set_config('app.actor_email', 'owner@example.test', false) AS email)
      SELECT public.bootstrap_os_change_acl('sandbox', 'founder@example.test', 'email', 'founder', 'grant') ->> 'error'
      FROM cfg;
    `).trim();
    assert.equal(sandbox, "sandbox_cannot_share");

    const sub = psql(`
      WITH cfg AS (SELECT set_config('app.actor_email', 'owner@example.test', false) AS email)
      SELECT public.bootstrap_os_change_acl('alpha', 'sub-founder', 'sub', 'founder', 'grant')::text FROM cfg;
    `);
    assert.match(sub, /"ok": true/);
    const subLabels = psql(`
      SELECT count(*)::text FROM public.bootstrap_company_labels WHERE label = 'alpha' AND mentee_id IN (
        SELECT id FROM public.bootstrap_mcp_mentees WHERE email = 'sub-founder'
      );
    `).trim();
    assert.equal(subLabels, "0");

    const revoked = psql(`
      WITH cfg AS (SELECT set_config('app.actor_email', 'owner@example.test', false) AS email)
      SELECT public.bootstrap_os_change_acl('alpha', 'founder@example.test', 'email', 'founder', 'revoke')::text
      FROM cfg;
    `);
    assert.match(revoked, /"ok": true/);
    const heldAfter = psql(`
      WITH cfg AS (SELECT set_config('app.actor_email', 'founder@example.test', false) AS email)
      SELECT public.bootstrap_os_held_label('alpha')::text FROM cfg;
    `).trim();
    assert.equal(heldAfter, "false");
    const closed = psql(`
      CREATE OR REPLACE FUNCTION pg_temp.journey_or_closed() RETURNS text LANGUAGE plpgsql AS $fn$
      DECLARE body jsonb;
      BEGIN
        PERFORM set_config('app.actor_email', 'founder@example.test', false);
        body := public.bootstrap_os_get_journey('alpha', NULL);
        RETURN body ->> 'ok';
      EXCEPTION WHEN OTHERS THEN
        RETURN SQLERRM;
      END $fn$;
      SELECT pg_temp.journey_or_closed();
    `).trim();
    assert.match(closed, /company not visible/);
    assert.equal(closed.includes("\"ok\": true"), false);

    psql(`
      INSERT INTO bootstrap_os.companies (id, slug, label)
      VALUES ('66666666-6666-4666-8666-666666666666', 'solo', 'Solo');
      INSERT INTO public.bootstrap_company_labels (mentee_id, label)
      VALUES ('33333333-3333-4333-8333-333333333333', 'solo');
      INSERT INTO bootstrap_os.company_acl (company_id, principal, principal_kind, role)
      VALUES ('66666666-6666-4666-8666-666666666666', 'owner@example.test', 'email', 'owner');
    `);
    const selfRevoke = psql(`
      WITH cfg AS (SELECT set_config('app.actor_email', 'owner@example.test', false) AS email)
      SELECT public.bootstrap_os_change_acl('solo', 'owner@example.test', 'email', 'owner', 'revoke')::text
      FROM cfg;
    `);
    assert.match(selfRevoke, /last_owner/);
    assert.equal(
      psql("SELECT count(*)::text FROM bootstrap_os.company_acl WHERE company_id = '66666666-6666-4666-8666-666666666666';").trim(),
      "1",
    );

    psql(`
      INSERT INTO public.bootstrap_mcp_mentees (email) VALUES ('keeper@example.test') ON CONFLICT (email) DO NOTHING;
      INSERT INTO public.bootstrap_company_labels (mentee_id, label)
      SELECT id, 'alpha' FROM public.bootstrap_mcp_mentees WHERE email = 'keeper@example.test';
    `);
    const labelBefore = psql(`
      SELECT count(*)::text FROM public.bootstrap_company_labels l
      JOIN public.bootstrap_mcp_mentees m ON m.id = l.mentee_id
      WHERE m.email = 'keeper@example.test' AND l.label = 'alpha';
    `).trim();
    const noop = psql(`
      WITH cfg AS (SELECT set_config('app.actor_email', 'owner@example.test', false) AS email)
      SELECT public.bootstrap_os_change_acl('alpha', 'keeper@example.test', 'email', 'commenter', 'revoke')::text
      FROM cfg;
    `);
    assert.match(noop, /"ok": true/);
    const labelAfter = psql(`
      SELECT count(*)::text FROM public.bootstrap_company_labels l
      JOIN public.bootstrap_mcp_mentees m ON m.id = l.mentee_id
      WHERE m.email = 'keeper@example.test' AND l.label = 'alpha';
    `).trim();
    assert.equal(labelAfter, labelBefore);

    const clashAudits = psql(`
      SELECT count(*)::text FROM bootstrap_os.audit_events WHERE what_changed->>'via' = 'acl';
    `).trim();
    const clash = psql(`
      WITH cfg AS (SELECT set_config('app.actor_email', 'owner@example.test', false) AS email)
      SELECT public.bootstrap_os_change_acl('alpha', 'editor@example.test', 'email', 'advisor', 'grant')::text
      FROM cfg;
    `);
    assert.match(clash, /already has role editor; revoke first/);
    const clashAuditsAfter = psql(`
      SELECT count(*)::text FROM bootstrap_os.audit_events WHERE what_changed->>'via' = 'acl';
    `).trim();
    assert.equal(clashAuditsAfter, clashAudits);
    const sameRole = psql(`
      WITH cfg AS (SELECT set_config('app.actor_email', 'owner@example.test', false) AS email)
      SELECT public.bootstrap_os_change_acl('alpha', 'editor@example.test', 'email', 'editor', 'grant') ->> 'ok'
      FROM cfg;
    `).trim();
    assert.equal(sameRole, "true");

    psql(`
      INSERT INTO bootstrap_os.companies (id, slug, label)
      VALUES ('77777777-7777-4777-8777-777777777777', 'pair', 'Pair');
      INSERT INTO public.bootstrap_mcp_mentees (email) VALUES
        ('owner-a@example.test'), ('owner-b@example.test')
      ON CONFLICT (email) DO NOTHING;
      INSERT INTO public.bootstrap_company_labels (mentee_id, label)
      SELECT id, 'pair' FROM public.bootstrap_mcp_mentees
      WHERE email IN ('owner-a@example.test', 'owner-b@example.test');
      INSERT INTO bootstrap_os.company_acl (company_id, principal, principal_kind, role)
      SELECT '77777777-7777-4777-8777-777777777777', email, 'email', 'owner'
      FROM (VALUES ('owner-a@example.test'), ('owner-b@example.test')) AS v(email);
    `);
    const pairRevoke = psql(`
      WITH cfg AS (SELECT set_config('app.actor_email', 'owner-a@example.test', false) AS email)
      SELECT public.bootstrap_os_change_acl('pair', 'owner-b@example.test', 'email', 'owner', 'revoke') ->> 'ok'
      FROM cfg;
    `).trim();
    assert.equal(pairRevoke, "true");
    assert.equal(
      psql("SELECT count(*)::text FROM bootstrap_os.company_acl WHERE company_id = '77777777-7777-4777-8777-777777777777';").trim(),
      "1",
    );

    psql(`
      CREATE OR REPLACE FUNCTION bootstrap_os.rank_of(p_role text) RETURNS int LANGUAGE sql AS $$
        SELECT CASE p_role
          WHEN 'founder' THEN 5 WHEN 'owner' THEN 4
          WHEN 'founder_authorized' THEN 3 WHEN 'editor' THEN 3
          ELSE 2 END;
      $$;
    `);
    const above = psql(`
      WITH cfg AS (SELECT set_config('app.actor_email', 'owner@example.test', false) AS email)
      SELECT public.bootstrap_os_change_acl('alpha', 'above@example.test', 'email', 'founder', 'grant') ->> 'message'
      FROM cfg;
    `).trim();
    assert.equal(above, "You cannot grant a role above your own.");

    const audits = psql(`
      SELECT string_agg(what_changed->>'op', ',' ORDER BY at)
      FROM bootstrap_os.audit_events
      WHERE what_changed->>'via' = 'acl'
        AND what_changed->>'principal_kind' = 'email'
        AND what_changed->>'role' = 'founder';
    `).trim();
    assert.equal(audits, "grant,revoke");
  });

  it("two sessions revoking each other leave exactly one owner", async () => {
    if (!fs.existsSync(path.join(BIN, "initdb"))) return;
    psql(`
      CREATE OR REPLACE FUNCTION bootstrap_os.rank_of(p_role text) RETURNS int LANGUAGE sql AS $$
        SELECT CASE p_role
          WHEN 'founder' THEN 4 WHEN 'owner' THEN 4
          WHEN 'founder_authorized' THEN 3 WHEN 'editor' THEN 3
          ELSE 2 END;
      $$;
      INSERT INTO public.bootstrap_mcp_mentees (email) VALUES
        ('race-a@example.test'), ('race-b@example.test')
      ON CONFLICT (email) DO NOTHING;
      INSERT INTO public.bootstrap_company_labels (mentee_id, label)
      SELECT id, 'alpha' FROM public.bootstrap_mcp_mentees
      WHERE email IN ('race-a@example.test', 'race-b@example.test')
      ON CONFLICT DO NOTHING;
      INSERT INTO bootstrap_os.company_acl (company_id, principal, principal_kind, role)
      SELECT '11111111-1111-4111-8111-111111111111', email, 'email', 'owner'
      FROM (VALUES ('race-a@example.test'), ('race-b@example.test')) AS v(email);
    `);
    const probe = psql(`
      WITH cfg AS (SELECT set_config('app.actor_email', 'race-a@example.test', false) AS email)
      SELECT public.bootstrap_os_held_label('alpha')::text || ' ' ||
        (SELECT count(*)::text FROM bootstrap_os.company_acl
          WHERE company_id = '11111111-1111-4111-8111-111111111111'
            AND principal IN ('race-a@example.test', 'race-b@example.test'))
      FROM cfg;
    `).trim();
    assert.equal(probe, "true 2", probe);
    const sqlFor = (actor, other) => `
      WITH cfg AS (SELECT set_config('app.actor_email', '${actor}', false) AS email)
      SELECT public.bootstrap_os_change_acl('alpha', '${other}', 'email', 'owner', 'revoke')::text
      FROM cfg;
    `;
    const run = (sql) =>
      new Promise((resolve) => {
        const file = path.join(dataDir, `race-${process.hrtime.bigint()}.sql`);
        fs.writeFileSync(file, sql);
        const child = spawn(
          psqlBin,
          ["-h", dataDir, "-p", port, "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", file],
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
        child.on("close", (code) => resolve({ code, stdout, stderr }));
      });
    const [left, right] = await Promise.all([
      run(sqlFor("race-a@example.test", "race-b@example.test")),
      run(sqlFor("race-b@example.test", "race-a@example.test")),
    ]);
    const combined = `${left.stdout}\n${left.stderr}\n${right.stdout}\n${right.stderr}`;
    const oks = (combined.match(/"ok": true/g) || []).length;
    assert.equal(oks, 1, combined);
    assert.equal(
      psql("SELECT count(*)::text FROM bootstrap_os.company_acl WHERE company_id = '11111111-1111-4111-8111-111111111111' AND principal IN ('race-a@example.test', 'race-b@example.test');").trim(),
      "1",
    );
    psqlFile(path.join(__dirname, "..", "supabase", "rollbacks", "20261114_bootstrap_os_change_acl_label.sql"));
    const restored = psql("SELECT pg_get_functiondef('public.bootstrap_os_change_acl(text,text,text,text,text)'::regprocedure);");
    assert.match(restored, /bootstrap_os_grant_acl_internal\(cid, v_principal, v_role, false\)/);
    assert.match(restored, /has_rank\(cid, 3\)/);
    const priv = psql(`
      SELECT has_function_privilege('anon', 'public.bootstrap_os_change_acl(text,text,text,text,text)', 'execute')::text
        || ' ' ||
        has_function_privilege('authenticated', 'public.bootstrap_os_change_acl(text,text,text,text,text)', 'execute')::text;
    `).trim();
    assert.equal(priv, "false true");
  });
});

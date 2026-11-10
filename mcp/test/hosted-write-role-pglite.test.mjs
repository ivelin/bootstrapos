/**
 * Isolated PGlite. Never supabase-pirin-ai. Fictional @example.invalid addresses only.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrations = path.join(__dirname, "..", "supabase", "migrations");
const UP_156 = fs.readFileSync(path.join(migrations, "20261110_bootstrap_os_ensure_company_founder_email.sql"), "utf8");
const UP = fs.readFileSync(path.join(migrations, "20261111_bootstrap_os_hosted_write_role_enforcement.sql"), "utf8");

const EDIT = "Your role on this board can comment, but not edit. Ask the founder to invite you to edit.";
const COMMENT = "Your role on this board cannot comment.";

const HARNESS = `
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS bootstrap_os;
CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN coalesce(current_setting('request.jwt.claims', true), '') <> ''
      THEN current_setting('request.jwt.claims', true)::jsonb
    ELSE jsonb_build_object(
      'email', NULLIF(current_setting('app.actor_email', true), ''),
      'sub', NULLIF(current_setting('app.actor_sub', true), '')
    )
  END;
$$;
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(auth.jwt() ->> 'sub', '')::uuid;
$$;
DO $$ BEGIN
  CREATE TYPE bootstrap_os.gate_decision AS ENUM ('advance', 'iterate', 'hold', 'kill');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE TABLE bootstrap_os.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  label text NOT NULL,
  founder text
);
CREATE TABLE bootstrap_os.company_acl (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES bootstrap_os.companies (id) ON DELETE CASCADE,
  principal text NOT NULL,
  principal_kind text NOT NULL,
  role text NOT NULL,
  CONSTRAINT company_acl_unique UNIQUE (company_id, principal, principal_kind)
);
CREATE TABLE bootstrap_os.ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES bootstrap_os.companies (id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  journey_phase smallint NOT NULL,
  loop_stage smallint NOT NULL,
  current_gate bootstrap_os.gate_decision NOT NULL DEFAULT 'hold',
  scoreboard jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, slug)
);
CREATE TABLE bootstrap_os.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  idea_id uuid,
  at timestamptz NOT NULL DEFAULT now(),
  who text NOT NULL,
  client text NOT NULL,
  what_changed jsonb NOT NULL
);
CREATE TABLE bootstrap_os.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id uuid NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  body text NOT NULL,
  who text NOT NULL
);
CREATE TABLE bootstrap_os.gate_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id uuid,
  at timestamptz NOT NULL DEFAULT now(),
  action text,
  why text,
  who text
);
CREATE TABLE bootstrap_os.board_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  idea_id uuid,
  principal text NOT NULL,
  principal_kind text NOT NULL,
  webhook_url text,
  email_opt_in boolean NOT NULL DEFAULT false,
  created_by text
);
CREATE TABLE public.bootstrap_mcp_mentees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  auth_user_id uuid UNIQUE
);
CREATE TABLE public.bootstrap_company_labels (
  mentee_id uuid NOT NULL REFERENCES public.bootstrap_mcp_mentees (id),
  label text NOT NULL,
  CONSTRAINT bootstrap_company_labels_unique UNIQUE (mentee_id, label)
);
CREATE TABLE public.bootstrap_os_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mentee_id uuid NOT NULL REFERENCES public.bootstrap_mcp_mentees (id),
  role text NOT NULL,
  revoked_at timestamptz
);
CREATE TABLE public.bootstrap_request_cap (
  name text PRIMARY KEY,
  max_value int NOT NULL
);
INSERT INTO public.bootstrap_request_cap (name, max_value) VALUES ('comment_body_bytes', 4096);
CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text
);
CREATE OR REPLACE FUNCTION public.bootstrap_os_held_label(p_company text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bootstrap_mcp_mentees m
    JOIN public.bootstrap_company_labels l ON l.mentee_id = m.id
    WHERE l.label = lower(p_company)
      AND (
        m.email = NULLIF(lower(auth.jwt() ->> 'email'), '')
        OR m.auth_user_id::text = NULLIF(auth.jwt() ->> 'sub', '')
      )
  );
$$;
CREATE OR REPLACE FUNCTION bootstrap_os.actor_email()
RETURNS text LANGUAGE sql STABLE AS $$ SELECT NULLIF(lower(auth.jwt() ->> 'email'), ''); $$;
CREATE OR REPLACE FUNCTION bootstrap_os.actor_sub()
RETURNS text LANGUAGE sql STABLE AS $$ SELECT NULLIF(auth.jwt() ->> 'sub', ''); $$;
CREATE OR REPLACE FUNCTION bootstrap_os.actor_principal()
RETURNS text LANGUAGE sql STABLE AS $$ SELECT COALESCE(bootstrap_os.actor_email(), bootstrap_os.actor_sub()); $$;
CREATE OR REPLACE FUNCTION bootstrap_os.rank_of(p_role text)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_role
    WHEN 'founder' THEN 4 WHEN 'owner' THEN 4
    WHEN 'founder_authorized' THEN 3 WHEN 'editor' THEN 3
    WHEN 'advisor' THEN 2 WHEN 'mentor' THEN 2 WHEN 'commenter' THEN 2
    WHEN 'viewer' THEN 1 ELSE 0 END;
$$;
CREATE OR REPLACE FUNCTION bootstrap_os.emit_audit(uuid, uuid, text, text, jsonb)
RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;
CREATE OR REPLACE FUNCTION bootstrap_os.notify_bundle(uuid, uuid, text)
RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE OR REPLACE FUNCTION bootstrap_os.idea_board_snapshot(smallint, smallint, bootstrap_os.gate_decision, jsonb)
RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE OR REPLACE FUNCTION bootstrap_os.portfolio_view(uuid)
RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE OR REPLACE FUNCTION bootstrap_os.read_portfolio_score(jsonb)
RETURNS jsonb LANGUAGE sql AS $$ SELECT NULL::jsonb $$;
CREATE OR REPLACE FUNCTION public.bootstrap_hosted_take(text)
RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"ok":true}'::jsonb $$;
CREATE OR REPLACE FUNCTION public.bootstrap_os_starter_is_sandbox(text)
RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE OR REPLACE FUNCTION bootstrap_os.subscriber_is_acl_member(uuid, text, text)
RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE OR REPLACE FUNCTION bootstrap_os.require_actor()
RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;
CREATE OR REPLACE FUNCTION bootstrap_os.resolved_actor_email()
RETURNS text LANGUAGE sql AS $$ SELECT bootstrap_os.actor_email() $$;
CREATE OR REPLACE FUNCTION bootstrap_os.resolved_actor_sub()
RETURNS text LANGUAGE sql AS $$ SELECT bootstrap_os.actor_sub() $$;
CREATE FUNCTION public.bootstrap_os_ensure_company(text) RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
CREATE FUNCTION public.bootstrap_os_put_journey(text, text, text, boolean, int, int, text, text, text, jsonb, text)
RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
`;

let db;

async function asEmail(email, sub) {
  await db.query("SELECT set_config('app.actor_email', $1, false)", [email]);
  await db.query("SELECT set_config('app.actor_sub', $1, false)", [sub ?? ""]);
  await db.query("SELECT set_config('request.jwt.claims', '', false)");
}

async function phase(slug) {
  const rows = await db.query(
    `SELECT i.journey_phase AS phase
     FROM bootstrap_os.ideas i
     JOIN bootstrap_os.companies c ON c.id = i.company_id
     WHERE c.slug = $1 AND i.slug = 'default'`,
    [slug],
  );
  return rows.rows[0]?.phase;
}

async function ideaCount(slug) {
  const rows = await db.query(
    `SELECT count(*)::int AS n
     FROM bootstrap_os.ideas i
     JOIN bootstrap_os.companies c ON c.id = i.company_id
     WHERE c.slug = $1`,
    [slug],
  );
  return rows.rows[0].n;
}

describe("hosted write-role gates (PGlite)", { concurrency: false }, () => {
  before(async () => {
    db = new PGlite();
    await db.exec(HARNESS);
    await db.exec(UP_156);
    await db.exec(UP);
    await db.exec(`
      INSERT INTO bootstrap_os.companies (slug, label) VALUES ('alpha', 'alpha');
      INSERT INTO bootstrap_os.ideas (company_id, slug, name, journey_phase, loop_stage, current_gate, scoreboard)
      SELECT id, 'default', 'alpha', 1, 1, 'hold', '{"schema_version":1}'::jsonb
      FROM bootstrap_os.companies WHERE slug = 'alpha';
      INSERT INTO public.bootstrap_mcp_mentees (email) VALUES
        ('founder@example.invalid'),
        ('owner@example.invalid'),
        ('editor@example.invalid'),
        ('fa@example.invalid'),
        ('commenter@example.invalid'),
        ('advisor@example.invalid'),
        ('mentor@example.invalid'),
        ('viewer@example.invalid'),
        ('label@example.invalid'),
        ('super@example.invalid'),
        ('stranger@example.invalid');
      INSERT INTO public.bootstrap_company_labels (mentee_id, label)
      SELECT id, 'alpha' FROM public.bootstrap_mcp_mentees
      WHERE email <> 'stranger@example.invalid';
      INSERT INTO bootstrap_os.company_acl (company_id, principal, principal_kind, role)
      SELECT c.id, m.email, 'email', m.role
      FROM bootstrap_os.companies c
      JOIN (VALUES
        ('founder@example.invalid', 'founder'),
        ('owner@example.invalid', 'owner'),
        ('editor@example.invalid', 'editor'),
        ('fa@example.invalid', 'founder_authorized'),
        ('commenter@example.invalid', 'commenter'),
        ('advisor@example.invalid', 'advisor'),
        ('mentor@example.invalid', 'mentor'),
        ('viewer@example.invalid', 'viewer'),
        ('super@example.invalid', 'commenter')
      ) AS m(email, role) ON true
      WHERE c.slug = 'alpha';
      INSERT INTO public.bootstrap_os_roles (mentee_id, role)
      SELECT id, 'super_admin' FROM public.bootstrap_mcp_mentees WHERE email = 'super@example.invalid';
    `);
  });

  after(async () => {
    await db?.close();
  });

  it("denies a commenter put_journey and create_idea and writes nothing", async () => {
    await asEmail("commenter@example.invalid");
    const beforeIdeas = await ideaCount("alpha");
    const put = await db.query(
      "SELECT public.bootstrap_os_put_journey('alpha', 'default', 'nope', true, 3, NULL, NULL, 'later', NULL, NULL, NULL, NULL) AS body",
    );
    assert.equal(put.rows[0].body.error, "forbidden_role");
    assert.equal(put.rows[0].body.message, EDIT);
    assert.equal(await phase("alpha"), 1);
    const idea = await db.query(
      "SELECT public.bootstrap_os_create_idea('alpha', 'side', 'Side', true, 'because') AS body",
    );
    assert.equal(idea.rows[0].body.error, "forbidden_role");
    assert.equal(await ideaCount("alpha"), beforeIdeas);
  });

  it("lets a commenter post_comment and denies a viewer", async () => {
    await asEmail("commenter@example.invalid");
    const posted = await db.query(
      "SELECT public.bootstrap_os_post_comment('alpha', 'default', 'a note') AS body",
    );
    assert.equal(posted.rows[0].body.ok, true);
    await asEmail("viewer@example.invalid");
    const denied = await db.query(
      "SELECT public.bootstrap_os_post_comment('alpha', 'default', 'no') AS body",
    );
    assert.equal(denied.rows[0].body.error, "forbidden_role");
    assert.equal(denied.rows[0].body.message, COMMENT);
  });

  it("lets editor, owner, founder, and founder_authorized write", async () => {
    for (const email of ["editor@example.invalid", "owner@example.invalid", "founder@example.invalid", "fa@example.invalid"]) {
      await asEmail(email);
      const put = await db.query(
        "SELECT public.bootstrap_os_put_journey('alpha', 'default', 'yes', false, NULL, NULL, NULL, $1, NULL, NULL, NULL, NULL) AS body",
        [`note ${email}`],
      );
      assert.equal(put.rows[0].body.ok, true, email);
    }
  });

  it("denies a non-member with company not visible and writes nothing", async () => {
    await asEmail("stranger@example.invalid");
    const before = await db.query("SELECT count(*)::int AS n FROM bootstrap_os.companies");
    await assert.rejects(
      db.query("SELECT public.bootstrap_os_put_journey('alpha', 'default', 'x', false, NULL, NULL, NULL, 'z', NULL, NULL, NULL, NULL)"),
      /company not visible/,
    );
    const after = await db.query("SELECT count(*)::int AS n FROM bootstrap_os.companies");
    assert.equal(after.rows[0].n, before.rows[0].n);
    const missing = await db.query("SELECT public.bootstrap_os_get_journey('missingco', NULL) AS body");
    assert.equal(missing.rows[0].body.error, "not_found");
    assert.equal(missing.rows[0].body.message, "Board not found.");
    assert.notEqual(missing.rows[0].body.error, "forbidden_role");
  });

  it("denies super_admin commenter and label-only on rank-3 writes and allows comments", async () => {
    await asEmail("super@example.invalid");
    const denied = await db.query(
      "SELECT public.bootstrap_os_put_journey('alpha', 'default', 'admin', false, NULL, NULL, NULL, 'no', NULL, NULL, NULL, NULL) AS body",
    );
    assert.equal(denied.rows[0].body.error, "forbidden_role");
    const noted = await db.query(
      "SELECT public.bootstrap_os_post_comment('alpha', 'default', 'super note') AS body",
    );
    assert.equal(noted.rows[0].body.ok, true);
    await asEmail("label@example.invalid");
    const labelDenied = await db.query(
      "SELECT public.bootstrap_os_create_idea('alpha', 'lab', 'Lab', true, 'because') AS body",
    );
    assert.equal(labelDenied.rows[0].body.error, "forbidden_role");
    const labelNote = await db.query(
      "SELECT public.bootstrap_os_post_comment('alpha', 'default', 'label note') AS body",
    );
    assert.equal(labelNote.rows[0].body.ok, true);
    await db.exec(`
      INSERT INTO bootstrap_os.company_acl (company_id, principal, principal_kind, role)
      SELECT id, 'super@example.invalid', 'email', 'editor'
      FROM bootstrap_os.companies WHERE slug = 'alpha'
      ON CONFLICT (company_id, principal, principal_kind) DO UPDATE SET role = 'editor';
    `);
    await asEmail("super@example.invalid");
    const allowed = await db.query(
      "SELECT public.bootstrap_os_put_journey('alpha', 'default', 'invited', false, NULL, NULL, NULL, 'editor now', NULL, NULL, NULL, NULL) AS body",
    );
    assert.equal(allowed.rows[0].body.ok, true);
  });

  it("seeds the first clocks on a new board and denies the admin second write", async () => {
    await asEmail("admin@example.invalid");
    const first = await db.query(
      "SELECT public.bootstrap_os_put_journey('q3co', 'default', 'seed clocks', true, 2, NULL, NULL, 'week one', NULL, NULL, NULL, 'founder@example.invalid') AS body",
    );
    assert.equal(first.rows[0].body.ok, true, JSON.stringify(first.rows[0].body));
    assert.equal(await phase("q3co"), 2);
    const roles = await db.query(
      `SELECT a.principal, a.role
       FROM bootstrap_os.company_acl a
       JOIN bootstrap_os.companies c ON c.id = a.company_id
       WHERE c.slug = 'q3co'
       ORDER BY a.principal`,
    );
    assert.deepEqual(roles.rows, [
      { principal: "admin@example.invalid", role: "commenter" },
      { principal: "founder@example.invalid", role: "founder" },
    ]);
    const second = await db.query(
      "SELECT public.bootstrap_os_put_journey('q3co', 'default', 'again', false, 3, NULL, NULL, 'no', NULL, NULL, NULL, NULL) AS body",
    );
    assert.equal(second.rows[0].body.error, "forbidden_role");
    assert.equal(second.rows[0].body.message, EDIT);
    assert.equal(await phase("q3co"), 2);
  });

  it("gates each of the nine board write RPCs", async () => {
    await asEmail("commenter@example.invalid");
    const calls = [
      "SELECT public.bootstrap_os_put_journey('alpha', 'default', 'no', false, NULL, NULL, NULL, 'x', NULL, NULL, NULL, NULL) AS body",
      "SELECT public.bootstrap_os_create_idea('alpha', 'nine', 'Nine', true, 'because') AS body",
      "SELECT public.bootstrap_os_put_portfolio_score('alpha', 'default', 3, 3, 3, 'because', true) AS body",
      "SELECT public.bootstrap_os_change_acl('alpha', 'new@example.invalid', 'email', 'advisor', 'grant') AS body",
      "SELECT public.bootstrap_os_subscribe_board('alpha', NULL, 'commenter@example.invalid', 'email', 'https://hooks.example.invalid/a', false) AS body",
      "SELECT public.bootstrap_os_unsubscribe_board('alpha', NULL, 'commenter@example.invalid', 'email') AS body",
      "SELECT public.bootstrap_os_invite_create('invitee@example.invalid', '[{\"slug\":\"alpha\",\"role\":\"viewer\"}]'::jsonb) AS body",
    ];
    for (const sql of calls) {
      const hit = await db.query(sql);
      const body = hit.rows[0].body;
      if (sql.includes("invite_create")) {
        assert.equal(body.ok, false);
        assert.equal(body.reason, "invite_partial_authority");
        assert.equal(body.denied[0].reason, "tier_forbidden");
      } else {
        assert.equal(body.error, "forbidden_role", sql);
      }
    }
    await asEmail("label@example.invalid", "11111111-1111-1111-1111-111111111111");
    await db.exec(`
      INSERT INTO auth.users (id, email)
      VALUES ('11111111-1111-1111-1111-111111111111', 'label@example.invalid');
      UPDATE public.bootstrap_mcp_mentees
      SET auth_user_id = '11111111-1111-1111-1111-111111111111'
      WHERE email = 'label@example.invalid';
    `);
    await db.query("SELECT set_config('request.jwt.claims', '', false)");
    const invited = await db.query(
      "SELECT public.bootstrap_mcp_invite_member('newcomer@example.invalid', 'alpha') AS body",
    );
    assert.equal(invited.rows[0].body.error, "forbidden_role");
    await asEmail("viewer@example.invalid");
    const comment = await db.query(
      "SELECT public.bootstrap_os_post_comment('alpha', 'default', 'viewer') AS body",
    );
    assert.equal(comment.rows[0].body.error, "forbidden_role");
    assert.equal(comment.rows[0].body.message, COMMENT);
  });

  it("drops the ensure_company auto-grant", async () => {
    const def = await db.query(
      "SELECT pg_get_functiondef('public.bootstrap_os_ensure_company(text,text,boolean)'::regprocedure) AS body",
    );
    assert.equal(def.rows[0].body.includes("founder_authorized"), false);
  });
});

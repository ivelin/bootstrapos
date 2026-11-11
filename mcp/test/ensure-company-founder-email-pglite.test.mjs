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
const UP = fs.readFileSync(
  path.join(migrations, "20261110_bootstrap_os_ensure_company_founder_email.sql"),
  "utf8",
);
const WRITE_ROLE = fs.readFileSync(
  path.join(migrations, "20261111_bootstrap_os_hosted_write_role_enforcement.sql"),
  "utf8",
);
const FOUNDER_INVITE = fs.readFileSync(
  path.join(migrations, "20261112_bootstrap_os_founder_invite_on_create.sql"),
  "utf8",
);

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
  CONSTRAINT company_acl_unique UNIQUE (company_id, principal, principal_kind),
  CONSTRAINT company_acl_role_tiers CHECK (role IN (
    'founder', 'owner', 'founder_authorized', 'editor',
    'advisor', 'mentor', 'commenter', 'viewer'
  ))
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
  who text NOT NULL,
  client text NOT NULL,
  what_changed jsonb NOT NULL
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
  revoked_at timestamptz,
  granted_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text,
  email_confirmed_at timestamptz
);
CREATE OR REPLACE FUNCTION public.bootstrap_os_held_label(p_company text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, bootstrap_os AS $$
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
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(lower(auth.jwt() ->> 'email'), '');
$$;
CREATE OR REPLACE FUNCTION bootstrap_os.actor_sub()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(auth.jwt() ->> 'sub', '');
$$;
CREATE OR REPLACE FUNCTION bootstrap_os.actor_principal()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(bootstrap_os.actor_email(), bootstrap_os.actor_sub());
$$;
CREATE OR REPLACE FUNCTION bootstrap_os.rank_of(p_role text)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_role
    WHEN 'founder' THEN 4
    WHEN 'owner' THEN 4
    WHEN 'founder_authorized' THEN 3
    WHEN 'editor' THEN 3
    WHEN 'advisor' THEN 2
    WHEN 'mentor' THEN 2
    WHEN 'commenter' THEN 2
    WHEN 'viewer' THEN 1
    ELSE 0
  END;
$$;
CREATE OR REPLACE FUNCTION bootstrap_os.has_role(p_company_id uuid, VARIADIC p_roles text[])
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM bootstrap_os.company_acl a
    WHERE a.company_id = p_company_id
      AND a.role = ANY (p_roles)
      AND (
        (a.principal_kind = 'email' AND a.principal = bootstrap_os.actor_email())
        OR (a.principal_kind = 'sub' AND a.principal = bootstrap_os.actor_sub())
      )
  );
$$;
CREATE OR REPLACE FUNCTION bootstrap_os.emit_audit(uuid, uuid, text, text, jsonb)
RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;
CREATE OR REPLACE FUNCTION public.bootstrap_os_starter_is_sandbox(text)
RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION public.bootstrap_os_ensure_company(p_company text)
RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
`;

let db;

async function asEmail(email) {
  await db.query("SELECT set_config('app.actor_email', $1, false)", [email]);
  await db.query("SELECT set_config('request.jwt.claims', '', false)");
}

async function roles(slug) {
  const rows = await db.query(
    `SELECT a.principal, a.role
     FROM bootstrap_os.company_acl a
     JOIN bootstrap_os.companies c ON c.id = a.company_id
     WHERE c.slug = $1
     ORDER BY a.principal`,
    [slug],
  );
  return rows.rows;
}

async function labeled(email, slug) {
  const rows = await db.query(
    `SELECT 1 AS ok
     FROM public.bootstrap_company_labels l
     JOIN public.bootstrap_mcp_mentees m ON m.id = l.mentee_id
     WHERE m.email = $1 AND l.label = $2`,
    [email, slug],
  );
  return rows.rows.length === 1;
}

describe("ensure_company founderEmail (PGlite, never prod)", { concurrency: false }, () => {
  before(async () => {
    db = new PGlite();
    await db.exec(HARNESS);
    await db.exec(UP);
    await db.exec(`
      ALTER TABLE bootstrap_os.audit_events ADD COLUMN at timestamptz NOT NULL DEFAULT now();
      CREATE TABLE bootstrap_os.comments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        idea_id uuid,
        at timestamptz NOT NULL DEFAULT now(),
        who text,
        body text
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
        company_id uuid,
        idea_id uuid,
        principal text,
        principal_kind text,
        webhook_url text,
        email_opt_in boolean,
        created_by text
      );
      CREATE TABLE public.bootstrap_request_cap (name text PRIMARY KEY, max_value int);
      CREATE OR REPLACE FUNCTION bootstrap_os.portfolio_view(uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
      CREATE OR REPLACE FUNCTION bootstrap_os.read_portfolio_score(jsonb) RETURNS jsonb LANGUAGE sql AS $$ SELECT NULL::jsonb $$;
      CREATE OR REPLACE FUNCTION bootstrap_os.notify_bundle(uuid, uuid, text) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
      CREATE OR REPLACE FUNCTION bootstrap_os.require_actor() RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;
      CREATE OR REPLACE FUNCTION bootstrap_os.resolved_actor_email() RETURNS text LANGUAGE sql AS $$ SELECT bootstrap_os.actor_email() $$;
      CREATE OR REPLACE FUNCTION bootstrap_os.resolved_actor_sub() RETURNS text LANGUAGE sql AS $$ SELECT bootstrap_os.actor_sub() $$;
      CREATE SCHEMA IF NOT EXISTS extensions;
      CREATE OR REPLACE FUNCTION extensions.gen_random_bytes(p_len integer)
      RETURNS bytea LANGUAGE sql AS $$
        SELECT substring(sha256(convert_to(gen_random_uuid()::text || clock_timestamp()::text, 'UTF8')) FROM 1 FOR p_len);
      $$;
      CREATE OR REPLACE FUNCTION public.bootstrap_mcp_hash_token(p_token text)
      RETURNS text LANGUAGE sql IMMUTABLE AS $$
        SELECT encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
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
      CREATE OR REPLACE FUNCTION public.bootstrap_hosted_take(text)
      RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"ok":true}'::jsonb $$;
    `);
    await db.exec(WRITE_ROLE);
    await db.exec(FOUNDER_INVITE);
  });

  after(async () => {
    await db?.close();
  });

  it("keeps a single ensure_company signature and denies anon and authenticated", async () => {
    const sigs = await db.query(
      `SELECT p.oid::regprocedure::text AS sig
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'bootstrap_os_ensure_company'`,
    );
    assert.deepEqual(sigs.rows.map((row) => row.sig), [
      "bootstrap_os_ensure_company(text,text,boolean)",
    ]);
    const priv = await db.query(
      `SELECT
         has_function_privilege('anon', 'public.bootstrap_os_ensure_company(text,text,boolean)', 'execute') AS anon_ensure,
         has_function_privilege('authenticated', 'public.bootstrap_os_ensure_company(text,text,boolean)', 'execute') AS auth_ensure,
         has_function_privilege('anon', 'public.bootstrap_os_grant_acl_internal(uuid,text,text,boolean)', 'execute') AS anon_help,
         has_function_privilege('authenticated', 'public.bootstrap_os_grant_acl_internal(uuid,text,text,boolean)', 'execute') AS auth_help`,
    );
    assert.equal(priv.rows[0].anon_ensure, false);
    assert.equal(priv.rows[0].auth_ensure, false);
    assert.equal(priv.rows[0].anon_help, false);
    assert.equal(priv.rows[0].auth_help, false);
  });

  it("one-arg ensure_company does not create; create flag seeds the caller as founder", async () => {
    await asEmail("solo@example.invalid");
    await assert.rejects(
      db.query("SELECT public.bootstrap_os_ensure_company($1)", ["soloco"]),
      /not_found/,
    );
    const created = await db.query(
      "SELECT public.bootstrap_os_ensure_company($1, NULL, true) AS id",
      ["soloco"],
    );
    assert.ok(created.rows[0].id);
    assert.deepEqual(await roles("soloco"), [{ principal: "solo@example.invalid", role: "founder" }]);
    assert.equal(await labeled("solo@example.invalid", "soloco"), true);
  });

  it("new board for a different founder mints one hashed invite and one email outbox row", async () => {
    await db.query(
      "INSERT INTO public.bootstrap_mcp_mentees (email) VALUES ('admin@example.invalid') ON CONFLICT (email) DO NOTHING",
    );
    await asEmail("admin@example.invalid");
    const created = await db.query(
      `SELECT public.bootstrap_os_put_journey(
         'alpha', 'default', 'open alpha', false,
         NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'founder@example.test'
       ) AS body`,
    );
    assert.equal(created.rows[0].body.ok, true, JSON.stringify(created.rows[0].body));
    assert.equal(created.rows[0].body.founderInvite.inviteeEmail, "founder@example.test");
    assert.equal(created.rows[0].body.founderInvite.companyWorkspace, "alpha");
    assert.equal(created.rows[0].body.notify, undefined);
    const token = created.rows[0].body.founderInvite.inviteToken;
    assert.match(token, /^inv_[0-9a-f]+$/);
    const invites = await db.query(
      "SELECT invitee_email, token_hash, company_label FROM public.bootstrap_mcp_invites WHERE company_label = 'alpha'",
    );
    assert.equal(invites.rows.length, 1);
    assert.equal(invites.rows[0].invitee_email, "founder@example.test");
    assert.notEqual(invites.rows[0].token_hash, token);
    const hashed = await db.query("SELECT public.bootstrap_mcp_hash_token($1) AS hash", [token]);
    assert.equal(invites.rows[0].token_hash, hashed.rows[0].hash);
    const outbox = await db.query(
      `SELECT o.channel, o.payload->>'inviteToken' AS token
       FROM public.bootstrap_mcp_invite_outbox o
       JOIN public.bootstrap_mcp_invites i ON i.id = o.invite_id
       WHERE i.company_label = 'alpha'
       ORDER BY o.channel`,
    );
    assert.deepEqual(
      outbox.rows.map((row) => row.channel),
      ["email", "in_chat"],
    );
    const email = outbox.rows.find((row) => row.channel === "email");
    const chat = outbox.rows.find((row) => row.channel === "in_chat");
    assert.equal(email.token, token);
    assert.equal(chat.token, null);
    const again = await db.query(
      `SELECT public.bootstrap_os_put_journey(
         'alpha', 'default', 'later write', false,
         NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'founder@example.test'
       ) AS body`,
    );
    assert.equal(again.rows[0].body.founderInvite, undefined);
    assert.notEqual(again.rows[0].body.founderInvite?.inviteToken, token);
    const still = await db.query(
      "SELECT count(*)::int AS n FROM public.bootstrap_mcp_invites WHERE company_label = 'alpha'",
    );
    assert.equal(still.rows[0].n, 1);
  });

  it("rotates one pending invite instead of failing the board create", async () => {
    await db.query(
      "INSERT INTO public.bootstrap_mcp_mentees (email) VALUES ('admin@example.invalid') ON CONFLICT (email) DO NOTHING",
    );
    const inviter = await db.query(
      "SELECT id FROM public.bootstrap_mcp_mentees WHERE email = 'admin@example.invalid'",
    );
    await db.query(
      `INSERT INTO public.bootstrap_mcp_invites (
         id, invitee_email, company_label, invited_by_mentee_id, invited_by_email, token_hash, expires_at
       ) VALUES (
         gen_random_uuid(), 'founder@example.test', 'echo', $1, 'admin@example.invalid', 'old-hash', now() + interval '1 day'
       )`,
      [inviter.rows[0].id],
    );
    await asEmail("admin@example.invalid");
    const created = await db.query(
      `SELECT public.bootstrap_os_put_journey(
         'echo', 'default', 'open echo', false,
         NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'founder@example.test'
       ) AS body`,
    );
    assert.equal(created.rows[0].body.ok, true, JSON.stringify(created.rows[0].body));
    const pending = await db.query(
      `SELECT token_hash FROM public.bootstrap_mcp_invites
       WHERE company_label = 'echo' AND invitee_email = 'founder@example.test' AND accepted_at IS NULL`,
    );
    assert.equal(pending.rows.length, 1);
    assert.notEqual(pending.rows[0].token_hash, "old-hash");
    const company = await db.query("SELECT id FROM bootstrap_os.companies WHERE slug = 'echo'");
    assert.equal(company.rows.length, 1);
  });

  it("skips the invite when the caller is over the limit or not on the allowlist", async () => {
    await db.query(
      "CREATE OR REPLACE FUNCTION public.bootstrap_hosted_take(text) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{\"ok\":false,\"error\":\"rate_limited\",\"reason\":\"rate_limited\"}'::jsonb $$",
    );
    await db.query(
      "INSERT INTO public.bootstrap_mcp_mentees (email) VALUES ('admin@example.invalid') ON CONFLICT (email) DO NOTHING",
    );
    await asEmail("admin@example.invalid");
    const limited = await db.query(
      `SELECT public.bootstrap_os_put_journey(
         'foxtrot', 'default', 'over the limit', false,
         NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'founder@example.test'
       ) AS body`,
    );
    assert.equal(limited.rows[0].body.ok, true, JSON.stringify(limited.rows[0].body));
    assert.equal(limited.rows[0].body.founderInvite.skipped, true);
    assert.equal(limited.rows[0].body.founderInvite.reason, "rate_limited");
    assert.equal(limited.rows[0].body.founderInvite.inviteToken, undefined);
    assert.equal(JSON.stringify(limited.rows[0].body.founderInvite).includes("@"), false);
    const limitedInvites = await db.query(
      "SELECT count(*)::int AS n FROM public.bootstrap_mcp_invites WHERE company_label = 'foxtrot'",
    );
    assert.equal(limitedInvites.rows[0].n, 0);
    await db.query(
      "CREATE OR REPLACE FUNCTION public.bootstrap_hosted_take(text) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{\"ok\":true}'::jsonb $$",
    );
    await asEmail("stranger@example.invalid");
    const denied = await db.query(
      `SELECT public.bootstrap_os_put_journey(
         'golf', 'default', 'not on the allowlist', false,
         NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'founder@example.test'
       ) AS body`,
    );
    assert.equal(denied.rows[0].body.ok, true, JSON.stringify(denied.rows[0].body));
    assert.equal(denied.rows[0].body.founderInvite.reason, "inviter_not_on_allowlist");
    assert.equal(JSON.stringify(denied.rows[0].body.founderInvite).includes("@"), false);
    const deniedInvites = await db.query(
      "SELECT count(*)::int AS n FROM public.bootstrap_mcp_invites WHERE company_label = 'golf'",
    );
    assert.equal(deniedInvites.rows[0].n, 0);
    const boards = await db.query(
      "SELECT slug FROM bootstrap_os.companies WHERE slug IN ('foxtrot', 'golf') ORDER BY slug",
    );
    assert.deepEqual(boards.rows.map((row) => row.slug), ["foxtrot", "golf"]);
  });

  it("does not mint for a padded or case-different self email, or when founderEmail is missing", async () => {
    await asEmail("founder@example.test");
    const padded = await db.query(
      `SELECT public.bootstrap_os_put_journey(
         'hotel', 'default', 'padded self', false,
         NULL, NULL, NULL, NULL, NULL, NULL, NULL, '  Founder@Example.Test '
       ) AS body`,
    );
    assert.equal(padded.rows[0].body.ok, true, JSON.stringify(padded.rows[0].body));
    assert.equal(padded.rows[0].body.founderInvite, undefined);
    await asEmail("founder@example.test");
    const missing = await db.query(
      `SELECT public.bootstrap_os_put_journey(
         'india', 'default', 'no founder email', false,
         NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
       ) AS body`,
    );
    assert.equal(missing.rows[0].body.ok, true, JSON.stringify(missing.rows[0].body));
    assert.equal(missing.rows[0].body.founderInvite, undefined);
    const invites = await db.query(
      "SELECT count(*)::int AS n FROM public.bootstrap_mcp_invites WHERE company_label IN ('hotel', 'india')",
    );
    assert.equal(invites.rows[0].n, 0);
  });

  it("self-create does not mint an invite", async () => {
    await asEmail("founder@example.test");
    const created = await db.query(
      `SELECT public.bootstrap_os_put_journey(
         'bravo', 'default', 'self board', false,
         NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'founder@example.test'
       ) AS body`,
    );
    assert.equal(created.rows[0].body.ok, true);
    assert.equal(created.rows[0].body.founderInvite, undefined);
    const invites = await db.query(
      "SELECT count(*)::int AS n FROM public.bootstrap_mcp_invites WHERE company_label = 'bravo'",
    );
    assert.equal(invites.rows[0].n, 0);
  });

  it("seeds founder and commenter when founderEmail differs from the caller", async () => {
    await asEmail("admin@example.invalid");
    await db.query("SELECT public.bootstrap_os_ensure_company($1, $2, true)", [
      "dualco",
      "Founder@example.invalid",
    ]);
    assert.deepEqual(await roles("dualco"), [
      { principal: "admin@example.invalid", role: "commenter" },
      { principal: "founder@example.invalid", role: "founder" },
    ]);
    assert.equal(await labeled("founder@example.invalid", "dualco"), true);
    assert.equal(await labeled("admin@example.invalid", "dualco"), true);
  });

  it("rejects a bad founder email and a super_admin with no founderEmail", async () => {
    await asEmail("bill@example.invalid");
    await db.exec(`
      INSERT INTO public.bootstrap_mcp_mentees (email)
      VALUES ('bill@example.invalid');
      INSERT INTO public.bootstrap_os_roles (mentee_id, role)
      SELECT id, 'super_admin' FROM public.bootstrap_mcp_mentees WHERE email = 'bill@example.invalid';
    `);
    await assert.rejects(
      db.query("SELECT public.bootstrap_os_ensure_company('billco', NULL, true)"),
      /founder_email_required/,
    );
    await assert.rejects(
      db.query("SELECT public.bootstrap_os_ensure_company('billco', 'not-an-email', true)"),
      /invalid_founder_email/,
    );
    const seeded = await db.query(
      "SELECT public.bootstrap_os_ensure_company('billco', 'founder@example.invalid', true) AS id",
    );
    assert.ok(seeded.rows[0].id);
    assert.deepEqual(await roles("billco"), [
      { principal: "bill@example.invalid", role: "commenter" },
      { principal: "founder@example.invalid", role: "founder" },
    ]);
  });

  it("label-only first touch does not insert founder_authorized and does not demote", async () => {
    await db.exec(`
      INSERT INTO bootstrap_os.companies (slug, label) VALUES ('heldco', 'heldco');
      INSERT INTO public.bootstrap_mcp_mentees (email) VALUES ('late@example.invalid');
      INSERT INTO public.bootstrap_company_labels (mentee_id, label)
      SELECT id, 'heldco' FROM public.bootstrap_mcp_mentees WHERE email = 'late@example.invalid';
      INSERT INTO bootstrap_os.company_acl (company_id, principal, principal_kind, role)
      SELECT id, 'founder@example.invalid', 'email', 'founder'
      FROM bootstrap_os.companies WHERE slug = 'heldco';
    `);
    await asEmail("late@example.invalid");
    await db.query("SELECT public.bootstrap_os_ensure_company('heldco', 'other@example.invalid')");
    assert.deepEqual(await roles("heldco"), [
      { principal: "founder@example.invalid", role: "founder" },
    ]);
    await db.exec(`
      INSERT INTO bootstrap_os.company_acl (company_id, principal, principal_kind, role)
      SELECT id, 'late@example.invalid', 'email', 'commenter'
      FROM bootstrap_os.companies WHERE slug = 'heldco';
    `);
    await db.query("SELECT public.bootstrap_os_ensure_company('heldco')");
    assert.deepEqual(await roles("heldco"), [
      { principal: "founder@example.invalid", role: "founder" },
      { principal: "late@example.invalid", role: "commenter" },
    ]);
  });

  it("change_acl grant then revoke still returns ok", async () => {
    await asEmail("solo@example.invalid");
    const granted = await db.query(
      "SELECT public.bootstrap_os_change_acl('soloco', 'advisor@example.invalid', 'email', 'advisor', 'grant') AS body",
    );
    assert.equal(granted.rows[0].body.ok, true);
    assert.equal(
      (await roles("soloco")).some((row) => row.principal === "advisor@example.invalid" && row.role === "advisor"),
      true,
    );
    const revoked = await db.query(
      "SELECT public.bootstrap_os_change_acl('soloco', 'advisor@example.invalid', 'email', 'advisor', 'revoke') AS body",
    );
    assert.equal(revoked.rows[0].body.ok, true);
    assert.equal(
      (await roles("soloco")).some((row) => row.principal === "advisor@example.invalid"),
      false,
    );
  });

  it("change_acl writes no label row", async () => {
    await asEmail("solo@example.invalid");
    const granted = await db.query(
      "SELECT public.bootstrap_os_change_acl('soloco', 'nolabel@example.invalid', 'email', 'advisor', 'grant') AS body",
    );
    assert.equal(granted.rows[0].body.ok, true);
    assert.equal(await labeled("nolabel@example.invalid", "soloco"), false);
  });

  it("read RPCs on an unknown slug return not_found and write nothing", async () => {
    await asEmail("reader@example.invalid");
    const before = await db.query(
      `SELECT
         (SELECT count(*)::int FROM bootstrap_os.companies) AS companies,
         (SELECT count(*)::int FROM bootstrap_os.company_acl) AS acl,
         (SELECT count(*)::int FROM public.bootstrap_company_labels) AS labels`,
    );
    for (const sql of [
      "SELECT public.bootstrap_os_get_journey('missingco', NULL) AS body",
      "SELECT public.bootstrap_os_list_subscribers('missingco') AS body",
      "SELECT public.bootstrap_os_list_killed_ideas('missingco') AS body",
    ]) {
      const hit = await db.query(sql);
      assert.equal(hit.rows[0].body.ok, false);
      assert.equal(hit.rows[0].body.error, "not_found");
      if (sql.includes("get_journey")) {
        assert.equal(hit.rows[0].body.message, "Board not found.");
      }
    }
    const after = await db.query(
      `SELECT
         (SELECT count(*)::int FROM bootstrap_os.companies) AS companies,
         (SELECT count(*)::int FROM bootstrap_os.company_acl) AS acl,
         (SELECT count(*)::int FROM public.bootstrap_company_labels) AS labels`,
    );
    assert.deepEqual(after.rows[0], before.rows[0]);
  });

  it("documents that held_label ignores auth.users.email_confirmed_at", async () => {
    const def = await db.query(
      "SELECT pg_get_functiondef('public.bootstrap_os_held_label(text)'::regprocedure) AS body",
    );
    assert.equal(def.rows[0].body.includes("email_confirmed_at"), false);
    await db.query(
      "INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'unconfirmed@example.invalid', NULL)",
    );
    await asEmail("unconfirmed@example.invalid");
    const unbound = await db.query("SELECT public.bootstrap_os_held_label('soloco') AS ok");
    assert.equal(unbound.rows[0].ok, false);
    await db.exec(`
      INSERT INTO public.bootstrap_mcp_mentees (email) VALUES ('unconfirmed@example.invalid');
      INSERT INTO public.bootstrap_company_labels (mentee_id, label)
      SELECT id, 'soloco' FROM public.bootstrap_mcp_mentees WHERE email = 'unconfirmed@example.invalid';
    `);
    const bound = await db.query("SELECT public.bootstrap_os_held_label('soloco') AS ok");
    assert.equal(bound.rows[0].ok, true);
  });
});

describe("founder ceiling vs commenter invite (PGlite)", { concurrency: false }, () => {
  let inviteDb;

  before(async () => {
    inviteDb = new PGlite();
    await inviteDb.exec(`
      DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE OR REPLACE FUNCTION auth.jwt()
      RETURNS jsonb LANGUAGE sql STABLE AS $$
        SELECT COALESCE(
          NULLIF(current_setting('request.jwt.claims', true), '')::jsonb,
          '{}'::jsonb
        );
      $$;
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('app.auth_uid', true), '')::uuid;
      $$;
    `);
    const journey = fs
      .readFileSync(path.join(migrations, "20260902_bootstrap_os_journey.sql"), "utf8")
      .replace(/CREATE EXTENSION IF NOT EXISTS pgcrypto;/, "-- pgcrypto built in");
    await inviteDb.exec(journey);
    await inviteDb.exec(fs.readFileSync(path.join(migrations, "20261029_bootstrap_os_scoped_invites.sql"), "utf8"));
    await inviteDb.exec(`
      CREATE TABLE public.bootstrap_mcp_mentees (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text NOT NULL UNIQUE,
        auth_user_id uuid UNIQUE
      );
      CREATE TABLE public.bootstrap_company_labels (
        mentee_id uuid NOT NULL REFERENCES public.bootstrap_mcp_mentees (id),
        label text NOT NULL,
        CONSTRAINT bootstrap_company_labels_unique UNIQUE (mentee_id, label),
        CONSTRAINT bootstrap_company_labels_slug CHECK (label ~ '^[a-z0-9][a-z0-9_-]{0,31}$')
      );
      CREATE TABLE public.bootstrap_os_roles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        mentee_id uuid NOT NULL,
        role text NOT NULL,
        revoked_at timestamptz
      );
      CREATE OR REPLACE FUNCTION public.bootstrap_os_held_label(p_company text)
      RETURNS boolean LANGUAGE sql STABLE AS $$
        SELECT EXISTS (
          SELECT 1 FROM public.bootstrap_mcp_mentees m
          JOIN public.bootstrap_company_labels l ON l.mentee_id = m.id
          WHERE l.label = lower(p_company)
            AND m.email = NULLIF(lower(auth.jwt() ->> 'email'), '')
        );
      $$;
      CREATE FUNCTION public.bootstrap_os_ensure_company(p_company text)
      RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    `);
    await inviteDb.exec(UP);
  });

  after(async () => {
    await inviteDb?.close();
  });

  async function invite(inviter, invitee, slug, role) {
    const rows = await inviteDb.query(
      `SELECT public.bootstrap_os_invite_create($2, $3::jsonb) AS body
       FROM (SELECT set_config('request.jwt.claims', $1, true)) cfg`,
      [
        JSON.stringify({ email: inviter, sub: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" }),
        invitee,
        JSON.stringify([{ slug, role }]),
      ],
    );
    return rows.rows[0].body;
  }

  it("founder invites an editor; commenter is tier_forbidden", async () => {
    await inviteDb.query("SELECT set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({ email: "owner@example.invalid" }),
    ]);
    await inviteDb.query("SELECT public.bootstrap_os_ensure_company('ownco', NULL, true)");
    const ok = await invite("owner@example.invalid", "editor@example.invalid", "ownco", "editor");
    assert.equal(ok.ok, true);
    assert.deepEqual(ok.companies, [{ slug: "ownco", role: "editor" }]);

    await inviteDb.query("SELECT set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({ email: "admin@example.invalid" }),
    ]);
    await inviteDb.query(
      "SELECT public.bootstrap_os_ensure_company('commentco', 'founder@example.invalid', true)",
    );
    const denied = await invite("admin@example.invalid", "editor@example.invalid", "commentco", "editor");
    assert.equal(denied.ok, false);
    assert.equal(denied.denied[0].reason, "tier_forbidden");
  });
});

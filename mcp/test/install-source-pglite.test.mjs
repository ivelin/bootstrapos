/**
 * Install path on signup. PGlite only. Never supabase-pirin-ai.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = path.join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20261031_bootstrap_mcp_install_source.sql",
);

const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";
const CAROL = "33333333-3333-4333-8333-333333333333";
const DAVE = "44444444-4444-4444-8444-444444444444";

let db;

async function signIn(uid, email) {
  await db.exec("RESET ROLE");
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [uid]);
  await db.query("SELECT set_config('request.jwt.claim.email', $1, false)", [email]);
  await db.exec("SET ROLE authenticated");
}

describe("install source (PGlite, never prod)", () => {
  before(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;
      DO $$ BEGIN CREATE ROLE authenticated NOINHERIT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE anon NOINHERIT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      CREATE TABLE auth.users (
        id uuid PRIMARY KEY,
        email text,
        email_confirmed_at timestamptz
      );
      CREATE OR REPLACE FUNCTION auth.uid()
      RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      CREATE OR REPLACE FUNCTION auth.jwt()
      RETURNS jsonb LANGUAGE sql STABLE AS $$
        SELECT jsonb_build_object(
          'email', NULLIF(current_setting('request.jwt.claim.email', true), ''),
          'sub', NULLIF(current_setting('request.jwt.claim.sub', true), '')
        )
      $$;
      CREATE TABLE public.bootstrap_mcp_mentees (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text NOT NULL UNIQUE,
        auth_user_id uuid UNIQUE,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE public.bootstrap_mcp_mentees ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.bootstrap_mcp_mentees FORCE ROW LEVEL SECURITY;
      CREATE POLICY mentees_select_own ON public.bootstrap_mcp_mentees
        FOR SELECT TO authenticated
        USING (auth.uid() IS NOT NULL AND auth.uid() = auth_user_id);
      CREATE TABLE public.bootstrap_os_roles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        mentee_id uuid NOT NULL REFERENCES public.bootstrap_mcp_mentees (id),
        role text NOT NULL,
        company_id uuid,
        revoked_at timestamptz
      );
      CREATE TABLE public.bootstrap_os_admin_audit (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        op text NOT NULL CHECK (op IN ('create_company', 'grant_super_admin', 'revoke_super_admin')),
        actor_mentee_id uuid,
        actor_email text NOT NULL,
        target_email text,
        slug text,
        why text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE public.bootstrap_os_admin_audit ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.bootstrap_os_admin_audit FORCE ROW LEVEL SECURITY;
      REVOKE ALL ON TABLE public.bootstrap_os_admin_audit FROM PUBLIC, anon, authenticated;
    `);
    await db.exec(fs.readFileSync(MIGRATION, "utf8"));
    await db.query(
      `INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
        ($1, 'alice@example.test', now()),
        ($2, 'bob@example.test', now()),
        ($3, 'carol@example.test', now()),
        ($4, 'dave@example.test', now())`,
      [ALICE, BOB, CAROL, DAVE],
    );
    await db.exec("RESET ROLE");
    const seeded = await db.query(
      `INSERT INTO public.bootstrap_mcp_mentees (email, auth_user_id) VALUES
        ('alice@example.test', $1),
        ('bob@example.test', $2),
        ('carol@example.test', $3),
        ('dave@example.test', $4)
       RETURNING email, id`,
      [ALICE, BOB, CAROL, DAVE],
    );
    const id = Object.fromEntries(seeded.rows.map((row) => [row.email, row.id]));
    await db.query(
      `INSERT INTO public.bootstrap_os_roles (mentee_id, role) VALUES
        ($1, 'owner'),
        ($2, 'owner'),
        ($3, 'member'),
        ($4, 'super_admin')`,
      [id["alice@example.test"], id["bob@example.test"], id["carol@example.test"], id["dave@example.test"]],
    );
  });

  after(async () => {
    await db?.close();
  });

  it("records an allowlisted source once and leaves a later value unchanged", async () => {
    await signIn(ALICE, "alice@example.test");
    const first = await db.query(
      "SELECT public.bootstrap_mcp_record_install_source($1) AS body",
      ["plugin"],
    );
    assert.equal(first.rows[0].body.ok, true);
    assert.equal(first.rows[0].body.source, "plugin");
    const second = await db.query(
      "SELECT public.bootstrap_mcp_record_install_source($1) AS body",
      ["grokbot"],
    );
    assert.equal(second.rows[0].body.source, "plugin");
    await db.exec("RESET ROLE");
    const audits = await db.query(
      "SELECT count(*)::int AS n FROM public.bootstrap_os_admin_audit WHERE op = 'record_install_source' AND actor_email = 'alice@example.test'",
    );
    assert.equal(audits.rows[0].n, 1);
  });

  it("stores manual when the source is missing", async () => {
    await signIn(BOB, "bob@example.test");
    const body = (
      await db.query("SELECT public.bootstrap_mcp_record_install_source(NULL) AS body")
    ).rows[0].body;
    assert.equal(body.ok, true);
    assert.equal(body.source, "manual");
  });

  it("rejects a source outside the allowlist and does not store it", async () => {
    await signIn(CAROL, "carol@example.test");
    const body = (
      await db.query("SELECT public.bootstrap_mcp_record_install_source($1) AS body", ["newsletter"])
    ).rows[0].body;
    assert.equal(body.ok, false);
    assert.equal(body.error, "invalid_install_source");
    await db.exec("RESET ROLE");
    const row = await db.query(
      "SELECT source FROM public.bootstrap_mcp_mentees WHERE email = 'carol@example.test'",
    );
    assert.equal(row.rows[0].source, null);
    await assert.rejects(
      () =>
        db.query(
          "UPDATE public.bootstrap_mcp_mentees SET source = 'newsletter' WHERE email = 'carol@example.test'",
        ),
      (err) => {
        assert.equal(err.code, "23514");
        return true;
      },
    );
  });

  it("hides source from table reads and from another founder", async () => {
    await signIn(ALICE, "alice@example.test");
    const own = (
      await db.query("SELECT public.bootstrap_mcp_read_install_source(NULL) AS body")
    ).rows[0].body;
    assert.equal(own.ok, true);
    assert.equal(own.email, "alice@example.test");
    assert.equal(own.source, "plugin");
    const other = (
      await db.query("SELECT public.bootstrap_mcp_read_install_source($1) AS body", [
        "bob@example.test",
      ])
    ).rows[0].body;
    assert.equal(other.ok, false);
    assert.equal(other.error, "forbidden");
    await assert.rejects(
      () => db.query("SELECT source FROM public.bootstrap_mcp_mentees"),
      (err) => {
        assert.equal(err.code, "42501");
        return true;
      },
    );
    const emails = await db.query("SELECT email FROM public.bootstrap_mcp_mentees");
    assert.deepEqual(
      emails.rows.map((row) => row.email),
      ["alice@example.test"],
    );
  });

  it("a second connect with a different header leaves the value and writes no second audit row", async () => {
    const eve = "55555555-5555-4555-8555-555555555555";
    await db.exec("RESET ROLE");
    await db.query(
      "INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ($1, 'eve@example.test', now())",
      [eve],
    );
    await signIn(eve, "eve@example.test");
    const plugin = (
      await db.query("SELECT public.bootstrap_mcp_record_install_source($1) AS body", ["plugin"])
    ).rows[0].body;
    assert.equal(plugin.source, "plugin");
    const grokbot = (
      await db.query("SELECT public.bootstrap_mcp_record_install_source($1) AS body", ["grokbot"])
    ).rows[0].body;
    assert.equal(grokbot.source, "plugin");
    await db.exec("RESET ROLE");
    const row = await db.query(
      "SELECT source FROM public.bootstrap_mcp_mentees WHERE email = 'eve@example.test'",
    );
    assert.equal(row.rows[0].source, "plugin");
    const audits = await db.query(
      "SELECT count(*)::int AS n FROM public.bootstrap_os_admin_audit WHERE op = 'record_install_source' AND actor_email = 'eve@example.test'",
    );
    assert.equal(audits.rows[0].n, 1);
  });

  it("lets a super admin read another founder and denies a member", async () => {
    await signIn(DAVE, "dave@example.test");
    const seen = (
      await db.query("SELECT public.bootstrap_mcp_read_install_source($1) AS body", [
        "bob@example.test",
      ])
    ).rows[0].body;
    assert.equal(seen.ok, true);
    assert.equal(seen.source, "manual");
    await signIn(CAROL, "carol@example.test");
    const denied = (
      await db.query("SELECT public.bootstrap_mcp_read_install_source(NULL) AS body")
    ).rows[0].body;
    assert.equal(denied.ok, false);
    assert.equal(denied.error, "forbidden");
    await db.exec("RESET ROLE");
    await db.exec("SET ROLE anon");
    await assert.rejects(
      () => db.query("SELECT public.bootstrap_mcp_read_install_source(NULL)"),
      (err) => {
        assert.equal(err.code, "42501");
        return true;
      },
    );
    await assert.rejects(
      () => db.query("SELECT public.bootstrap_mcp_record_install_source(NULL)"),
      (err) => {
        assert.equal(err.code, "42501");
        return true;
      },
    );
  });
});

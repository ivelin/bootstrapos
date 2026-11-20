/**
 * Isolated Postgres (PGlite). Never supabase-pirin-ai. Never prod.
 * Applies the real 20261116 migration. Nothing stored, no prices.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = path.join(__dirname, "..", "supabase", "migrations", "20261116_bootstrap_os_discount_class.sql");
const ROLLBACK = path.join(__dirname, "..", "supabase", "rollbacks", "20261116_bootstrap_os_discount_class.sql");
const PRIOR = path.join(__dirname, "..", "supabase", "migrations", "20261115_bootstrap_mcp_jwt_email.sql");

const FOUNDER_UID = "33333333-3333-3333-3333-333333333333";
const A_UID = "11111111-1111-1111-1111-111111111111";
const STRANGER_UID = "99999999-9999-9999-9999-999999999999";

let db;

function myLabelsSql(sql) {
  const start = sql.indexOf("CREATE OR REPLACE FUNCTION public.bootstrap_mcp_my_labels()");
  const body = sql.indexOf("AS $$", start);
  const end = sql.indexOf("$$;", body);
  if (start < 0 || body < 0 || end < 0) throw new Error("bootstrap_mcp_my_labels slice missing");
  return sql.slice(start, end + 3).trim();
}

async function asCaller(uid, email) {
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${uid}', false)`);
  await db.exec(`SELECT set_config('request.jwt.claim.email', '${email}', false)`);
}

async function discountClass(uid, email) {
  const id = uid == null ? "NULL::uuid" : `'${uid}'::uuid`;
  const mail = email == null ? "NULL::text" : `'${email}'`;
  const res = await db.query(`SELECT public.bootstrap_os_discount_class(${id}, ${mail}) AS class`);
  return res.rows[0].class;
}

async function labelsBody() {
  return (await db.query("SELECT public.bootstrap_mcp_my_labels() AS body")).rows[0].body;
}

const STUBS = `
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE SCHEMA IF NOT EXISTS bootstrap_os;
CREATE OR REPLACE FUNCTION bootstrap_os.actor_email()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('request.jwt.claim.email', true), '');
$$;

CREATE TABLE public.bootstrap_mcp_mentees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,
  auth_user_id uuid UNIQUE
);

CREATE TABLE public.bootstrap_company_labels (
  mentee_id uuid NOT NULL REFERENCES public.bootstrap_mcp_mentees (id) ON DELETE CASCADE,
  label text NOT NULL
);

CREATE OR REPLACE FUNCTION public.bootstrap_os_live_role(p_mentee_id uuid)
RETURNS text
LANGUAGE sql
STABLE
AS $$ SELECT 'unset'::text $$;

CREATE OR REPLACE FUNCTION public.bootstrap_os_membership_for(p_auth_user_id uuid, p_email text)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$ SELECT jsonb_build_object('level', 'board', 'status', NULL) $$;

INSERT INTO public.bootstrap_mcp_mentees (id, email, auth_user_id) VALUES
  ('${A_UID}', 'mentee-a@example.test', '${A_UID}'),
  ('${FOUNDER_UID}', 'founder@example.test', '${FOUNDER_UID}');
INSERT INTO public.bootstrap_company_labels (mentee_id, label) VALUES
  ('${FOUNDER_UID}', 'alpha');
`;

describe("PGlite discount class (isolated, never prod)", () => {
  before(async () => {
    db = new PGlite();
    await db.exec(STUBS);
    await db.exec(myLabelsSql(fs.readFileSync(PRIOR, "utf8")));
    db.priorLabelsDef = (
      await db.query("SELECT pg_get_functiondef('public.bootstrap_mcp_my_labels()'::regprocedure) AS def")
    ).rows[0].def;
    await db.exec(fs.readFileSync(MIGRATION, "utf8"));
  });

  after(async () => {
    await db?.close();
  });

  it("keeps prices out of the migration and the rollback", () => {
    const text = fs.readFileSync(MIGRATION, "utf8") + fs.readFileSync(ROLLBACK, "utf8");
    assert.equal(/%/.test(text), false);
    assert.equal(/\b(percent|percentage)\b/i.test(text), false);
    assert.equal(/\brate\b/i.test(text), false);
  });

  it("rollback text is the 20261115 my_labels body", () => {
    assert.equal(myLabelsSql(fs.readFileSync(ROLLBACK, "utf8")), myLabelsSql(fs.readFileSync(PRIOR, "utf8")));
  });

  it("no memberships table: a mentee is bootstrap and a non-mentee is none", async () => {
    assert.equal(await discountClass(FOUNDER_UID, "founder@example.test"), "bootstrap");
    await asCaller(FOUNDER_UID, "founder@example.test");
    const founder = await labelsBody();
    assert.equal(founder.authenticated, true);
    assert.equal(founder.discount_class, "bootstrap");

    assert.equal(await discountClass(STRANGER_UID, "stranger@example.test"), "none");
    await asCaller(STRANGER_UID, "stranger@example.test");
    const stranger = await labelsBody();
    assert.equal(stranger.authenticated, false);
    assert.equal(stranger.reason, "not_invited");
    assert.equal(stranger.discount_class, "none");
  });

  it("missing membership columns count as no row", async () => {
    await db.exec(`
      CREATE TABLE public.memberships (
        auth_user_id uuid,
        email text,
        level text,
        source text,
        status text
      );
      INSERT INTO public.memberships (auth_user_id, email, level, source, status) VALUES
        (NULL, 'elite-paid@example.test', 'elite', 'stripe', 'active'),
        ('${FOUNDER_UID}', 'founder@example.test', 'elite', 'stripe', 'active');
    `);
    assert.equal(await discountClass(null, "elite-paid@example.test"), "none");
    assert.equal(await discountClass(FOUNDER_UID, "founder@example.test"), "bootstrap");
    await asCaller(STRANGER_UID, "elite-paid@example.test");
    const early = await labelsBody();
    assert.equal(early.reason, "not_invited");
    assert.equal(early.discount_class, "none");
    await db.exec("DROP TABLE public.memberships");
  });

  it("effective_to equal to now() is lapsed, then the other stored shapes", async () => {
    await db.exec(`
      CREATE TABLE public.memberships (
        auth_user_id uuid,
        email text,
        level text,
        source text,
        status text,
        effective_to timestamptz
      );
    `);
    await db.exec("BEGIN");
    await db.exec(`
      INSERT INTO public.memberships (auth_user_id, email, level, source, status, effective_to) VALUES
        (NULL, 'lapsed-now@example.test', 'elite', 'stripe', 'active', transaction_timestamp());
    `);
    const lapsed = await db.query(
      "SELECT public.bootstrap_os_discount_class(NULL::uuid, 'lapsed-now@example.test') AS class",
    );
    await db.exec("COMMIT");
    assert.equal(lapsed.rows[0].class, "none");

    await db.exec(`
      INSERT INTO public.memberships (auth_user_id, email, level, source, status, effective_to) VALUES
        (NULL, 'elite-paid@example.test', 'elite', 'stripe', 'active', NULL),
        (NULL, 'next-paid@example.test', 'next', 'stripe', 'active', NULL),
        (NULL, 'ground-paid@example.test', 'ground', 'self_serve', 'active', NULL),
        (NULL, 'ground-due@example.test', 'ground', 'stripe', 'past_due', NULL),
        (NULL, 'trial-live@example.test', 'ground', 'manual', 'active', now() + interval '30 days'),
        ('${A_UID}', 'mentee-a@example.test', 'ground', 'manual', 'active', now() - interval '1 day'),
        ('${FOUNDER_UID}', 'founder@example.test', 'elite', 'stripe', 'ended', NULL),
        (NULL, 'Elite.Case@Example.Test', 'elite', 'fast_agreement', 'active', NULL);
    `);

    assert.equal(await discountClass(null, "elite-paid@example.test"), "elite");
    assert.equal(await discountClass(null, "next-paid@example.test"), "next");
    assert.equal(await discountClass(null, "ground-paid@example.test"), "ground");
    assert.equal(await discountClass(null, "ground-due@example.test"), "ground");
    assert.equal(await discountClass(null, "trial-live@example.test"), "trial");
    assert.equal(await discountClass(A_UID, "mentee-a@example.test"), "bootstrap");
    assert.equal(await discountClass(FOUNDER_UID, "founder@example.test"), "bootstrap");
    assert.equal(await discountClass(null, "nobody@example.test"), "none");
    assert.equal(await discountClass(null, "elite.case@example.test"), "elite");

    await asCaller(STRANGER_UID, "elite-paid@example.test");
    const paidNoMentee = await labelsBody();
    assert.equal(paidNoMentee.authenticated, false);
    assert.equal(paidNoMentee.reason, "not_invited");
    assert.equal(paidNoMentee.discount_class, "elite");
  });

  it("apply then rollback restores the 20261115 my_labels body", async () => {
    await db.exec(fs.readFileSync(ROLLBACK, "utf8"));
    const restored = (
      await db.query("SELECT pg_get_functiondef('public.bootstrap_mcp_my_labels()'::regprocedure) AS def")
    ).rows[0].def;
    assert.equal(restored, db.priorLabelsDef);
    await asCaller(FOUNDER_UID, "founder@example.test");
    const founder = await labelsBody();
    assert.equal(founder.authenticated, true);
    assert.equal("discount_class" in founder, false);
    await asCaller(STRANGER_UID, "stranger@example.test");
    const stranger = await labelsBody();
    assert.equal(stranger.reason, "not_invited");
    assert.equal("discount_class" in stranger, false);
    const gone = await db.query(
      "SELECT to_regprocedure('public.bootstrap_os_discount_class(uuid, text)') AS fn",
    );
    assert.equal(gone.rows[0].fn, null);
  });
});

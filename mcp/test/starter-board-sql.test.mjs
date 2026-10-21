/**
 * Isolated PGlite for the starter bet board migration.
 * Never supabase-pirin-ai. Never prod. Fictional addresses only.
 */
import { createHash } from "node:crypto";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL = path.join(__dirname, "..", "supabase", "migrations", "20261021_bootstrap_os_starter_board.sql");

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
  email text NOT NULL UNIQUE
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

let db;

async function asEmail(email, sql, params = []) {
  await db.query("SELECT set_config('app.actor_email', $1, false)", [email]);
  const rows = await db.query(sql, params);
  return rows.rows;
}

describe("PGlite starter bet board (isolated, never prod)", { concurrency: false }, () => {
  before(async () => {
    db = new PGlite();
    await db.exec(HARNESS);
    await db.exec(fs.readFileSync(SQL, "utf8"));
  });

  after(async () => {
    await db?.close();
  });

  it("one starter per account, no invites, no promotion", async () => {
    const file = fs.readFileSync(SQL, "utf8");
    assert.match(file, /ENABLE ROW LEVEL SECURITY/);
    assert.match(file, /FORCE ROW LEVEL SECURITY/);
    assert.match(file, /REVOKE ALL ON TABLE bootstrap_os\.starter_boards FROM PUBLIC, anon, authenticated/);
    assert.match(file, /founder_seed invite is the only path to a real company/);
    assert.doesNotMatch(file, /supabase\.co/);

    const first = (
      await asEmail("founder@example.test", "SELECT public.bootstrap_os_create_starter_board() AS body")
    )[0].body;
    assert.equal(first.ok, true);
    assert.equal(first.created, true);
    assert.equal(first.invites, false);
    assert.equal(first.promotable, false);
    assert.match(first.slug, /^sb[0-9a-f]{8}$/);
    assert.notEqual(
      first.slug,
      `sb${createHash("md5").update("founder@example.test").digest("hex").slice(0, 8)}`,
    );

    const second = (
      await asEmail("founder@example.test", "SELECT public.bootstrap_os_create_starter_board() AS body")
    )[0].body;
    assert.equal(second.created, false);
    assert.equal(second.slug, first.slug);
    const rows = (await db.query("SELECT count(*)::int AS n FROM bootstrap_os.starter_boards")).rows[0].n;
    assert.equal(rows, 1);
    const ideas = await db.query(
      "SELECT to_regclass('bootstrap_os.ideas') AS ideas",
    );
    assert.equal(ideas.rows[0].ideas, null);

    const sandbox = (
      await asEmail("founder@example.test", "SELECT public.bootstrap_os_starter_is_sandbox($1) AS sandbox", [
        first.slug,
      ])
    )[0].sandbox;
    assert.equal(sandbox, true);
    const other = (
      await asEmail("stranger@example.test", "SELECT public.bootstrap_os_starter_is_sandbox('alpha') AS sandbox")
    )[0].sandbox;
    assert.equal(other, false);

    await assert.rejects(
      db.query("UPDATE bootstrap_os.starter_boards SET owner_email = owner_email"),
      /cannot be promoted/,
    );
    const portfolio = (
      await db.query("SELECT bootstrap_os.portfolio_view(c.id) AS view FROM bootstrap_os.companies c WHERE c.slug = $1", [
        first.slug,
      ])
    ).rows[0].view;
    assert.equal(portfolio.applies, false);
    assert.equal(portfolio.reason, "a starter bet board is not in the portfolio");
    const adminCount = (
      await db.query("SELECT public.bootstrap_os_admin_company_count() AS n")
    ).rows[0].n;
    assert.equal(adminCount, 0);
    await db.query("INSERT INTO public.bootstrap_os_companies (slug) VALUES ('alpha')");
    await db.query("INSERT INTO public.bootstrap_os_companies (slug) VALUES ($1)", [first.slug]);
    const adminAfter = (
      await db.query("SELECT public.bootstrap_os_admin_company_count() AS n")
    ).rows[0].n;
    assert.equal(adminAfter, 1);
    await assert.rejects(
      db.query(
        "INSERT INTO public.bootstrap_mcp_invites (company_label, invitee_email) VALUES ($1, 'member@example.test')",
        [first.slug],
      ),
      /cannot send invites/,
    );

    await db.exec(`
      CREATE OR REPLACE FUNCTION public.bootstrap_os_held_label(p_company text)
      RETURNS boolean LANGUAGE sql AS $$
        SELECT lower(coalesce(current_setting('app.actor_email', true), '')) = 'founder@example.test'
      $$;
      CREATE SEQUENCE IF NOT EXISTS public.starter_collision_ticks;
      CREATE OR REPLACE FUNCTION public.starter_test_collide()
      RETURNS trigger LANGUAGE plpgsql AS $fn$
      BEGIN
        IF current_setting('app.force_starter_collision', true) = '1'
           AND NEW.slug LIKE 'sb%'
           AND nextval('public.starter_collision_ticks') = 1 THEN
          RAISE unique_violation USING MESSAGE = 'slug collision';
        END IF;
        RETURN NEW;
      END
      $fn$;
      CREATE TRIGGER starter_test_collide
        BEFORE INSERT ON bootstrap_os.companies
        FOR EACH ROW EXECUTE FUNCTION public.starter_test_collide();
      CREATE OR REPLACE FUNCTION public.starter_test_race()
      RETURNS trigger LANGUAGE plpgsql AS $fn$
      BEGIN
        IF current_setting('app.force_starter_race', true) = '1' THEN
          PERFORM set_config('app.force_starter_race', '0', true);
          INSERT INTO bootstrap_os.starter_boards (company_id, owner_email)
          SELECT id, NULLIF(current_setting('app.actor_email', true), '')
          FROM bootstrap_os.companies WHERE slug = 'winner';
        END IF;
        RETURN NEW;
      END
      $fn$;
      CREATE TRIGGER starter_test_race
        AFTER INSERT ON bootstrap_os.companies
        FOR EACH ROW EXECUTE FUNCTION public.starter_test_race();
    `);

    await db.query("SELECT set_config('app.force_starter_collision', '1', false)");
    const collided = (
      await asEmail("other@example.test", "SELECT public.bootstrap_os_create_starter_board() AS body")
    )[0].body;
    assert.equal(collided.ok, true);
    assert.equal(collided.created, true);
    assert.match(collided.slug, /^sb[0-9a-f]{8}$/);

    await db.query("INSERT INTO bootstrap_os.companies (slug, label) VALUES ('winner', 'Winner')");
    await db.query("SELECT set_config('app.force_starter_race', '1', false)");
    const raced = (
      await asEmail("racer@example.test", "SELECT public.bootstrap_os_create_starter_board() AS body")
    )[0].body;
    assert.equal(raced.ok, true);
    assert.equal(raced.created, false);
    assert.equal(raced.slug, "winner");
    const starters = (
      await db.query("SELECT count(*)::int AS n FROM bootstrap_os.starter_boards WHERE owner_email = 'racer@example.test'")
    ).rows[0].n;
    assert.equal(starters, 1);

    const advisor = (
      await asEmail(
        "founder@example.test",
        "SELECT public.bootstrap_os_change_acl($1, 'advisor@example.test', 'email', 'advisor', 'grant') AS body",
        [first.slug],
      )
    )[0].body;
    assert.equal(advisor.ok, false);
    assert.equal(advisor.error, "sandbox_cannot_share");
    const writer = (
      await asEmail(
        "founder@example.test",
        "SELECT public.bootstrap_os_change_acl($1, 'writer@example.test', 'email', 'founder_authorized', 'grant') AS body",
        [first.slug],
      )
    )[0].body;
    assert.equal(writer.ok, false);
    assert.equal(writer.error, "sandbox_cannot_share");
    await assert.rejects(
      db.query(
        `INSERT INTO bootstrap_os.company_acl (company_id, principal, principal_kind, role)
         SELECT id, 'advisor@example.test', 'email', 'advisor' FROM bootstrap_os.companies WHERE slug = $1`,
        [first.slug],
      ),
      /cannot add members/,
    );
    await assert.rejects(
      db.query(
        `INSERT INTO bootstrap_os.board_subscribers (company_id)
         SELECT id FROM bootstrap_os.companies WHERE slug = $1`,
        [first.slug],
      ),
      /cannot send webhooks/,
    );
    await assert.rejects(
      db.query(
        `INSERT INTO bootstrap_os.notify_outbox (company_id, channel)
         SELECT id, 'webhook' FROM bootstrap_os.companies WHERE slug = $1`,
        [first.slug],
      ),
      /cannot send webhooks/,
    );

    await db.query("SET ROLE authenticated");
    await assert.rejects(
      () => db.query("SELECT public.bootstrap_os_starter_is_sandbox('alpha')"),
      /permission denied/,
    );
    await db.query("RESET ROLE");

    await db.query("DELETE FROM bootstrap_os.companies WHERE slug = $1", [first.slug]);
    const left = (
      await db.query("SELECT count(*)::int AS n FROM bootstrap_os.starter_boards WHERE owner_email = 'founder@example.test'")
    ).rows[0].n;
    assert.equal(left, 0);
  });
});

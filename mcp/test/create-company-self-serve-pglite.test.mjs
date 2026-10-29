/**
 * Self-serve create_company. PGlite only. Never supabase-pirin-ai.
 * The concurrent race runs on real Postgres in create-company-self-serve-race.test.mjs.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRELUDE = path.join(__dirname, "pglite", "self-serve-prelude.sql");
const MIGRATION = path.join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20261028_create_company_self_serve.sql",
);
const SCOPED_INVITES = path.join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20261029_bootstrap_os_scoped_invites.sql",
);

const ALICE = "11111111-1111-4111-8111-111111111111";
const ALICE_EMAIL = "alice@example.test";
const BOB = "22222222-2222-4222-8222-222222222222";
const BOB_EMAIL = "bob@example.test";

let db;

async function signIn(uid, email) {
  await db.exec("RESET ROLE");
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [uid]);
  await db.query("SELECT set_config('request.jwt.claim.email', $1, false)", [email]);
  await db.exec("SET ROLE authenticated");
}

async function create(name) {
  const rows = await db.query("SELECT public.create_company_self_serve($1) AS id", [name]);
  return rows.rows[0].id;
}

describe("create_company_self_serve (PGlite, never prod)", () => {
  before(async () => {
    db = new PGlite();
    await db.exec(fs.readFileSync(PRELUDE, "utf8"));
    await db.exec(fs.readFileSync(MIGRATION, "utf8"));
    await db.query(
      "INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ($1, $2, $3), ($4, $5, $6)",
      [ALICE, ALICE_EMAIL, "2026-01-01T00:00:00Z", BOB, BOB_EMAIL, "2026-01-01T00:00:00Z"],
    );
  });

  after(async () => {
    await db?.close();
  });

  it("an unconfirmed account is denied", async () => {
    const uid = "33333333-3333-4333-8333-333333333333";
    await db.exec("RESET ROLE");
    await db.query(
      "INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ($1, $2, NULL)",
      [uid, "carol@example.test"],
    );
    await signIn(uid, "carol@example.test");
    await assert.rejects(() => create("carol"), (err) => {
      assert.equal(err.code, "P0001");
      assert.match(err.message, /email_unconfirmed/);
      return true;
    });
    await db.exec("RESET ROLE");
    const count = await db.query(
      "SELECT count(*)::int AS n FROM bootstrap_os.companies WHERE created_by = $1",
      [uid],
    );
    assert.equal(count.rows[0].n, 0);
  });

  it("the 4th create is denied", async () => {
    await signIn(ALICE, ALICE_EMAIL);
    assert.ok(await create("alpha"));
    assert.ok(await create("bravo"));
    assert.ok(await create("charlie"));
    await assert.rejects(() => create("delta"), (err) => {
      assert.equal(err.code, "P0001");
      assert.match(err.message, /company_limit_reached/);
      return true;
    });
    await db.exec("RESET ROLE");
    const count = await db.query(
      "SELECT count(*)::int AS n FROM bootstrap_os.companies WHERE created_by = $1 AND starter IS NOT TRUE",
      [ALICE],
    );
    assert.equal(count.rows[0].n, 3);
  });

  it("a second tenant cannot read the first tenant's company", async () => {
    await signIn(ALICE, ALICE_EMAIL);
    const visible = await db.query("SELECT slug FROM bootstrap_os.companies ORDER BY slug");
    assert.deepEqual(
      visible.rows.map((row) => row.slug),
      ["alpha", "bravo", "charlie"],
    );
    await signIn(BOB, BOB_EMAIL);
    const hidden = await db.query("SELECT slug FROM bootstrap_os.companies");
    assert.deepEqual(hidden.rows, []);
  });

  it("a direct INSERT fails", async () => {
    await signIn(BOB, BOB_EMAIL);
    await assert.rejects(
      () => db.query("INSERT INTO bootstrap_os.companies (slug, label) VALUES ('echo', 'echo')"),
      (err) => {
        assert.match(String(err.message), /permission denied|row-level security/i);
        return true;
      },
    );
    await assert.rejects(
      () =>
        db.query(
          "INSERT INTO public.bootstrap_os_companies (slug, display_name, created_by) VALUES ('echo', 'echo', $1)",
          ["44444444-4444-4444-8444-444444444444"],
        ),
      (err) => {
        assert.match(String(err.message), /permission denied|row-level security/i);
        return true;
      },
    );
  });

  it("the audit row holds ids only", async () => {
    await db.exec("RESET ROLE");
    const rows = await db.query(
      `SELECT who, client, what_changed
       FROM bootstrap_os.audit_events
       WHERE who = $1
       ORDER BY at`,
      [ALICE],
    );
    assert.equal(rows.rows.length, 3);
    for (const row of rows.rows) {
      const packed = JSON.stringify(row);
      assert.equal(row.who, ALICE);
      assert.equal(row.client, "create_company_self_serve");
      assert.deepEqual(Object.keys(row.what_changed).sort(), ["actor_id", "company_id"]);
      assert.equal(row.what_changed.actor_id, ALICE);
      assert.doesNotMatch(packed, /@/);
      assert.doesNotMatch(packed, /alpha|bravo|charlie|alice/i);
    }
    const owners = await db.query(
      "SELECT role FROM public.bootstrap_os_roles WHERE company_id IS NOT NULL",
    );
    assert.ok(owners.rows.length >= 3);
    assert.ok(owners.rows.every((row) => row.role === "owner"));
  });

  it("anon cannot execute the function", async () => {
    await db.exec("RESET ROLE");
    await db.exec("SET ROLE anon");
    await assert.rejects(() => create("foxtrot"), (err) => {
      assert.match(String(err.message), /permission denied/i);
      return true;
    });
  });

  it("authenticated cannot execute the self-serve audit function", async () => {
    await db.exec("RESET ROLE");
    await db.exec(
      "GRANT EXECUTE ON FUNCTION public.bootstrap_os_audit_self_serve_company() TO authenticated",
    );
    const before = await db.query(
      "SELECT has_function_privilege('authenticated', 'public.bootstrap_os_audit_self_serve_company()', 'execute') AS allowed",
    );
    assert.equal(before.rows[0].allowed, true);
    await db.exec(fs.readFileSync(SCOPED_INVITES, "utf8"));
    const after = await db.query(
      "SELECT has_function_privilege('authenticated', 'public.bootstrap_os_audit_self_serve_company()', 'execute') AS allowed",
    );
    assert.equal(after.rows[0].allowed, false);
    await db.exec("SET ROLE authenticated");
    await assert.rejects(
      () => db.query("SELECT public.bootstrap_os_audit_self_serve_company()"),
      /permission denied/i,
    );
  });
});

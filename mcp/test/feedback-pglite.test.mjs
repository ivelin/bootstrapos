/**
 * Isolated PGlite for submit_feedback SQL.
 * Never supabase-pirin-ai. Never prod. Fictional addresses only.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { feedbackFingerprint } from "../dist/feedback.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL = path.join(__dirname, "..", "supabase", "migrations", "20260930_bootstrap_os_submit_feedback.sql");
const HARDEN = path.join(__dirname, "..", "supabase", "migrations", "20261101_bootstrap_os_feedback_harden.sql");

const HARNESS = `
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO authenticated;
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
GRANT EXECUTE ON FUNCTION auth.jwt() TO authenticated;
`;

let db;

async function asJwt({ email = "", sub = "" }, sql, params = []) {
  await db.query("SELECT set_config('app.actor_email', $1, false)", [email]);
  await db.query("SELECT set_config('app.actor_sub', $1, false)", [sub]);
  const rows = await db.query(sql, params);
  return rows.rows;
}

describe("PGlite submit_feedback (isolated, never prod)", { concurrency: false }, () => {
  before(async () => {
    db = new PGlite();
    await db.exec(HARNESS);
    await db.exec(fs.readFileSync(SQL, "utf8"));
    await db.exec(
      "GRANT EXECUTE ON FUNCTION public.bootstrap_os_submit_feedback(jsonb) TO anon",
    );
    await db.exec(fs.readFileSync(HARDEN, "utf8"));
    await db.exec(`
      CREATE OR REPLACE FUNCTION public.bootstrap_os_admin_gate()
      RETURNS jsonb
      LANGUAGE plpgsql
      AS $fn$
      BEGIN
        IF current_setting('app.actor_role', true) = 'super_admin' THEN
          RETURN jsonb_build_object('ok', true);
        END IF;
        RETURN jsonb_build_object('ok', false, 'status', 403);
      END;
      $fn$;
    `);
  });

  after(async () => {
    await db?.close();
  });

  it("migration is Cos-apply only", () => {
    const sql = fs.readFileSync(SQL, "utf8");
    assert.match(sql, /Do not migrate\/seed\/live-probe supabase-pirin-ai/);
    assert.match(sql, /bootstrap_os_submit_feedback/);
    assert.match(sql, /auth\.jwt\(\)/);
  });

  it("files under the token account, redacts, and dedupes", async () => {
    const body = {
      kind: "bug",
      summary: "The board did not load for other@example.test Bearer abcdefghijklmnop",
      user_consented: true,
      actor_id: "intruder",
      tenant_id: "intruder",
      product: "office-receptionist",
      expected: "a@example.test still sees it",
    };
    const rows = await asJwt(
      { email: "a@example.test" },
      "SELECT public.bootstrap_os_submit_feedback($1::jsonb) AS body",
      [JSON.stringify(body)],
    );
    const ack = rows[0].body;
    assert.equal(ack.ok, true);
    assert.equal(ack.duplicate, false);
    assert.match(ack.line, /^Filed fb_/);
    const stored = await asJwt(
      { email: "a@example.test" },
      "SELECT actor_id, tenant_id, product, summary, expected, fingerprint FROM bootstrap_os.feedback WHERE id = $1",
      [ack.id],
    );
    assert.equal(stored[0].actor_id, "a@example.test");
    assert.equal(stored[0].tenant_id, "a@example.test");
    assert.equal(stored[0].product, "bootstrap-os");
    assert.match(stored[0].expected, /a@example\.test/);
    assert.doesNotMatch(stored[0].summary, /other@example\.test|Bearer abc|intruder/);
    assert.equal(
      stored[0].fingerprint,
      feedbackFingerprint({ kind: "bug", summary: stored[0].summary, actorId: "a@example.test" }),
    );
    const again = await asJwt(
      { email: "a@example.test" },
      "SELECT public.bootstrap_os_submit_feedback($1::jsonb) AS body",
      [JSON.stringify({ ...body, summary: "The board did not load for other@example.test Bearer abcdefghijklmnop" })],
    );
    assert.equal(again[0].body.duplicate, true);
    assert.equal(again[0].body.id, ack.id);
  });

  it("a second account cannot read the first ticket", async () => {
    await db.query("SET ROLE authenticated");
    try {
      const seen = await asJwt(
        { email: "b@example.test" },
        "SELECT id, summary FROM bootstrap_os.feedback",
      );
      assert.equal(seen.length, 0);
    } finally {
      await db.query("RESET ROLE");
    }
    const own = await asJwt(
      { email: "b@example.test", sub: "" },
      "SELECT public.bootstrap_os_submit_feedback($1::jsonb) AS body",
      [JSON.stringify({ kind: "docs", summary: "B wrote this", user_consented: true, submission_id: "bbbbbbbb" })],
    );
    assert.equal(own[0].body.ok, true);
    assert.doesNotMatch(JSON.stringify(own[0].body), /The board did not load/);
  });

  it("refuses a ticket with no yes and no token", async () => {
    const noYes = await asJwt(
      { email: "a@example.test" },
      "SELECT public.bootstrap_os_submit_feedback($1::jsonb) AS body",
      [JSON.stringify({ kind: "bug", summary: "no", user_consented: false })],
    );
    assert.equal(noYes[0].body.error, "Needs a yes in this chat.");
    const anon = await asJwt(
      {},
      "SELECT public.bootstrap_os_submit_feedback($1::jsonb) AS body",
      [JSON.stringify({ kind: "bug", summary: "no", user_consented: true })],
    );
    assert.equal(anon[0].body.error, "Sign in to Bootstrap OS and ask again.");
    assert.doesNotMatch(JSON.stringify(anon[0].body), /a@example\.test/);
  });

  it("anon cannot execute submit or list, and a member cannot read the list", async () => {
    const anonSubmit = await db.query(
      "SELECT has_function_privilege('anon', 'public.bootstrap_os_submit_feedback(jsonb)', 'EXECUTE') AS allowed",
    );
    const anonList = await db.query(
      "SELECT has_function_privilege('anon', 'public.bootstrap_os_list_feedback(integer)', 'EXECUTE') AS allowed",
    );
    const authSubmit = await db.query(
      "SELECT has_function_privilege('authenticated', 'public.bootstrap_os_submit_feedback(jsonb)', 'EXECUTE') AS allowed",
    );
    const anonRedact = await db.query(
      "SELECT has_function_privilege('anon', 'bootstrap_os.redact_feedback_text(text, text)', 'EXECUTE') AS allowed",
    );
    const anonFp = await db.query(
      "SELECT has_function_privilege('anon', 'bootstrap_os.feedback_fingerprint(text, text, text, text)', 'EXECUTE') AS allowed",
    );
    assert.equal(anonSubmit.rows[0].allowed, false);
    assert.equal(anonList.rows[0].allowed, false);
    assert.equal(anonRedact.rows[0].allowed, false);
    assert.equal(anonFp.rows[0].allowed, false);
    assert.equal(authSubmit.rows[0].allowed, true);
    await db.query("SET ROLE anon");
    try {
      await assert.rejects(
        () => db.query("SELECT public.bootstrap_os_submit_feedback('{}'::jsonb)"),
        /permission denied/i,
      );
      await assert.rejects(
        () => db.query("SELECT public.bootstrap_os_list_feedback(5)"),
        /permission denied/i,
      );
    } finally {
      await db.query("RESET ROLE");
    }
    await db.query("SELECT set_config('app.actor_role', 'member', false)");
    await db.query("SET ROLE authenticated");
    try {
      const denied = await db.query("SELECT public.bootstrap_os_list_feedback(5) AS body");
      assert.equal(denied.rows[0].body.ok, false);
      assert.equal(denied.rows[0].body.rows, undefined);
      assert.doesNotMatch(JSON.stringify(denied.rows[0].body), /board did not load|B wrote/);
    } finally {
      await db.query("RESET ROLE");
    }
  });

  it("does not merge distinct summaries that share 80 characters, and a super admin can list", async () => {
    const prefix = "z".repeat(80);
    const first = await asJwt(
      { email: "a@example.test" },
      "SELECT public.bootstrap_os_submit_feedback($1::jsonb) AS body",
      [JSON.stringify({ kind: "bug", summary: `${prefix} alpha`, user_consented: true, severity: "annoying" })],
    );
    const second = await asJwt(
      { email: "a@example.test" },
      "SELECT public.bootstrap_os_submit_feedback($1::jsonb) AS body",
      [JSON.stringify({ kind: "bug", summary: `${prefix} bravo`, user_consented: true, severity: "wish" })],
    );
    const again = await asJwt(
      { email: "a@example.test" },
      "SELECT public.bootstrap_os_submit_feedback($1::jsonb) AS body",
      [JSON.stringify({ kind: "bug", summary: `${prefix} alpha`, user_consented: true })],
    );
    assert.equal(first[0].body.duplicate, false);
    assert.equal(second[0].body.duplicate, false);
    assert.notEqual(second[0].body.id, first[0].body.id);
    assert.equal(again[0].body.duplicate, true);
    assert.equal(again[0].body.id, first[0].body.id);

    await db.query("UPDATE bootstrap_os.feedback SET created_at = now() - interval '25 hours' WHERE id = $1", [
      first[0].body.id,
    ]);
    const afterWindow = await asJwt(
      { email: "a@example.test" },
      "SELECT public.bootstrap_os_submit_feedback($1::jsonb) AS body",
      [JSON.stringify({ kind: "bug", summary: `${prefix} alpha`, user_consented: true })],
    );
    assert.equal(afterWindow[0].body.duplicate, false);
    assert.notEqual(afterWindow[0].body.id, first[0].body.id);

    const sharedKey = "samekey01";
    const owner = await asJwt(
      { email: "a@example.test" },
      "SELECT public.bootstrap_os_submit_feedback($1::jsonb) AS body",
      [JSON.stringify({ kind: "docs", summary: "owner ticket", user_consented: true, submission_id: sharedKey })],
    );
    const otherActor = await asJwt(
      { email: "c@example.test" },
      "SELECT public.bootstrap_os_submit_feedback($1::jsonb) AS body",
      [JSON.stringify({ kind: "docs", summary: "owner ticket", user_consented: true, submission_id: sharedKey })],
    );
    assert.equal(owner[0].body.ok, true);
    assert.equal(otherActor[0].body.duplicate, false);
    assert.notEqual(otherActor[0].body.id, owner[0].body.id);

    await db.query("SELECT set_config('app.actor_role', 'super_admin', false)");
    await db.query("SET ROLE authenticated");
    try {
      const listed = await db.query("SELECT public.bootstrap_os_list_feedback(20) AS body");
      const rows = listed.rows[0].body;
      assert.ok(Array.isArray(rows));
      const hit = rows.find((row) => row.id === first[0].body.id);
      assert.equal(hit.kind, "bug");
      assert.equal(hit.severity, "annoying");
      assert.equal(hit.status, "new");
      assert.match(hit.summary, /^z{80} alpha$/);

      for (let i = 0; i < 101; i += 1) {
        await db.query("SELECT public.bootstrap_os_submit_feedback($1::jsonb)", [
          JSON.stringify({
            kind: "docs",
            summary: `cap row ${i} ${"q".repeat(12)}`,
            user_consented: true,
          }),
        ]);
      }
      const one = await db.query("SELECT public.bootstrap_os_list_feedback(-5) AS body");
      const many = await db.query("SELECT public.bootstrap_os_list_feedback(100000) AS body");
      assert.ok(Array.isArray(one.rows[0].body));
      assert.ok(Array.isArray(many.rows[0].body));
      assert.ok(one.rows[0].body.length <= 1);
      assert.equal(one.rows[0].body.length, 1);
      assert.ok(many.rows[0].body.length <= 100);
      assert.equal(many.rows[0].body.length, 100);
    } finally {
      await db.query("RESET ROLE");
    }
  });
});

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
      feedbackFingerprint({ kind: "bug", summary: stored[0].summary }),
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
});

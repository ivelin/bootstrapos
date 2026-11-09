/**
 * Isolated Postgres (PGlite). Never supabase-pirin-ai. Never prod.
 * Membership entitlement on the labels RPC (Bill Access rollout, Phase 2):
 * bootstrap_mcp_my_labels surfaces the caller's stored membership level/status
 * from public.memberships — a table owned by the pirin-ai migration stream.
 * The read must degrade to "no row" (TS maps that to board) when the table is
 * absent or the caller has no row, and must never break authentication.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA = path.join(__dirname, "pglite", "identity-schema.sql");

const FOUNDER_UID = "33333333-3333-3333-3333-333333333333";
const A_UID = "11111111-1111-1111-1111-111111111111";
const B_UID = "22222222-2222-2222-2222-222222222222";
const FIRST_UID = "44444444-4444-4444-4444-444444444444";

let db;

async function labelsBody(uid, email) {
  await db.exec("RESET ROLE");
  await db.exec(`SELECT set_config('app.auth_uid', '${uid}', false)`);
  await db.exec(`SELECT set_config('app.auth_email', '${email}', false)`);
  return (await db.query("SELECT bootstrap_mcp_my_labels() AS body")).rows[0].body;
}

describe("PGlite membership on the labels RPC (isolated, never prod)", () => {
  before(async () => {
    db = new PGlite();
    await db.exec(fs.readFileSync(SCHEMA, "utf8"));
  });

  after(async () => {
    await db?.close();
  });

  it("memberships table absent: labels still resolve, membership reads as no row", async () => {
    const body = await labelsBody(FOUNDER_UID, "founder@example.test");
    assert.equal(body.authenticated, true);
    assert.deepEqual(body.labels, ["alpha", "bravo", "charlie"]);
    assert.equal(body.membership_level, null);
    assert.equal(body.membership_status, null);
  });

  it("uninvited callers get no membership keys at all", async () => {
    const body = await labelsBody("99999999-9999-9999-9999-999999999999", "stranger@example.test");
    assert.equal(body.authenticated, false);
    assert.equal("membership_level" in body, false);
    assert.equal("membership_status" in body, false);
  });

  it("stored rows surface verbatim: elite by auth id, ground by auth id, lapsed next as stored", async () => {
    await db.exec(`
      CREATE TABLE memberships (
        auth_user_id text,
        email text,
        level text,
        status text,
        effective_to timestamptz
      );
      INSERT INTO memberships (auth_user_id, email, level, status, effective_to) VALUES
        ('${FOUNDER_UID}', 'founder@example.test', 'elite', 'active', NULL),
        ('${A_UID}', 'mentee-a@example.test', 'ground', 'active', NULL),
        ('${B_UID}', 'mentee-b@example.test', 'next', 'ended', NULL),
        (NULL, 'first@example.test', 'ground', 'active', NULL);
    `);

    const founder = await labelsBody(FOUNDER_UID, "founder@example.test");
    assert.equal(founder.membership_level, "elite");
    assert.equal(founder.membership_status, "active");

    const a = await labelsBody(A_UID, "mentee-a@example.test");
    assert.equal(a.membership_level, "ground");
    assert.equal(a.membership_status, "active");

    // SQL returns the stored row; the TS read maps an ended row to board.
    const b = await labelsBody(B_UID, "mentee-b@example.test");
    assert.equal(b.membership_level, "next");
    assert.equal(b.membership_status, "ended");
  });

  it("account-less FAST-style rows bind by email at first sign-in", async () => {
    // mentee-first has no auth_user_id yet; its membership row is email-keyed.
    const first = await labelsBody(FIRST_UID, "first@example.test");
    assert.equal(first.authenticated, true);
    assert.equal(first.membership_level, "ground");
    assert.equal(first.membership_status, "active");
  });

  it("null effective_to keeps an active ground membership", async () => {
    const a = await labelsBody(A_UID, "mentee-a@example.test");
    assert.equal(a.membership_level, "ground");
    assert.equal(a.membership_status, "active");
  });

  it("future effective_to keeps an active ground membership", async () => {
    await db.exec(`
      UPDATE memberships
      SET effective_to = now() + interval '30 days'
      WHERE auth_user_id = '${A_UID}';
    `);
    const a = await labelsBody(A_UID, "mentee-a@example.test");
    assert.equal(a.membership_level, "ground");
    assert.equal(a.membership_status, "active");
  });

  it("past effective_to lapses an active ground membership to board and keeps status", async () => {
    await db.exec(`
      UPDATE memberships
      SET level = 'ground', status = 'active', effective_to = now() - interval '1 day'
      WHERE auth_user_id = '${A_UID}';
    `);
    const a = await labelsBody(A_UID, "mentee-a@example.test");
    assert.equal(a.membership_level, "board");
    assert.equal(a.membership_status, "active");
  });

  it("table without effective_to still returns stored level and status", async () => {
    await db.exec(`
      DROP TABLE memberships;
      CREATE TABLE memberships (
        auth_user_id text,
        email text,
        level text,
        status text
      );
      INSERT INTO memberships (auth_user_id, email, level, status) VALUES
        ('${A_UID}', 'mentee-a@example.test', 'ground', 'active');
    `);
    const a = await labelsBody(A_UID, "mentee-a@example.test");
    assert.equal(a.membership_level, "ground");
    assert.equal(a.membership_status, "active");
  });
});

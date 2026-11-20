/**
 * Isolated Postgres (PGlite). Never supabase-pirin-ai. Never prod.
 * Derived discount class: nothing stored, no prices.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA = path.join(__dirname, "pglite", "identity-schema.sql");
const MIGRATION = path.join(__dirname, "..", "supabase", "migrations", "20261116_bootstrap_os_discount_class.sql");
const ROLLBACK = path.join(__dirname, "..", "supabase", "rollbacks", "20261116_bootstrap_os_discount_class.sql");

const FOUNDER_UID = "33333333-3333-3333-3333-333333333333";
const A_UID = "11111111-1111-1111-1111-111111111111";

let db;

async function discountClass(uid, email) {
  const id = uid == null ? "NULL" : `'${uid}'`;
  const mail = email == null ? "NULL" : `'${email}'`;
  const res = await db.query(`SELECT bootstrap_os_discount_class(${id}, ${mail}) AS class`);
  return res.rows[0].class;
}

describe("PGlite discount class (isolated, never prod)", () => {
  before(async () => {
    db = new PGlite();
    await db.exec(fs.readFileSync(SCHEMA, "utf8"));
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

  it("no memberships table and a mentee is bootstrap", async () => {
    assert.equal(await discountClass(FOUNDER_UID, "founder@example.test"), "bootstrap");
    await db.exec(`SELECT set_config('app.auth_uid', '${FOUNDER_UID}', false)`);
    await db.exec(`SELECT set_config('app.auth_email', 'founder@example.test', false)`);
    const body = (await db.query("SELECT bootstrap_mcp_my_labels() AS body")).rows[0].body;
    assert.equal(body.authenticated, true);
    assert.equal(body.discount_class, "bootstrap");
  });

  it("classifies each stored shape, then falls through when the row does not confer a level", async () => {
    await db.exec(`
      CREATE TABLE memberships (
        auth_user_id text,
        email text,
        level text,
        source text,
        status text,
        effective_to timestamptz
      );
      INSERT INTO memberships (auth_user_id, email, level, source, status, effective_to) VALUES
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
  });
});

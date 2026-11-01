/**
 * Isolated PGlite. Never supabase-pirin-ai. Never prod.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  FIX_SQL,
  HARNESS,
  RPCS,
  SCENARIO,
  NON_STARTER_IDEA_COUNT,
  NON_STARTER_SEED,
  STARTER_SQL,
  dropStarterJoin,
  guardAbsent,
  readFix,
} from "./starter-ensure-shared.mjs";

async function ideaCount(db, email) {
  const rows = await db.query(
    `SELECT count(*)::int AS n
     FROM bootstrap_os.ideas i
     JOIN bootstrap_os.starter_boards s ON s.company_id = i.company_id
     WHERE s.owner_email = $1`,
    [email],
  );
  return rows.rows[0].n;
}

async function openBoard(db, email) {
  await db.query("SELECT set_config('app.actor_email', $1, false)", [email]);
  await db.query("SELECT public.bootstrap_os_create_starter_board()");
}

describe("PGlite starter ensure_company (isolated, never prod)", { concurrency: false }, () => {
  let db;

  before(async () => {
    db = new PGlite();
    await db.exec(HARNESS);
    await db.exec(fs.readFileSync(STARTER_SQL, "utf8"));
    await openBoard(db, "backfill@example.test");
    await db.exec(NON_STARTER_SEED);
    assert.equal(await ideaCount(db, "backfill@example.test"), 0);
    assert.equal((await db.query(NON_STARTER_IDEA_COUNT)).rows[0].n, 0);
    await db.exec(fs.readFileSync(FIX_SQL, "utf8"));
    assert.equal(await ideaCount(db, "backfill@example.test"), 1);
    assert.equal((await db.query(NON_STARTER_IDEA_COUNT)).rows[0].n, 0);
    await db.exec(fs.readFileSync(FIX_SQL, "utf8"));
    assert.equal(await ideaCount(db, "backfill@example.test"), 1);
    assert.equal((await db.query(NON_STARTER_IDEA_COUNT)).rows[0].n, 0);
    await db.exec(RPCS);
    await db.exec(SCENARIO);
  });

  after(async () => {
    await db?.close();
  });

  it("owner journey calls keep one ACL row and the backfill stays one idea", async () => {
    assert.equal(await ideaCount(db, "backfill@example.test"), 1);
    assert.equal((await db.query(NON_STARTER_IDEA_COUNT)).rows[0].n, 0);
    const acl = await db.query(
      `SELECT count(*)::int AS n
       FROM bootstrap_os.company_acl a
       JOIN bootstrap_os.companies c ON c.id = a.company_id
       WHERE c.slug IN (
         SELECT c2.slug FROM bootstrap_os.companies c2
         JOIN bootstrap_os.starter_boards s ON s.company_id = c2.id
         WHERE s.owner_email = 'founder@example.test'
       )`,
    );
    assert.equal(acl.rows[0].n, 1);
  });

  it("removing the NOT EXISTS guard makes get_journey fail", async () => {
    const mutated = guardAbsent(readFix());
    assert.notEqual(mutated, readFix());
    assert.doesNotMatch(mutated, /NOT EXISTS \(\s*SELECT 1\s*FROM bootstrap_os\.company_acl/);
    const broken = new PGlite();
    try {
      await broken.exec(HARNESS);
      await broken.exec(fs.readFileSync(STARTER_SQL, "utf8"));
      await broken.exec(mutated);
      await broken.exec(RPCS);
      await broken.query("SELECT set_config('app.actor_email', 'founder@example.test', false)");
      const opened = await broken.query("SELECT public.bootstrap_os_create_starter_board() AS body");
      const slug = opened.rows[0].body.slug;
      await assert.rejects(
        broken.query("SELECT public.bootstrap_os_get_journey($1, NULL)", [slug]),
        /starter bet board cannot add members/,
      );
    } finally {
      await broken.close();
    }
  });

  it("removing the starter_boards join makes the backfill write a non-starter idea", async () => {
    const mutated = dropStarterJoin(readFix());
    assert.notEqual(mutated, readFix());
    const leaked = new PGlite();
    try {
      await leaked.exec(HARNESS);
      await leaked.exec(fs.readFileSync(STARTER_SQL, "utf8"));
      await leaked.exec(NON_STARTER_SEED);
      await leaked.exec(mutated);
      assert.equal((await leaked.query(NON_STARTER_IDEA_COUNT)).rows[0].n, 1);
    } finally {
      await leaked.close();
    }
  });
});

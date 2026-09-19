/**
 * Isolated PGlite for weekly Impact/Evidence/Leverage portfolio scores.
 * Never supabase-pirin-ai. Never prod. Fictional alpha/bravo only.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JOURNEY_SQL = path.join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20260902_bootstrap_os_journey.sql",
);
const SUBSCRIBERS_SQL = path.join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20260920_bootstrap_os_board_subscribers.sql",
);
const PROVENANCE_SQL = path.join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20260921_bootstrap_os_list_provenance.sql",
);
const PORTFOLIO_SQL = path.join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20260922_bootstrap_os_portfolio_score.sql",
);

const HARNESS = `
DO $$ BEGIN
  CREATE ROLE anon;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE ROLE authenticated;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE SCHEMA IF NOT EXISTS auth;
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
`;

const STUBS = `
CREATE OR REPLACE FUNCTION public.bootstrap_os_held_label(p_company text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, bootstrap_os AS $$
  SELECT EXISTS (
    SELECT 1
    FROM bootstrap_os.companies c
    JOIN bootstrap_os.company_acl a ON a.company_id = c.id
    WHERE c.slug = lower(p_company)
      AND (
        (a.principal_kind = 'email' AND a.principal = NULLIF(lower(auth.jwt() ->> 'email'), ''))
        OR (a.principal_kind = 'sub' AND a.principal = NULLIF(auth.jwt() ->> 'sub', ''))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.bootstrap_os_ensure_company(p_company text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, bootstrap_os AS $$
DECLARE
  cid uuid;
BEGIN
  IF NOT public.bootstrap_os_held_label(p_company) THEN
    RAISE EXCEPTION 'company not visible';
  END IF;
  SELECT id INTO cid FROM bootstrap_os.companies WHERE slug = lower(p_company);
  IF cid IS NULL THEN
    RAISE EXCEPTION 'company not visible';
  END IF;
  RETURN cid;
END;
$$;

CREATE OR REPLACE FUNCTION public.bootstrap_os_get_journey(p_company text, p_idea text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, bootstrap_os AS $$
DECLARE
  cid uuid;
  company_row bootstrap_os.companies%ROWTYPE;
BEGIN
  cid := public.bootstrap_os_ensure_company(p_company);
  SELECT * INTO company_row FROM bootstrap_os.companies WHERE id = cid;
  RETURN jsonb_build_object(
    'ok', true,
    'company', jsonb_build_object('slug', company_row.slug, 'label', company_row.label)
  );
END;
$$;
`;

const SEED = `
INSERT INTO bootstrap_os.companies (slug, label) VALUES ('alpha', 'alpha'), ('bravo', 'bravo');
INSERT INTO bootstrap_os.company_acl (company_id, principal, principal_kind, role)
SELECT id, 'founder@example.test', 'email', 'founder' FROM bootstrap_os.companies WHERE slug = 'alpha';
INSERT INTO bootstrap_os.company_acl (company_id, principal, principal_kind, role)
SELECT id, 'founder-bravo@example.test', 'email', 'founder' FROM bootstrap_os.companies WHERE slug = 'bravo';
INSERT INTO bootstrap_os.ideas (company_id, slug, name, journey_phase, loop_stage, current_gate, scoreboard)
SELECT id, 'default', 'alpha', 1, 1, 'hold', '{"schema_version": 1}'::jsonb
FROM bootstrap_os.companies WHERE slug = 'alpha';
INSERT INTO bootstrap_os.ideas (company_id, slug, name, journey_phase, loop_stage, current_gate, scoreboard)
SELECT id, 'default', 'bravo', 1, 1, 'hold', '{"schema_version": 1}'::jsonb
FROM bootstrap_os.companies WHERE slug = 'bravo';
`;

const KILL_BOARD = {
  schema_version: 1,
  gateEnrichment: {
    whatChanged: "retired the bet",
    whatWereNotDoing: "not retrying the same pitch",
  },
  killPostmortem: {
    why: "no one would pay for the slice",
    lessonsLearned: "buyers already have a workaround they trust",
    actionableInsights: "next bet starts from an observed paid workaround",
  },
};

let db;

async function asJwt({ email = "", sub = "" }, sql, params = []) {
  await db.query("SELECT set_config('app.actor_email', $1, false)", [email]);
  await db.query("SELECT set_config('app.actor_sub', $1, false)", [sub]);
  const rows = await db.query(sql, params);
  return rows.rows;
}

describe("PGlite portfolio scores (isolated, never prod)", { concurrency: false }, () => {
  before(async () => {
    db = new PGlite();
    await db.exec(HARNESS);
    const journeySql = fs
      .readFileSync(JOURNEY_SQL, "utf8")
      .replace(/CREATE EXTENSION IF NOT EXISTS pgcrypto;/, "-- PGlite: gen_random_uuid is built-in");
    await db.exec(journeySql);
    await db.exec(STUBS);
    await db.exec(fs.readFileSync(SUBSCRIBERS_SQL, "utf8"));
    await db.exec(fs.readFileSync(PROVENANCE_SQL, "utf8"));
    await db.exec(fs.readFileSync(PORTFOLIO_SQL, "utf8"));
    await db.exec(SEED);
  });

  after(async () => {
    await db?.close();
  });

  it("migration is Cos-apply only and names the locked fields", () => {
    const sql = fs.readFileSync(PORTFOLIO_SQL, "utf8");
    assert.match(sql, /Do not migrate\/seed\/live-probe supabase-pirin-ai/);
    assert.match(sql, /bootstrap_os_put_portfolio_score/);
    assert.match(sql, /portfolioScore/);
    assert.match(sql, /impact/);
    assert.match(sql, /evidence/);
    assert.match(sql, /leverage/);
    assert.match(sql, /impact \+ evidence \+ leverage/);
    assert.match(sql, /never auto-promotes/);
    assert.match(sql, /why required/);
    assert.match(sql, /p_why/);
    assert.match(sql, /skip_board_notify/);
    assert.doesNotMatch(sql, /supabase\.co/);
    assert.doesNotMatch(sql, /pg_cron|resend|CREATE EXTENSION/i);
  });

  it("held_label fail-closed: bravo founder cannot read or write alpha scores", async () => {
    const hidden = (
      await asJwt(
        { email: "founder-bravo@example.test" },
        "SELECT public.bootstrap_os_put_portfolio_score($1,$2,$3,$4,$5,$6,$7) AS body",
        ["alpha", "default", 5, 5, 5, "stolen score", true],
      )
    )[0].body;
    assert.equal(hidden.ok, false);
    assert.doesNotMatch(JSON.stringify(hidden), /portfolioScore|"impact":5/);

    let board;
    try {
      board = (
        await asJwt(
          { email: "founder-bravo@example.test" },
          "SELECT public.bootstrap_os_get_journey($1,$2) AS body",
          ["alpha", null],
        )
      )[0].body;
    } catch (err) {
      assert.match(String(err), /company not visible/);
      board = { ok: false };
    }
    assert.doesNotMatch(JSON.stringify(board), /bravo-only|founder@example\.test/);
  });

  it("single-idea skip; out of range reject; two live ideas rank; killed out; no invent; no gate change", async () => {
    const noWhy = (
      await asJwt(
        { email: "founder@example.test" },
        "SELECT public.bootstrap_os_put_portfolio_score($1,$2,$3,$4,$5,$6,$7) AS body",
        ["alpha", "default", 4, 3, 5, "", true],
      )
    )[0].body;
    assert.equal(noWhy.ok, false);
    assert.match(String(noWhy.error), /why required/);

    const skip = (
      await asJwt(
        { email: "founder@example.test" },
        "SELECT public.bootstrap_os_put_portfolio_score($1,$2,$3,$4,$5,$6,$7) AS body",
        ["alpha", "default", 4, 3, 5, "need a second live idea before ranking", true],
      )
    )[0].body;
    assert.equal(skip.ok, true);
    assert.equal(skip.skipped, true);
    assert.match(String(skip.reason), /two or more live/);

    const unread = (
      await asJwt(
        { email: "founder@example.test" },
        "SELECT public.bootstrap_os_get_journey($1,$2) AS body",
        ["alpha", null],
      )
    )[0].body;
    assert.equal(unread.ok, true);
    assert.equal(unread.portfolio.applies, false);
    assert.equal(unread.ideas[0].portfolioScore, null);
    assert.equal(unread.ideas[0].scoreboard.portfolioScore, undefined);

    const bad = (
      await asJwt(
        { email: "founder@example.test" },
        "SELECT public.bootstrap_os_put_portfolio_score($1,$2,$3,$4,$5,$6,$7) AS body",
        ["alpha", "default", 9, 3, 3, "out of range", true],
      )
    )[0].body;
    assert.equal(bad.ok, false);
    assert.match(String(bad.error), /1–5/);

    const created = (
      await asJwt(
        { email: "founder@example.test" },
        "SELECT public.bootstrap_os_create_idea($1,$2,$3,$4,$5) AS body",
        ["alpha", "second-bet", "second-bet", true, "second live idea"],
      )
    )[0].body;
    assert.equal(created.ok, true);

    const first = (
      await asJwt(
        { email: "founder@example.test" },
        "SELECT public.bootstrap_os_put_portfolio_score($1,$2,$3,$4,$5,$6,$7) AS body",
        ["alpha", "default", 5, 4, 3, "operators already pay for a dispatcher", true],
      )
    )[0].body;
    assert.equal(first.ok, true);
    assert.equal(first.skipped, false);
    const scored = (first.ideas || []).find((i) => i.slug === "default");
    assert.equal(scored.clocks.currentGate, "hold");
    assert.equal(scored.portfolioScore.impact, 5);
    assert.equal(scored.portfolioScore.evidence, 4);
    assert.equal(scored.portfolioScore.leverage, 3);
    assert.equal(scored.portfolioScore.why, "operators already pay for a dispatcher");

    const second = (
      await asJwt(
        { email: "founder@example.test" },
        "SELECT public.bootstrap_os_put_portfolio_score($1,$2,$3,$4,$5,$6,$7) AS body",
        ["alpha", "second-bet", 2, 2, 2, "weaker observed pull", true],
      )
    )[0].body;
    assert.equal(second.ok, true);
    assert.equal(second.portfolio.applies, true);
    assert.equal(second.portfolio.formula, "impact + evidence + leverage");
    assert.deepEqual(
      second.portfolio.ranked.map((row) => row.slug),
      ["default", "second-bet"],
    );
    assert.equal(second.portfolio.ranked[0].total, 12);
    assert.equal(second.portfolio.ranked[1].total, 6);
    assert.equal(second.portfolio.ranked[0].why, "operators already pay for a dispatcher");

    const missingWhy = (
      await asJwt(
        { email: "founder@example.test" },
        "SELECT public.bootstrap_os_put_journey($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS body",
        [
          "alpha",
          "second-bet",
          "relabel",
          true,
          null,
          null,
          null,
          null,
          null,
          { schema_version: 1, portfolioScore: { impact: 2, evidence: 2, leverage: 2 } },
        ],
      )
    )[0].body;
    assert.equal(missingWhy.ok, false);
    assert.match(String(missingWhy.error), /why required/);

    const invalidPut = (
      await asJwt(
        { email: "founder@example.test" },
        "SELECT public.bootstrap_os_put_journey($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS body",
        [
          "alpha",
          "second-bet",
          "bad score",
          true,
          null,
          null,
          null,
          null,
          null,
          { schema_version: 1, portfolioScore: { impact: 0, evidence: 3, leverage: 3 } },
        ],
      )
    )[0].body;
    assert.equal(invalidPut.ok, false);
    assert.match(String(invalidPut.error), /1–5/);

    const killed = (
      await asJwt(
        { email: "founder@example.test" },
        "SELECT public.bootstrap_os_put_journey($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS body",
        ["alpha", "second-bet", "no one would pay for the slice", true, null, null, "kill", null, null, KILL_BOARD],
      )
    )[0].body;
    assert.equal(killed.ok, true);
    const afterKill = (
      await asJwt(
        { email: "founder@example.test" },
        "SELECT public.bootstrap_os_get_journey($1,$2) AS body",
        ["alpha", null],
      )
    )[0].body;
    assert.equal(afterKill.portfolio.applies, false);
    assert.equal(afterKill.portfolio.ranked.length, 0);
    const live = afterKill.ideas.find((i) => i.slug === "default");
    const dead = afterKill.ideas.find((i) => i.slug === "second-bet");
    assert.equal(live.portfolioScore.impact, 5);
    assert.equal(dead.killed, true);
    assert.equal(live.clocks.currentGate, "hold");

    const scoreKilled = (
      await asJwt(
        { email: "founder@example.test" },
        "SELECT public.bootstrap_os_put_portfolio_score($1,$2,$3,$4,$5,$6,$7) AS body",
        ["alpha", "second-bet", 5, 5, 5, "killed bets stay off the live rank", true],
      )
    )[0].body;
    assert.equal(scoreKilled.ok, false);
    assert.match(String(scoreKilled.error), /killed ideas/);

    const audit = await db.query(
      `SELECT a.client, a.what_changed
       FROM bootstrap_os.audit_events a
       JOIN bootstrap_os.companies c ON c.id = a.company_id
       WHERE c.slug = 'alpha' AND a.client = 'put_portfolio_score'
       ORDER BY a.at`,
    );
    assert.ok(audit.rows.length >= 1);
    assert.equal(audit.rows[0].what_changed.via, "put_portfolio_score");
    assert.equal(audit.rows[0].what_changed.why, "operators already pay for a dispatcher");
    assert.ok(audit.rows[0].what_changed.before);
    assert.equal(audit.rows[0].what_changed.after.scoreboard.portfolioScore.why, "operators already pay for a dispatcher");

    const outbox = await db.query(
      `SELECT count(*)::int AS n
       FROM bootstrap_os.notify_outbox o
       JOIN bootstrap_os.companies c ON c.id = o.company_id
       WHERE c.slug = 'alpha' AND o.payload->>'summary' = 'portfolio score'`,
    );
    assert.equal(outbox.rows[0].n, 0);
  });
});

/**
 * Isolated Postgres (PGlite). Never supabase-pirin-ai. Never prod.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA = path.join(__dirname, "pglite", "journey-schema.sql");
const MIGRATION = path.join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20260902_bootstrap_os_journey.sql",
);

let db;

async function asApp({ email = "", sub = "" }, sql, params = []) {
  await db.exec("RESET ROLE");
  await db.query("SELECT set_config('app.actor_email', $1, false)", [email]);
  await db.query("SELECT set_config('app.actor_sub', $1, false)", [sub]);
  await db.exec("SET ROLE journey_app");
  const rows = await db.query(sql, params);
  await db.exec("RESET ROLE");
  return rows.rows;
}

describe("PGlite journey RLS (isolated, never prod)", { concurrency: false }, () => {
  before(async () => {
    db = new PGlite();
    await db.exec(fs.readFileSync(SCHEMA, "utf8"));
  });

  after(async () => {
    await db?.close();
  });

  it("fixture never names a hosted Supabase URL or real FAST emails", () => {
    const schema = fs.readFileSync(SCHEMA, "utf8");
    const migration = fs.readFileSync(MIGRATION, "utf8");
    assert.match(schema, /NEVER apply this to supabase-pirin-ai/);
    assert.match(migration, /Do not migrate\/seed\/live-probe supabase-pirin-ai/);
    assert.doesNotMatch(schema, /supabase\.co/);
    assert.doesNotMatch(schema, /BOOTSTRAP_SUPABASE_/);
    assert.doesNotMatch(migration, /INSERT INTO bootstrap_os\.companies/);
    assert.doesNotMatch(migration, /dyeconverter|corehaul/);
    assert.match(schema, /founder-dye@example\.test/);
    assert.doesNotMatch(schema, /@fast\./i);
    assert.doesNotMatch(migration, /auth\.jwt\(\) ->> 'fast'/);
    const createSql = fs.readFileSync(
      path.join(__dirname, "..", "supabase", "migrations", "20260918_bootstrap_os_create_idea.sql"),
      "utf8",
    );
    assert.match(createSql, /bootstrap_os_create_idea/);
    assert.match(createSql, /idea not found; call create_idea first/);
    assert.match(createSql, /p_scoreboard/);
    assert.match(createSql, /v_slug/);
    assert.match(createSql, /Fictional template labels only/);
    assert.doesNotMatch(createSql, /supabase\.co/);
    const disambig = fs.readFileSync(
      path.join(__dirname, "..", "supabase", "migrations", "20260919_bootstrap_os_create_idea_disambiguate_slug.sql"),
      "utf8",
    );
    assert.match(disambig, /v_slug/);
    assert.match(disambig, /42702/);
    const subscribers = fs.readFileSync(
      path.join(__dirname, "..", "supabase", "migrations", "20260920_bootstrap_os_board_subscribers.sql"),
      "utf8",
    );
    assert.match(subscribers, /bootstrap_os_subscribe_board/);
    assert.match(subscribers, /bootstrap_os_unsubscribe_board/);
    assert.match(subscribers, /bootstrap_os_list_subscribers/);
    assert.match(subscribers, /bootstrap_os_change_acl/);
    assert.match(subscribers, /bootstrap_os_list_webhook_deliveries_for_event/);
    assert.match(subscribers, /Do not migrate\/seed\/live-probe supabase-pirin-ai/);
    assert.doesNotMatch(subscribers, /supabase\.co/);
    assert.doesNotMatch(subscribers, /not in this slice/);
    const provenance = fs.readFileSync(
      path.join(__dirname, "..", "supabase", "migrations", "20260921_bootstrap_os_list_provenance.sql"),
      "utf8",
    );
    assert.match(provenance, /bootstrap_os_list_provenance/);
    assert.match(provenance, /lessonsLearned/);
    assert.match(provenance, /actionableInsights/);
    assert.match(provenance, /Do not migrate\/seed\/live-probe supabase-pirin-ai/);
    assert.doesNotMatch(provenance, /supabase\.co/);
    const portfolio = fs.readFileSync(
      path.join(__dirname, "..", "supabase", "migrations", "20260922_bootstrap_os_portfolio_score.sql"),
      "utf8",
    );
    assert.match(portfolio, /bootstrap_os_put_portfolio_score/);
    assert.match(portfolio, /portfolioScore/);
    assert.match(portfolio, /why required/);
    assert.match(portfolio, /Do not migrate\/seed\/live-probe supabase-pirin-ai/);
    assert.doesNotMatch(portfolio, /supabase\.co/);
  });

  it("seed is one default idea per company", async () => {
    const rows = await db.query(
      "SELECT c.slug, count(i.id)::int AS n FROM bootstrap_os.companies c JOIN bootstrap_os.ideas i ON i.company_id = c.id GROUP BY c.slug ORDER BY c.slug",
    );
    assert.deepEqual(rows.rows, [
      { slug: "corehaul", n: 1 },
      { slug: "dyeconverter", n: 1 },
    ]);
  });

  it("FORCE RLS: founder sees own company only; advisor both; stranger none", async () => {
    const dye = await asApp(
      { email: "founder-dye@example.test" },
      "SELECT slug FROM bootstrap_os.companies ORDER BY slug",
    );
    assert.deepEqual(
      dye.map((r) => r.slug),
      ["dyeconverter"],
    );
    const core = await asApp(
      { email: "founder-core@example.test" },
      "SELECT slug FROM bootstrap_os.companies ORDER BY slug",
    );
    assert.deepEqual(
      core.map((r) => r.slug),
      ["corehaul"],
    );
    const cos = await asApp(
      { email: "advisor-cos@example.test" },
      "SELECT slug FROM bootstrap_os.companies ORDER BY slug",
    );
    assert.deepEqual(
      cos.map((r) => r.slug),
      ["corehaul", "dyeconverter"],
    );
    const stranger = await asApp(
      { email: "stranger@example.test" },
      "SELECT slug FROM bootstrap_os.companies ORDER BY slug",
    );
    assert.deepEqual(stranger, []);
    const empty = await asApp({}, "SELECT slug FROM bootstrap_os.companies");
    assert.deepEqual(empty, []);
  });

  it("email fallback sub: sub-only founder reads CoreHaul, not DyeConverter", async () => {
    const rows = await asApp(
      { sub: "sub-only-corehaul" },
      "SELECT slug FROM bootstrap_os.companies ORDER BY slug",
    );
    assert.deepEqual(
      rows.map((r) => r.slug),
      ["corehaul"],
    );
  });

  it("company query vs idea query: extra idea is visible only under that company", async () => {
    await db.exec("RESET ROLE");
    await db.exec(`
      INSERT INTO bootstrap_os.ideas (id, company_id, slug, name, journey_phase, loop_stage, current_gate, scoreboard)
      VALUES ('idea-core-2', 'co-core', 'last-mile', 'last-mile', 1, 1, 'hold', '{"schema_version": 1}')
    `);
    const company = await asApp(
      { email: "founder-core@example.test" },
      "SELECT slug FROM bootstrap_os.ideas WHERE company_id = 'co-core' ORDER BY slug",
    );
    assert.deepEqual(
      company.map((r) => r.slug),
      ["corehaul", "last-mile"],
    );
    const one = await asApp(
      { email: "founder-core@example.test" },
      "SELECT slug FROM bootstrap_os.ideas WHERE company_id = 'co-core' AND slug = 'last-mile'",
    );
    assert.deepEqual(
      one.map((r) => r.slug),
      ["last-mile"],
    );
    const dyeSees = await asApp(
      { email: "founder-dye@example.test" },
      "SELECT slug FROM bootstrap_os.ideas ORDER BY slug",
    );
    assert.deepEqual(
      dyeSees.map((r) => r.slug),
      ["dyeconverter"],
    );
    await db.exec("RESET ROLE");
    await db.exec("DELETE FROM bootstrap_os.ideas WHERE id = 'idea-core-2'");
  });

  it("founder write, advisor cannot update clocks, authorized can", async () => {
    await asApp(
      { email: "founder-dye@example.test" },
      "UPDATE bootstrap_os.ideas SET journey_phase = 2, current_gate = 'advance' WHERE id = 'idea-dye'",
    );
    const afterFounder = await asApp(
      { email: "founder-dye@example.test" },
      "SELECT journey_phase, current_gate FROM bootstrap_os.ideas WHERE id = 'idea-dye'",
    );
    assert.equal(afterFounder[0].journey_phase, 2);
    assert.equal(afterFounder[0].current_gate, "advance");

    await asApp(
      { email: "advisor-cos@example.test" },
      "UPDATE bootstrap_os.ideas SET journey_phase = 9 WHERE id = 'idea-dye'",
    );
    const afterAdvisor = await asApp(
      { email: "founder-dye@example.test" },
      "SELECT journey_phase FROM bootstrap_os.ideas WHERE id = 'idea-dye'",
    );
    assert.equal(afterAdvisor[0].journey_phase, 2);

    await asApp(
      { email: "authorized-dye@example.test" },
      "UPDATE bootstrap_os.ideas SET loop_stage = 3 WHERE id = 'idea-dye'",
    );
    const afterAuth = await asApp(
      { email: "founder-dye@example.test" },
      "SELECT loop_stage FROM bootstrap_os.ideas WHERE id = 'idea-dye'",
    );
    assert.equal(afterAuth[0].loop_stage, 3);
  });

  it("one mentee cannot write another company's clocks", async () => {
    await asApp(
      { email: "founder-core@example.test" },
      "UPDATE bootstrap_os.ideas SET journey_phase = 8 WHERE id = 'idea-dye'",
    );
    const dye = await asApp(
      { email: "founder-dye@example.test" },
      "SELECT journey_phase FROM bootstrap_os.ideas WHERE id = 'idea-dye'",
    );
    assert.equal(dye[0].journey_phase, 2);
  });

  it("advisor comment inserts; comments cannot mutate gates; founder cannot comment", async () => {
    await asApp(
      { email: "advisor-cos@example.test" },
      "INSERT INTO bootstrap_os.comments (id, idea_id, body, who) VALUES ('c1', 'idea-core', 'help needed on the slice', 'advisor-cos@example.test')",
    );
    const comments = await asApp(
      { email: "founder-core@example.test" },
      "SELECT body FROM bootstrap_os.comments WHERE idea_id = 'idea-core'",
    );
    assert.equal(comments.length, 1);
    let founderCommentFailed = false;
    try {
      await asApp(
        { email: "founder-core@example.test" },
        "INSERT INTO bootstrap_os.comments (id, idea_id, body, who) VALUES ('c2', 'idea-core', 'should fail', 'founder-core@example.test')",
      );
    } catch {
      founderCommentFailed = true;
    }
    assert.equal(founderCommentFailed, true);
    const clocks = await asApp(
      { email: "founder-core@example.test" },
      "SELECT journey_phase, loop_stage, current_gate FROM bootstrap_os.ideas WHERE id = 'idea-core'",
    );
    assert.equal(clocks[0].journey_phase, 1);
    assert.equal(clocks[0].loop_stage, 1);
    assert.equal(clocks[0].current_gate, "hold");
  });

  it("enums vs jsonb: clocks reject 10; scoreboard stays jsonb", async () => {
    let phaseFailed = false;
    try {
      await db.exec("UPDATE bootstrap_os.ideas SET journey_phase = 10 WHERE id = 'idea-core'");
    } catch {
      phaseFailed = true;
    }
    assert.equal(phaseFailed, true);
    let gateFailed = false;
    try {
      await db.exec("UPDATE bootstrap_os.ideas SET current_gate = 'maybe' WHERE id = 'idea-core'");
    } catch {
      gateFailed = true;
    }
    assert.equal(gateFailed, true);
    await db.exec(
      "UPDATE bootstrap_os.ideas SET scoreboard = '{\"schema_version\": 1, \"openQuestions\": [\"who pays\"]}' WHERE id = 'idea-core'",
    );
    const row = await db.query(
      "SELECT scoreboard->>'schema_version' AS v, scoreboard->'openQuestions'->>0 AS q FROM bootstrap_os.ideas WHERE id = 'idea-core'",
    );
    assert.equal(row.rows[0].v, "1");
    assert.equal(row.rows[0].q, "who pays");
    const clocks = await db.query(
      "SELECT journey_phase FROM bootstrap_os.ideas WHERE id = 'idea-core'",
    );
    assert.equal(clocks.rows[0].journey_phase, 1);
  });

  it("append-only audit: put/comment/ACL emit; advisor reads; journey_app cannot insert or mutate", async () => {
    await db.query("SELECT set_config('app.client', 'cursor-agent', false)");
    await asApp(
      { email: "founder-core@example.test" },
      "UPDATE bootstrap_os.ideas SET journey_phase = 3 WHERE id = 'idea-core'",
    );
    await asApp(
      { email: "advisor-cos@example.test" },
      "INSERT INTO bootstrap_os.comments (id, idea_id, body, who) VALUES ('c-audit', 'idea-core', 'audit me', 'advisor-cos@example.test')",
    );
    await db.exec("RESET ROLE");
    await db.exec(
      "INSERT INTO bootstrap_os.company_acl (id, company_id, principal, principal_kind, role) VALUES ('acl-core-spec', 'co-core', 'specialist@example.test', 'email', 'advisor')",
    );

    const advisorAudit = await asApp(
      { email: "advisor-cos@example.test" },
      "SELECT what_changed->>'via' AS via, client, idea_id IS NULL AS company_level FROM bootstrap_os.audit_events WHERE company_id = 'co-core' ORDER BY via",
    );
    const vias = advisorAudit.map((r) => r.via).sort();
    assert.ok(vias.includes("put_journey"));
    assert.ok(vias.includes("post_comment"));
    assert.ok(vias.includes("acl"));
    assert.ok(advisorAudit.some((r) => r.company_level === true && r.via === "acl"));
    assert.ok(
      advisorAudit.some((r) => r.via === "put_journey" && r.client === "cursor-agent"),
    );
    assert.ok(
      advisorAudit.some((r) => r.via === "post_comment" && r.client === "cursor-agent"),
    );

    const dyeAudit = await asApp(
      { email: "founder-dye@example.test" },
      "SELECT id FROM bootstrap_os.audit_events WHERE company_id = 'co-core'",
    );
    assert.deepEqual(dyeAudit, []);
    const stranger = await asApp(
      { email: "stranger@example.test" },
      "SELECT id FROM bootstrap_os.audit_events",
    );
    assert.deepEqual(stranger, []);

    let insertFailed = false;
    try {
      await asApp(
        { email: "advisor-cos@example.test" },
        "INSERT INTO bootstrap_os.audit_events (company_id, idea_id, who, client, what_changed) VALUES ('co-core', 'idea-core', 'advisor-cos@example.test', 'forged', '{\"via\":\"forged\"}'::jsonb)",
      );
    } catch {
      insertFailed = true;
    }
    assert.equal(insertFailed, true);

    let updateFailed = false;
    try {
      await asApp(
        { email: "advisor-cos@example.test" },
        "UPDATE bootstrap_os.audit_events SET who = 'forged' WHERE company_id = 'co-core'",
      );
    } catch {
      updateFailed = true;
    }
    const afterUpdate = await asApp(
      { email: "advisor-cos@example.test" },
      "SELECT count(*) FILTER (WHERE who = 'forged')::int AS n FROM bootstrap_os.audit_events",
    );
    assert.ok(updateFailed || afterUpdate[0].n === 0);

    let deleteFailed = false;
    try {
      await asApp(
        { email: "advisor-cos@example.test" },
        "DELETE FROM bootstrap_os.audit_events WHERE company_id = 'co-core'",
      );
    } catch {
      deleteFailed = true;
    }
    const remaining = await asApp(
      { email: "advisor-cos@example.test" },
      "SELECT count(*)::int AS n FROM bootstrap_os.audit_events WHERE company_id = 'co-core'",
    );
    assert.ok(deleteFailed || remaining[0].n >= 3);
    assert.ok(remaining[0].n >= 3);
  });

  it("constraint_this_week is short jsonb text, not a clock; write emits audit", async () => {
    await db.query("SELECT set_config('app.client', 'cursor-agent', false)");
    const before = await asApp(
      { email: "founder-core@example.test" },
      "SELECT journey_phase, current_gate FROM bootstrap_os.ideas WHERE id = 'idea-core'",
    );
    await asApp(
      { email: "founder-core@example.test" },
      `UPDATE bootstrap_os.ideas SET scoreboard = jsonb_set(
         COALESCE(scoreboard, '{"schema_version": 1}'::jsonb),
         '{constraint_this_week}',
         '"need two paying operators"'
       ) WHERE id = 'idea-core'`,
    );
    const after = await asApp(
      { email: "founder-core@example.test" },
      "SELECT journey_phase, current_gate, scoreboard->>'constraint_this_week' AS c FROM bootstrap_os.ideas WHERE id = 'idea-core'",
    );
    assert.equal(after[0].journey_phase, before[0].journey_phase);
    assert.equal(after[0].current_gate, before[0].current_gate);
    assert.equal(after[0].c, "need two paying operators");

    const advisor = await asApp(
      { email: "advisor-cos@example.test" },
      "SELECT what_changed->>'constraint_this_week' AS c, what_changed->>'via' AS via FROM bootstrap_os.audit_events WHERE company_id = 'co-core' AND what_changed->>'constraint_this_week' = 'need two paying operators'",
    );
    assert.ok(advisor.some((r) => r.via === "put_journey" && r.c === "need two paying operators"));

    let longFailed = false;
    try {
      await db.exec(
        `UPDATE bootstrap_os.ideas SET scoreboard = '{"schema_version": 1, "constraint_this_week": "${"x".repeat(281)}"}' WHERE id = 'idea-core'`,
      );
    } catch {
      longFailed = true;
    }
    assert.equal(longFailed, true);

    let typeFailed = false;
    try {
      await db.exec(
        `UPDATE bootstrap_os.ideas SET scoreboard = '{"schema_version": 1, "constraint_this_week": 9}' WHERE id = 'idea-core'`,
      );
    } catch {
      typeFailed = true;
    }
    assert.equal(typeFailed, true);
  });

  it("board notify: ACL-only subscribe; mentee isolation; webhook enqueue; comments do not move gates", async () => {
    let strangerFailed = false;
    try {
      await asApp(
        { email: "founder-core@example.test" },
        "INSERT INTO bootstrap_os.board_subscribers (id, company_id, principal, principal_kind, webhook_url, email_opt_in, created_by) VALUES ('sub-stranger', 'co-core', 'stranger@example.test', 'email', 'https://hooks.example.test/x', true, 'founder-core@example.test')",
      );
    } catch {
      strangerFailed = true;
    }
    assert.equal(strangerFailed, true);

    let dyeFailed = false;
    try {
      await asApp(
        { email: "founder-dye@example.test" },
        "INSERT INTO bootstrap_os.board_subscribers (id, company_id, principal, principal_kind, webhook_url, email_opt_in, created_by) VALUES ('sub-cross', 'co-core', 'advisor-cos@example.test', 'email', 'https://hooks.example.test/x', false, 'founder-dye@example.test')",
      );
    } catch {
      dyeFailed = true;
    }
    assert.equal(dyeFailed, true);

    let advisorFailed = false;
    try {
      await asApp(
        { email: "advisor-cos@example.test" },
        "INSERT INTO bootstrap_os.board_subscribers (id, company_id, principal, principal_kind, webhook_url, email_opt_in, created_by) VALUES ('sub-self', 'co-core', 'advisor-cos@example.test', 'email', 'https://hooks.example.test/x', false, 'advisor-cos@example.test')",
      );
    } catch {
      advisorFailed = true;
    }
    assert.equal(advisorFailed, true);

    await asApp(
      { email: "founder-core@example.test" },
      "INSERT INTO bootstrap_os.board_subscribers (id, company_id, principal, principal_kind, webhook_url, email_opt_in, created_by) VALUES ('sub-core', 'co-core', 'advisor-cos@example.test', 'email', 'https://hooks.example.test/core', true, 'founder-core@example.test')",
    );

    const listed = await asApp(
      { email: "advisor-cos@example.test" },
      "SELECT principal, email_opt_in FROM bootstrap_os.board_subscribers WHERE company_id = 'co-core'",
    );
    assert.equal(listed.length, 1);
    assert.equal(listed[0].principal, "advisor-cos@example.test");

    const dyeSees = await asApp(
      { email: "founder-dye@example.test" },
      "SELECT id FROM bootstrap_os.board_subscribers WHERE company_id = 'co-core'",
    );
    assert.deepEqual(dyeSees, []);

    await asApp(
      { email: "founder-core@example.test" },
      "UPDATE bootstrap_os.ideas SET journey_phase = 2 WHERE id = 'idea-core'",
    );
    const outbox = await asApp(
      { email: "advisor-cos@example.test" },
      "SELECT channel, event_type, payload->>'summary' AS summary, payload->'company'->>'slug' AS slug FROM bootstrap_os.notify_outbox WHERE company_id = 'co-core' ORDER BY channel",
    );
    assert.ok(outbox.some((r) => r.channel === "webhook" && r.event_type === "put_journey"));
    assert.ok(outbox.some((r) => r.channel === "email" && r.event_type === "put_journey"));
    assert.ok(outbox.every((r) => r.slug === "corehaul"));

    const clocksBefore = await asApp(
      { email: "founder-core@example.test" },
      "SELECT journey_phase, current_gate FROM bootstrap_os.ideas WHERE id = 'idea-core'",
    );
    await asApp(
      { email: "advisor-cos@example.test" },
      "INSERT INTO bootstrap_os.comments (id, idea_id, body, who) VALUES ('c-notify', 'idea-core', 'help on the slice', 'advisor-cos@example.test')",
    );
    const clocksAfter = await asApp(
      { email: "founder-core@example.test" },
      "SELECT journey_phase, current_gate FROM bootstrap_os.ideas WHERE id = 'idea-core'",
    );
    assert.equal(clocksAfter[0].journey_phase, clocksBefore[0].journey_phase);
    assert.equal(clocksAfter[0].current_gate, clocksBefore[0].current_gate);
    const commentOutbox = await asApp(
      { email: "advisor-cos@example.test" },
      "SELECT event_type FROM bootstrap_os.notify_outbox WHERE event_type = 'post_comment'",
    );
    assert.equal(commentOutbox.length >= 1, true);

    let outboxInsertFailed = false;
    try {
      await asApp(
        { email: "advisor-cos@example.test" },
        "INSERT INTO bootstrap_os.notify_outbox (company_id, idea_id, subscriber_id, channel, event_type, payload) VALUES ('co-core', 'idea-core', 'sub-core', 'webhook', 'put_journey', '{\"event\":\"forged\"}'::jsonb)",
      );
    } catch {
      outboxInsertFailed = true;
    }
    assert.equal(outboxInsertFailed, true);
  });
});

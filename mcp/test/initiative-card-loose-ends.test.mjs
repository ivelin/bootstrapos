/**
 * PR2.2 — initiative card loose ends.
 * Dual-read dead for card lead, rank computed, compact get_journey.
 * Fixture/test only. Mapping cannot Advance. No CoreHaul. No live board write.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fixtureJourneyStore } from "../dist/journey.js";
import {
  DUAL_READ_DEAD_FOR_CARD_LEAD,
  GET_JOURNEY_COMPACT_MAX,
  RANK_IS_COMPUTED_NOT_STORED,
  cardFromScoreboard,
  compactJourneyPayload,
  formatInitiativeCard,
  rankInitiatives,
  snapshotLeadOmitsProgress,
  stripLegacyCardKeysWhenInitiatives,
} from "../dist/initiative-card.js";
import { REPO_ROOT } from "./helpers.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DYE = JSON.parse(
  fs.readFileSync(path.join(HERE, "fixtures", "dyeconverter-initiatives.json"), "utf8"),
);
const MIC = JSON.parse(
  fs.readFileSync(path.join(HERE, "fixtures", "micdots-initiatives.json"), "utf8"),
);

const PRODUCT_CHECK = {
  id: "alpha-check-1",
  kind: "customer_check",
  premise: "operators who already pay for dispatch at bravo plant",
  measure: "one paid weekly report used in their shop",
  killLine: "kill if they do not use the weekly report",
  status: "active",
  last: "hold fixture",
  next: "named operator conversation",
  outcome: "none",
  impact: "none",
  evidence: "stated",
};

const NESTED = {
  id: "alpha-eng-1",
  kind: "engagement",
  premise: "bravo plant intro",
  measure: "talk is not Try",
  killLine: "talk is not Try",
  status: "waiting",
  last: "intro sent",
  next: "paid or use",
  outcome: "none",
  impact: "learning",
  evidence: "stated",
  parentId: "alpha-check-1",
};

const PAPER = {
  id: "alpha-legal-1",
  kind: "legal",
  premise: "plan not adopted",
  measure: "parked",
  killLine: "legal paper cannot promote",
  status: "waiting",
  last: "parked",
  next: "parked",
  outcome: "none",
  impact: "none",
  evidence: "stated",
};

function bearer(email) {
  return { authenticated: true, email, principal: email, identityStore: "memory" };
}

describe("PR2.2 initiative card loose ends", () => {
  it("DyeConverter constraint is Oterra quote to SKU+site+date; MicDots Heavy stays", () => {
    assert.equal(DYE.scoreboard.constraint_this_week, "Oterra quote to SKU+site+date");
    assert.doesNotMatch(DYE.scoreboard.constraint_this_week, /FAST|SAFE|SOPA|legal/i);
    assert.equal(DYE.currentGate, "hold");
    assert.equal(DYE.journeyPhase, 1);
    assert.equal(MIC.scoreboard.constraint_this_week, "CCG trial to paid retainer after Sam budget check");
    assert.equal(MIC.scoreboard.initiatives[0].id, "mic-check-paid-site");
    assert.equal(MIC.scoreboard.initiatives.find((row) => row.id === "mic-eng-granite").parentId, "mic-check-paid-site");
    assert.equal(MIC.scoreboard.initiatives.some((row) => row.id === "mic-check-ccg"), false);
    assert.deepEqual(MIC.scoreboard.openQuestions, [
      "Did Donna talk to Sam?",
      "CCG SOW in draft?",
      "Angel SAFE in inbox?",
    ]);
  });

  it("when initiatives[] is present, put_journey clears progress/supporting/engagements", async () => {
    const store = fixtureJourneyStore();
    const founder = bearer("founder-dye@example.test");
    const wrote = await store.putJourney(founder, {
      companySlug: "dyeconverter",
      initiatives: DYE.scoreboard.initiatives,
      scoreboard: {
        schema_version: 1,
        progress: ["called the plant", "wrote a landing page draft"],
        supporting: [
          {
            role: "advisor",
            state: "promise",
            clock: "—",
            nextAction: "send FAST draft",
            lastObservedFact: "office hours tip recorded",
          },
        ],
        engagements: [{ account: "bravo plant", kind: "nda", state: "clock" }],
        constraint_this_week: DYE.scoreboard.constraint_this_week,
        openQuestions: DYE.scoreboard.openQuestions,
        hypothesis: DYE.scoreboard.hypothesis,
      },
      why: "recon map Heavy-locked dyeconverter initiatives",
      founderYes: false,
    });
    assert.equal(wrote.ok, true, wrote.error || JSON.stringify(wrote).slice(0, 200));
    assert.equal(wrote.idea.scoreboard.progress, undefined);
    assert.equal(wrote.idea.scoreboard.supporting, undefined);
    assert.equal(wrote.idea.scoreboard.engagements, undefined);
    assert.equal(wrote.card.bottleneck.id, "dye-check-plant");
    assert.equal(wrote.idea.clocks.journeyPhase, 1);
    assert.equal(wrote.idea.clocks.currentGate, "hold");
  });

  it("when initiatives present, card lead must not come from progress[]", () => {
    const progress = ["called the plant", "wrote a landing page draft"];
    const scoreboard = {
      initiatives: [PRODUCT_CHECK, NESTED, PAPER],
      progress,
      constraint_this_week: "need one operator who already pays",
    };
    const card = cardFromScoreboard({
      slug: "alpha",
      label: "alpha",
      journeyPhase: 1,
      gate: "hold",
      scoreboard,
    });
    const body = formatInitiativeCard(card).join("\n");
    assert.equal(snapshotLeadOmitsProgress(body, progress), true);
    assert.doesNotMatch(body, /called the plant/);
    assert.doesNotMatch(body, /landing page draft/);
    assert.match(body, /#1 BOTTLENECK  alpha-check-1/);
    assert.equal(card.bottleneck.id, "alpha-check-1");
    assert.notEqual(card.bottleneck.kind, "legal");
  });

  it("rank is computed not stored; paper never titles at journeyPhase 1", () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, "mcp/src/initiative-card.ts"), "utf8");
    assert.match(src, new RegExp(RANK_IS_COMPUTED_NOT_STORED.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(src, new RegExp(DUAL_READ_DEAD_FOR_CARD_LEAD.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(src, /priority\?: number/);
    const ranked = rankInitiatives([PRODUCT_CHECK, NESTED, PAPER]);
    assert.equal(ranked.bottleneck?.id, "alpha-check-1");
    assert.equal(ranked.bottleneck?.kind, "customer_check");
    assert.deepEqual(
      ranked.customerChecks[0].engagements.map((row) => row.id),
      ["alpha-eng-1"],
    );
    assert.equal(ranked.footer.some((row) => row.id === "alpha-legal-1"), true);
    assert.notEqual(ranked.bottleneck?.kind, "legal");
    assert.notEqual(ranked.bottleneck?.kind, "capital");
    assert.notEqual(ranked.bottleneck?.kind, "advisor");
    for (const row of [...DYE.scoreboard.initiatives, ...MIC.scoreboard.initiatives]) {
      assert.equal("priority" in row, false);
      assert.equal("journeyPhase" in row, false);
    }
  });

  it("jsonb - strips legacy keys; shallow merge cannot delete", () => {
    const merged = stripLegacyCardKeysWhenInitiatives({
      schema_version: 1,
      initiatives: [PRODUCT_CHECK],
      progress: ["called the plant"],
      supporting: [{ role: "advisor" }],
      engagements: [{ account: "x" }],
    });
    assert.equal(merged.progress, undefined);
    assert.equal(merged.supporting, undefined);
    assert.equal(merged.engagements, undefined);
    assert.equal(merged.initiatives[0].id, "alpha-check-1");
    const sql = fs.readFileSync(
      path.join(REPO_ROOT, "mcp/supabase/migrations/20260927_bootstrap_os_dual_read_dead.sql"),
      "utf8",
    );
    assert.match(sql, /scoreboard - 'progress' - 'supporting' - 'engagements'/);
    assert.match(sql, /jsonb_array_length\(scoreboard->'initiatives'\) > 0/);
    assert.match(sql, /Do not migrate\/seed\/live-probe supabase-pirin-ai/);
    assert.doesNotMatch(sql, /dyeconverter|corehaul|micdots/);
    assert.match(sql, /No priority integer/);
    assert.doesNotMatch(sql, /ADD COLUMN\s+priority/i);
  });

  it("default get_journey is compact: top-level card, no full audit", async () => {
    const store = fixtureJourneyStore();
    const founder = bearer("founder-mic@example.test");
    const wrote = await store.putJourney(founder, {
      companySlug: "micdots",
      initiatives: MIC.scoreboard.initiatives,
      scoreboard: {
        schema_version: 1,
        constraint_this_week: MIC.scoreboard.constraint_this_week,
        openQuestions: MIC.scoreboard.openQuestions,
        hypothesis: MIC.scoreboard.hypothesis,
        progress: ["noise that must not lead"],
      },
      why: "recon map Heavy-locked micdots initiatives",
      founderYes: false,
    });
    assert.equal(wrote.ok, true, wrote.error || "");
    const slim = await store.getJourney(founder, { companySlug: "micdots" });
    assert.equal(slim.ok, true);
    assert.equal(slim.card.bottleneck.id, "mic-check-paid-site");
    assert.deepEqual(slim.audit, []);
    assert.equal(slim.auditVia, "list_provenance");
    assert.equal(snapshotLeadOmitsProgress(slim.ideas[0].snapshot, ["noise that must not lead"]), true);
    assert.doesNotMatch(slim.ideas[0].snapshot, /noise that must not lead/);
    const fat = {
      ok: true,
      card: slim.card,
      audit: Array.from({ length: 80 }, (_, i) => ({
        at: `2026-09-21T00:00:${String(i).padStart(2, "0")}Z`,
        whatChanged: { via: "put_journey", blob: "x".repeat(400) },
      })),
    };
    const compacted = compactJourneyPayload(fat);
    assert.deepEqual(compacted.audit, []);
    assert.ok(JSON.stringify(compacted).length < GET_JOURNEY_COMPACT_MAX);
    const expanded = await store.getJourney(founder, {
      companySlug: "micdots",
      expandMeetingDoc: true,
    });
    assert.ok(Array.isArray(expanded.audit));
    assert.ok(expanded.audit.length >= 1);
  });
});

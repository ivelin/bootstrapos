/**
 * OS 2.8.19 initiative report card (PR0).
 * Fixtures: fictional alpha only. No mentee / PII. No live journeyPhase.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MemoryJourneyStore, defaultScoreboard } from "../dist/journey.js";
import {
  CONCATENATED_LEAD_REJECTED,
  CUSTOMER_CHECK_WIP,
  cardBodyOmitsProgress,
  cardFromScoreboard,
  formatInitiativeCard,
  hasPaidUse,
  initiativesFromLegacy,
  isConcatenatedClockOperatingLead,
  normalizeInitiatives,
} from "../dist/initiative-card.js";
import { OS_VERSION } from "../dist/constants.js";
import { initiativeMappingMayAdvance } from "../dist/house-rules.js";
import { REPO_ROOT } from "./helpers.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(HERE, "..", "docs", "hosted-board-import.json"), "utf8"),
);

const PRODUCT_CHECK = {
  id: "alpha-check-1",
  kind: "customer_check",
  premise: "operators who already pay for dispatch at bravo plant — one conversation by 2026-10-03",
  measure: "one paid weekly report used in their shop",
  killLine: "kill if they do not use the weekly report",
  status: "active",
  last: "hold fixture",
  next: "named operator conversation with a date",
  outcome: "none",
  impact: "none",
  evidence: "stated",
  clock: "2026-10-03",
};

const NESTED_NDA = {
  id: "alpha-eng-1",
  kind: "engagement",
  premise: "bravo plant NDA",
  measure: "signed paper is not Try",
  killLine: "NDA is not Try",
  status: "waiting",
  last: "nda sent",
  next: "paid or use in their environment",
  outcome: "none",
  impact: "obligation",
  evidence: "stated",
  parentId: "alpha-check-1",
};

const CONCAT_LEAD = {
  ...PRODUCT_CHECK,
  id: "concat-lead",
  premise: "need one operator who already pays + close the SAFE by 2026-10-03",
  measure: "pay or use and file the SAFE",
  killLine: "kill if they do not pay and the SAFE slips",
};

function bearer(email) {
  return { authenticated: true, email, principal: email, identityStore: "memory" };
}

function alphaStore(scoreboard = defaultScoreboard()) {
  return new MemoryJourneyStore(
    [{ id: "co-alpha", slug: "alpha", label: "alpha" }],
    [
      {
        companyId: "co-alpha",
        principal: "founder@example.test",
        principalKind: "email",
        role: "founder",
      },
    ],
    [
      {
        id: "idea-alpha",
        companyId: "co-alpha",
        slug: "default",
        name: "alpha",
        journeyPhase: 1,
        loopStage: 1,
        currentGate: "hold",
        scoreboard,
      },
    ],
    [],
    [],
  );
}

describe("OS 2.8.19 initiative report card", () => {
  it("pins pack version and mapping cannot Advance", () => {
    assert.equal(OS_VERSION, "2.8.19");
    assert.equal(initiativeMappingMayAdvance(), false);
    assert.equal(isConcatenatedClockOperatingLead(CONCAT_LEAD.premise), true);
    assert.equal(isConcatenatedClockOperatingLead(PRODUCT_CHECK.premise), false);
  });

  it("alpha fixture lead is customer_check with nested engagement", () => {
    const alpha = FIXTURE.companies.find((c) => c.slug === "alpha");
    assert.ok(alpha);
    const rows = alpha.scoreboard.initiatives;
    assert.equal(rows[0].kind, "customer_check");
    assert.equal(rows[1].kind, "engagement");
    assert.equal(rows[1].parentId, rows[0].id);
    const card = cardFromScoreboard({
      slug: "alpha",
      label: "alpha",
      journeyPhase: 1,
      gate: "hold",
      scoreboard: alpha.scoreboard,
    });
    assert.equal(card.bottleneck?.kind, "customer_check");
    assert.equal(card.company.bottleneckId, rows[0].id);
    assert.equal(card.company.wipLimit, 1);
    assert.equal(card.customerChecks[0].engagements[0].id, "alpha-eng-1");
    assert.equal(card.footer.some((row) => row.kind === "legal"), true);
    assert.match(card.warn || "", /impact=clock/);
    const body = formatInitiativeCard(card).join("\n");
    assert.match(body, /WHERE ARE WE — alpha/);
    assert.match(body, /#1 BOTTLENECK/);
    assert.match(body, /CUSTOMER CHECKS/);
    assert.match(body, /OTHER INITIATIVES/);
    assert.match(body, /NDA is not Try/);
    assert.doesNotMatch(body, /Ask \/ Do \/ Write back is a card/);
  });

  it("concatenated Clock/Operating lead fails", () => {
    const hit = normalizeInitiatives([CONCAT_LEAD]);
    assert.equal(hit.ok, false);
    assert.equal(hit.error, CONCATENATED_LEAD_REJECTED);
  });

  it("progress[] is not card body", () => {
    const progress = ["called the plant", "wrote a landing page draft"];
    const card = cardFromScoreboard({
      slug: "alpha",
      label: "alpha",
      journeyPhase: 1,
      gate: "hold",
      scoreboard: { initiatives: [PRODUCT_CHECK, NESTED_NDA], progress },
    });
    const body = formatInitiativeCard(card).join("\n");
    assert.equal(cardBodyOmitsProgress(body, progress), true);
    assert.doesNotMatch(body, /landing page draft/);
    assert.doesNotMatch(body, /called the plant/);
  });

  it("no mentee names in card fixtures or adapter", () => {
    const files = [
      path.join(REPO_ROOT, "mcp/src/initiative-card.ts"),
      path.join(REPO_ROOT, "mcp/test/initiative-report-card.test.mjs"),
      path.join(REPO_ROOT, "mcp/docs/hosted-board-import.json"),
    ];
    const blob = files.map((f) => fs.readFileSync(f, "utf8")).join("\n");
    assert.doesNotMatch(blob, /Alejo|UPSELLerate|FedProx|totbox|zk0/i);
    assert.match(blob, /\balpha\b/);
  });

  it("dual-reads old supporting / engagements / constraintThisWeek", () => {
    const rows = initiativesFromLegacy({
      constraint_this_week: "need one operator who already pays",
      supporting: [
        {
          role: "advisor",
          state: "promise",
          clock: "—",
          nextAction: "send FAST draft",
          lastObservedFact: "office hours tip recorded",
        },
        {
          role: "investor",
          state: "clock",
          clock: "2026-11-01",
          nextAction: "SAFE side file",
          lastObservedFact: "term sheet talk",
        },
      ],
      engagements: [{ account: "bravo plant", kind: "nda", state: "clock" }],
    });
    assert.equal(rows[0].kind, "customer_check");
    assert.equal(rows[0].id, "legacy-constraint");
    assert.equal(rows.some((r) => r.kind === "advisor"), true);
    assert.equal(rows.some((r) => r.kind === "capital"), true);
    const nda = rows.find((r) => r.kind === "engagement");
    assert.equal(nda.parentId, "legacy-constraint");
    assert.equal(nda.outcome, "none");
    const card = cardFromScoreboard({
      slug: "alpha",
      label: "alpha",
      journeyPhase: 1,
      gate: "hold",
      scoreboard: {
        constraint_this_week: "need one operator who already pays",
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
      },
    });
    assert.equal(card.bottleneck?.kind, "customer_check");
    assert.equal(card.customerChecks[0].engagements[0].premise, "bravo plant");
  });

  it("new writes go to initiatives[] and get_journey returns the card", async () => {
    const store = alphaStore();
    const founder = bearer("founder@example.test");
    const wrote = await store.putJourney(founder, {
      companySlug: "alpha",
      initiatives: [PRODUCT_CHECK, NESTED_NDA],
      scoreboard: {
        schema_version: 1,
        progress: ["called the plant"],
      },
      why: "recon patch initiatives",
      founderYes: false,
    });
    assert.equal(wrote.ok, true);
    assert.equal(wrote.idea.clocks.journeyPhase, 1);
    assert.equal(wrote.card.bottleneck.kind, "customer_check");
    assert.equal(wrote.idea.scoreboard.initiatives[0].kind, "customer_check");
    assert.deepEqual(wrote.idea.scoreboard.progress, ["called the plant"]);
    const seen = await store.getJourney(founder, { companySlug: "alpha" });
    assert.equal(seen.ok, true);
    assert.equal(seen.card.bottleneck.kind, "customer_check");
    assert.match(seen.ideas[0].snapshot, /WHERE ARE WE — alpha/);
    assert.doesNotMatch(seen.ideas[0].snapshot, /called the plant/);
    assert.equal(seen.ideas[0].card.customerChecks[0].engagements[0].kind, "engagement");
  });

  it("wipLimit is 1 on customer_check until paid use", () => {
    const second = { ...PRODUCT_CHECK, id: "alpha-check-2", clock: "2026-10-10" };
    const hit = normalizeInitiatives([PRODUCT_CHECK, second]);
    assert.equal(hit.ok, false);
    assert.equal(hit.error, CUSTOMER_CHECK_WIP);
    const paid = {
      ...PRODUCT_CHECK,
      outcome: "delivered",
      impact: "revenue",
      evidence: "observed",
    };
    const ok = normalizeInitiatives([paid, second]);
    assert.equal(ok.ok, true);
    assert.equal(hasPaidUse(ok.value), true);
  });

  it("NDA cannot be written as delivered Try", () => {
    const hit = normalizeInitiatives([
      PRODUCT_CHECK,
      { ...NESTED_NDA, outcome: "delivered" },
    ]);
    assert.equal(hit.ok, false);
    assert.match(String(hit.error), /NDA is not Try/);
  });
});

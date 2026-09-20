/**
 * PR2 — micdots initiatives[] mapping (Cos live-board SoR).
 * Fixture/test only. Does not write a live board. Mapping cannot Advance.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fixtureJourneyStore } from "../dist/journey.js";
import {
  CONCATENATED_LEAD_REJECTED,
  CUSTOMER_CHECK_WIP,
  cardFromScoreboard,
  formatInitiativeCard,
  isConcatenatedClockOperatingLead,
  normalizeInitiatives,
} from "../dist/initiative-card.js";
import { initiativeMappingMayAdvance } from "../dist/house-rules.js";
import { formatSpokenJourney } from "../dist/clock-map.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(HERE, "fixtures", "micdots-initiatives.json"), "utf8"),
);

const ROWS = FIXTURE.scoreboard.initiatives;
const CHECK = ROWS.find((row) => row.id === "mic-check-ccg");
const ENG = ROWS.find((row) => row.id === "mic-eng-ccg");
const GRANITE = ROWS.find((row) => row.id === "mic-eng-granite");
const ADVISOR = ROWS.find((row) => row.id === "mic-advisor-fast");
const ANGELS = ROWS.find((row) => row.id === "mic-capital-angels");
const WARRANT = ROWS.find((row) => row.id === "mic-capital-fi-warrant");
const LEGAL = ROWS.find((row) => row.id === "mic-legal-sopa");

const CONCAT_LEAD = {
  ...CHECK,
  id: "mic-concat-lead",
  premise: "close the SAFE + CCG paid retainer",
  measure: "pay or use and file the SAFE",
  killLine: "kill if they do not pay and the SAFE slips",
};

function bearer(email) {
  return { authenticated: true, email, principal: email, identityStore: "memory" };
}

function cardOf(rows = ROWS) {
  return cardFromScoreboard({
    slug: FIXTURE.companySlug,
    label: "MicDots",
    journeyPhase: FIXTURE.journeyPhase,
    gate: FIXTURE.currentGate,
    scoreboard: { ...FIXTURE.scoreboard, initiatives: rows },
  });
}

describe("PR2 micdots initiatives mapping", () => {
  it("stored clocks stay Write the bet / iterate — mapping cannot Advance", () => {
    assert.equal(FIXTURE.journeyPhase, 1);
    assert.equal(FIXTURE.loopStage, 1);
    assert.equal(FIXTURE.currentGate, "iterate");
    assert.equal(formatSpokenJourney(FIXTURE.journeyPhase), "Write the bet (1)");
    assert.equal(initiativeMappingMayAdvance(), false);
    for (const row of ROWS) {
      assert.equal("journeyPhase" in row, false);
    }
  });

  it("card lead is customer_check titled CCG operating bet", () => {
    const hit = normalizeInitiatives(ROWS);
    assert.equal(hit.ok, true, hit.ok ? "" : hit.error);
    assert.equal(CHECK.kind, "customer_check");
    assert.equal(CHECK.status, "active");
    assert.equal(CHECK.evidence, "stated");
    assert.equal("clock" in CHECK, false);
    assert.match(CHECK.premise, /CCG/);
    assert.doesNotMatch(CHECK.premise, /SAFE|FAST|SOPA|83\s*\(?\s*b|Granite/i);
    assert.equal(isConcatenatedClockOperatingLead(`${CHECK.premise} ${CHECK.measure} ${CHECK.killLine}`), false);

    const card = cardOf();
    assert.equal(card.company.stage, "Write the bet (1)");
    assert.equal(card.company.gate, "iterate");
    assert.equal(card.company.wipLimit, 1);
    assert.equal(card.bottleneck?.kind, "customer_check");
    assert.equal(card.bottleneck?.id, "mic-check-ccg");
    assert.equal(card.company.bottleneckId, "mic-check-ccg");
    assert.equal(card.customerChecks.length, 1);
    assert.equal(card.customerChecks[0].id, "mic-check-ccg");
    assert.match(card.bottleneck.premise, /CCG/);
    assert.notEqual(card.bottleneck?.kind, "legal");
    assert.notEqual(card.bottleneck?.kind, "capital");
    assert.notEqual(card.bottleneck?.kind, "advisor");
  });

  it("nests CCG/CCJ trial under the check; Granite is orphan footer not a second check", () => {
    assert.equal(ENG.kind, "engagement");
    assert.equal(ENG.parentId, CHECK.id);
    assert.equal(GRANITE.kind, "engagement");
    assert.equal("parentId" in GRANITE, false);
    assert.notEqual(GRANITE.kind, "customer_check");
    const card = cardOf();
    assert.equal(card.customerChecks.length, 1);
    assert.equal(card.customerChecks[0].engagements[0].id, "mic-eng-ccg");
    assert.equal(
      card.customerChecks[0].engagements.some((row) => row.id === "mic-eng-granite"),
      false,
    );
    const footerIds = card.footer.map((row) => row.id);
    assert.equal(footerIds.includes("mic-eng-granite"), true);
    const body = formatInitiativeCard(card).join("\n");
    assert.match(body, /WIP 1 on customer_check until paid use/);
    assert.doesNotMatch(body, /Ask \/ Do \/ Write back is a card/);

    const secondCheck = { ...GRANITE, id: "mic-check-granite", kind: "customer_check", status: "active" };
    const wip = normalizeInitiatives([CHECK, ENG, secondCheck]);
    assert.equal(wip.ok, false);
    assert.equal(wip.error, CUSTOMER_CHECK_WIP);
  });

  it("paper clocks sit in the footer; closed warrant is footer; legal does not title", () => {
    assert.equal(ADVISOR.kind, "advisor");
    assert.equal(ADVISOR.impact, "clock");
    assert.equal(ADVISOR.status, "proposed");
    assert.equal(ADVISOR.clock, "2026-09-17");
    assert.equal(ANGELS.kind, "capital");
    assert.equal(ANGELS.status, "proposed");
    assert.equal(ANGELS.impact, "none");
    assert.equal(WARRANT.kind, "capital");
    assert.equal(WARRANT.status, "closed");
    assert.equal(WARRANT.outcome, "delivered");
    assert.equal(LEGAL.kind, "legal");
    assert.equal(LEGAL.status, "waiting");
    const card = cardOf();
    const footerIds = card.footer.map((row) => row.id);
    assert.deepEqual(
      footerIds.filter((id) =>
        [
          "mic-eng-granite",
          "mic-advisor-fast",
          "mic-capital-angels",
          "mic-capital-fi-warrant",
          "mic-legal-sopa",
        ].includes(id),
      ).sort(),
      [
        "mic-advisor-fast",
        "mic-capital-angels",
        "mic-capital-fi-warrant",
        "mic-eng-granite",
        "mic-legal-sopa",
      ],
    );
    assert.match(card.warn || "", /impact=clock/);
    assert.notEqual(card.bottleneck?.kind, "legal");
    assert.notEqual(card.bottleneck?.id, "mic-legal-sopa");
  });

  it("concatenated Clock/Operating lead fails", () => {
    assert.equal(isConcatenatedClockOperatingLead(CONCAT_LEAD.premise), true);
    const hit = normalizeInitiatives([CONCAT_LEAD]);
    assert.equal(hit.ok, false);
    assert.equal(hit.error, CONCATENATED_LEAD_REJECTED);
  });

  it("openQuestions stay on the scoreboard; kinds are v1 only", () => {
    assert.deepEqual(FIXTURE.scoreboard.openQuestions, [
      "Did Donna check retainer with Sam?",
      "CCG paid SOW in draft?",
      "Any angel SAFE in inbox?",
    ]);
    const kinds = new Set(ROWS.map((row) => row.kind));
    for (const kind of kinds) {
      assert.equal(
        ["customer_check", "engagement", "capital", "legal", "advisor"].includes(kind),
        true,
        kind,
      );
    }
  });

  it("recon put_journey writes initiatives[] and does not Advance", async () => {
    const store = fixtureJourneyStore();
    const founder = bearer("founder-mic@example.test");
    const before = await store.getJourney(founder, { companySlug: "micdots" });
    assert.equal(before.ok, true);
    assert.equal(before.ideas[0].clocks.journeyPhase, 1);
    assert.equal(before.ideas[0].clocks.currentGate, "iterate");
    assert.equal(before.ideas[0].clocks.journeySpoken, "Write the bet");

    const wrote = await store.putJourney(founder, {
      companySlug: "micdots",
      initiatives: ROWS,
      scoreboard: {
        schema_version: 1,
        hypothesis: FIXTURE.scoreboard.hypothesis,
        openQuestions: FIXTURE.scoreboard.openQuestions,
        constraint_this_week: FIXTURE.scoreboard.constraint_this_week,
      },
      why: "recon map Cos live-board pack to initiatives",
      founderYes: false,
    });
    assert.equal(wrote.ok, true, wrote.error || JSON.stringify(wrote).slice(0, 240));
    assert.equal(wrote.idea.clocks.journeyPhase, 1);
    assert.equal(wrote.idea.clocks.loopStage, 1);
    assert.equal(wrote.idea.clocks.currentGate, "iterate");
    assert.equal(wrote.idea.clocks.journeySpoken, "Write the bet");
    assert.equal(wrote.card.bottleneck.kind, "customer_check");
    assert.equal(wrote.card.bottleneck.id, "mic-check-ccg");
    assert.equal(wrote.idea.scoreboard.initiatives[0].kind, "customer_check");
    assert.deepEqual(wrote.idea.scoreboard.openQuestions, FIXTURE.scoreboard.openQuestions);

    const seen = await store.getJourney(founder, { companySlug: "micdots" });
    assert.equal(seen.ok, true);
    assert.equal(seen.card.bottleneck.kind, "customer_check");
    assert.equal(seen.ideas[0].clocks.journeyPhase, 1);
    assert.equal(seen.ideas[0].clocks.currentGate, "iterate");
    assert.match(seen.ideas[0].snapshot, /WHERE ARE WE — MicDots/);
    assert.match(seen.ideas[0].snapshot, /CCG/);
    assert.match(seen.ideas[0].snapshot, /OTHER INITIATIVES/);
    assert.match(seen.ideas[0].snapshot, /Granite/);
  });
});

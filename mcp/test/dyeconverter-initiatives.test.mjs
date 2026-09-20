/**
 * PR1 — dyeconverter initiatives[] mapping (Cos live-board SoR).
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
  cardFromScoreboard,
  formatInitiativeCard,
  isConcatenatedClockOperatingLead,
  normalizeInitiatives,
} from "../dist/initiative-card.js";
import { initiativeMappingMayAdvance } from "../dist/house-rules.js";
import { formatSpokenJourney } from "../dist/clock-map.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(HERE, "fixtures", "dyeconverter-initiatives.json"), "utf8"),
);

const ROWS = FIXTURE.scoreboard.initiatives;
const CHECK = ROWS.find((row) => row.id === "dye-check-oterra");
const ENG = ROWS.find((row) => row.id === "dye-eng-oterra");
const CAPITAL = ROWS.find((row) => row.id === "dye-capital-safe");
const ADVISOR = ROWS.find((row) => row.id === "dye-advisor-fast");
const LEGAL = ROWS.find((row) => row.id === "dye-legal-seed");
const CLOSED = ROWS.find((row) => row.id === "dye-eng-supply-change");

const CONCAT_LEAD = {
  ...CHECK,
  id: "dye-concat-lead",
  premise: "close the SAFE + Oterra plant pay for conversion",
  measure: "pay or use and file the SAFE",
  killLine: "kill if they do not pay and the SAFE slips",
};

function bearer(email) {
  return { authenticated: true, email, principal: email, identityStore: "memory" };
}

function cardOf(rows = ROWS) {
  return cardFromScoreboard({
    slug: FIXTURE.companySlug,
    label: "DyeConverter",
    journeyPhase: FIXTURE.journeyPhase,
    gate: FIXTURE.currentGate,
    scoreboard: { ...FIXTURE.scoreboard, initiatives: rows },
  });
}

describe("PR1 dyeconverter initiatives mapping", () => {
  it("stored clocks stay Write the bet / hold — mapping cannot Advance", () => {
    assert.equal(FIXTURE.journeyPhase, 1);
    assert.equal(FIXTURE.loopStage, 1);
    assert.equal(FIXTURE.currentGate, "hold");
    assert.equal(formatSpokenJourney(FIXTURE.journeyPhase), "Write the bet (1)");
    assert.equal(initiativeMappingMayAdvance(), false);
    for (const row of ROWS) {
      assert.equal("journeyPhase" in row, false);
    }
  });

  it("card lead is customer_check titled Oterra operating bet", () => {
    const hit = normalizeInitiatives(ROWS);
    assert.equal(hit.ok, true, hit.ok ? "" : hit.error);
    assert.equal(CHECK.kind, "customer_check");
    assert.equal(CHECK.status, "active");
    assert.equal(CHECK.evidence, "stated");
    assert.equal("clock" in CHECK, false);
    assert.match(CHECK.premise, /Oterra plant tenancy/);
    assert.doesNotMatch(CHECK.premise, /SAFE|FAST|83\s*\(?\s*b|SeedLegal/i);
    assert.equal(isConcatenatedClockOperatingLead(`${CHECK.premise} ${CHECK.measure} ${CHECK.killLine}`), false);

    const card = cardOf();
    assert.equal(card.company.stage, "Write the bet (1)");
    assert.equal(card.company.gate, "hold");
    assert.equal(card.company.wipLimit, 1);
    assert.equal(card.bottleneck?.kind, "customer_check");
    assert.equal(card.bottleneck?.id, "dye-check-oterra");
    assert.equal(card.company.bottleneckId, "dye-check-oterra");
    assert.equal(card.customerChecks.length, 1);
    assert.equal(card.customerChecks[0].id, "dye-check-oterra");
    assert.match(card.bottleneck.premise, /Oterra/);
  });

  it("nests Oterra NDA+quote under the check; NDA is not Try", () => {
    assert.equal(ENG.kind, "engagement");
    assert.equal(ENG.parentId, CHECK.id);
    assert.equal(ENG.outcome, "none");
    assert.equal(ENG.impact, "obligation");
    const card = cardOf();
    assert.equal(card.customerChecks[0].engagements[0].id, "dye-eng-oterra");
    const body = formatInitiativeCard(card).join("\n");
    assert.match(body, /NDA is not Try/);
    assert.doesNotMatch(body, /Ask \/ Do \/ Write back is a card/);
  });

  it("paper clocks sit in the footer with impact=clock; closed call is footer", () => {
    assert.equal(CAPITAL.kind, "capital");
    assert.equal(CAPITAL.impact, "clock");
    assert.equal(CAPITAL.clock, "2026-09-20");
    assert.equal(ADVISOR.kind, "advisor");
    assert.equal(ADVISOR.impact, "clock");
    assert.equal(ADVISOR.clock, "2026-08-31");
    assert.equal(LEGAL.kind, "legal");
    assert.equal(LEGAL.impact, "clock");
    assert.equal(CLOSED.status, "closed");
    const card = cardOf();
    const footerIds = card.footer.map((row) => row.id);
    assert.deepEqual(
      footerIds.filter((id) =>
        ["dye-capital-safe", "dye-advisor-fast", "dye-legal-seed", "dye-eng-supply-change"].includes(id),
      ).sort(),
      ["dye-advisor-fast", "dye-capital-safe", "dye-eng-supply-change", "dye-legal-seed"],
    );
    assert.match(card.warn || "", /impact=clock/);
    assert.notEqual(card.bottleneck?.kind, "capital");
    assert.notEqual(card.bottleneck?.kind, "legal");
    assert.notEqual(card.bottleneck?.kind, "advisor");
  });

  it("concatenated Clock/Operating lead fails", () => {
    assert.equal(isConcatenatedClockOperatingLead(CONCAT_LEAD.premise), true);
    const hit = normalizeInitiatives([CONCAT_LEAD]);
    assert.equal(hit.ok, false);
    assert.equal(hit.error, CONCATENATED_LEAD_REJECTED);
  });

  it("openQuestions stay on the scoreboard; kinds are v1 only", () => {
    assert.deepEqual(FIXTURE.scoreboard.openQuestions, [
      "SAFE text after 20 Sep call?",
      "Oterra past NDA?",
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
    const founder = bearer("founder-dye@example.test");
    const before = await store.getJourney(founder, { companySlug: "dyeconverter" });
    assert.equal(before.ok, true);
    assert.equal(before.ideas[0].clocks.journeyPhase, 1);
    assert.equal(before.ideas[0].clocks.currentGate, "hold");
    assert.equal(before.ideas[0].clocks.journeySpoken, "Write the bet");

    const wrote = await store.putJourney(founder, {
      companySlug: "dyeconverter",
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
    assert.equal(wrote.idea.clocks.currentGate, "hold");
    assert.equal(wrote.idea.clocks.journeySpoken, "Write the bet");
    assert.equal(wrote.card.bottleneck.kind, "customer_check");
    assert.equal(wrote.card.bottleneck.id, "dye-check-oterra");
    assert.equal(wrote.idea.scoreboard.initiatives[0].kind, "customer_check");
    assert.deepEqual(wrote.idea.scoreboard.openQuestions, FIXTURE.scoreboard.openQuestions);

    const seen = await store.getJourney(founder, { companySlug: "dyeconverter" });
    assert.equal(seen.ok, true);
    assert.equal(seen.card.bottleneck.kind, "customer_check");
    assert.equal(seen.ideas[0].clocks.journeyPhase, 1);
    assert.equal(seen.ideas[0].clocks.currentGate, "hold");
    assert.match(seen.ideas[0].snapshot, /WHERE ARE WE — DyeConverter/);
    assert.match(seen.ideas[0].snapshot, /Oterra plant tenancy/);
    assert.match(seen.ideas[0].snapshot, /OTHER INITIATIVES/);
  });
});

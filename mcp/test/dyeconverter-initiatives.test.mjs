/**
 * PR1.1 — dyeconverter Heavy-locked initiatives[] map.
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
const CHECK = ROWS.find((row) => row.id === "dye-check-plant");
const ENG_OTERRA = ROWS.find((row) => row.id === "dye-eng-oterra");
const ENG_TURING = ROWS.find((row) => row.id === "dye-eng-turing");
const ENG_OCEAN = ROWS.find((row) => row.id === "dye-eng-ocean-spray");
const CAPITAL = ROWS.find((row) => row.id === "dye-capital-safe");
const ADVISOR = ROWS.find((row) => row.id === "dye-advisor-fast");
const LEGAL = ROWS.find((row) => row.id === "dye-legal-seed");
const CLOSED = ROWS.find((row) => row.id === "dye-capital-supply-change");

const PLANT_PREMISE = "plants already buying pigment pay for conversion/tenancy on one SKU";
const PLANT_MEASURE = "paid plant use or paid tenancy on one SKU";
const PLANT_KILL = "kill beachhead if they will not run a paid plant trial or paid tenancy on one SKU";
const CONSTRAINT = "Oterra SKU+site+date only";

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

describe("PR1.1 dyeconverter Heavy-locked initiatives map", () => {
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

  it("dye-check-plant is the plant beachhead; constraint is Oterra SKU+site+date only", () => {
    const hit = normalizeInitiatives(ROWS);
    assert.equal(hit.ok, true, hit.ok ? "" : hit.error);
    assert.ok(CHECK);
    assert.equal(CHECK.kind, "customer_check");
    assert.equal(CHECK.status, "active");
    assert.equal(CHECK.outcome, "none");
    assert.equal(CHECK.impact, "none");
    assert.equal(CHECK.evidence, "stated");
    assert.equal("clock" in CHECK, false);
    assert.equal(CHECK.premise, PLANT_PREMISE);
    assert.equal(CHECK.measure, PLANT_MEASURE);
    assert.equal(CHECK.killLine, PLANT_KILL);
    assert.equal(CHECK.last, "NDA ~10-11 Sep + quote/Day 45");
    assert.equal(CHECK.next, "SKU+site+date");
    assert.equal(FIXTURE.scoreboard.constraint_this_week, CONSTRAINT);
    assert.notEqual(CHECK.premise, CONSTRAINT);
    assert.doesNotMatch(CHECK.premise, /Oterra SKU\+site\+date only/);
    assert.doesNotMatch(CHECK.premise, /SAFE|FAST|83\s*\(?\s*b|SeedLegal/i);
    assert.doesNotMatch(FIXTURE.scoreboard.constraint_this_week, /SAFE|FAST/i);
    assert.equal(
      isConcatenatedClockOperatingLead(`${CHECK.premise} ${CHECK.measure} ${CHECK.killLine}`),
      false,
    );

    const card = cardOf();
    assert.equal(card.company.stage, "Write the bet (1)");
    assert.equal(card.company.gate, "hold");
    assert.equal(card.company.wipLimit, 1);
    assert.equal(card.bottleneck?.kind, "customer_check");
    assert.equal(card.bottleneck?.id, "dye-check-plant");
    assert.equal(card.company.bottleneckId, "dye-check-plant");
    assert.equal(card.customerChecks.length, 1);
    assert.equal(card.customerChecks[0].id, "dye-check-plant");
    assert.equal(card.bottleneck.premise, PLANT_PREMISE);
    assert.doesNotMatch(card.bottleneck.premise, /SAFE|FAST/i);
    assert.doesNotMatch(card.bottleneck.premise, /Oterra SKU\+site\+date only/);
  });

  it("nests three engagements under dye-check-plant: Oterra, Turing Labs, Ocean Spray", () => {
    assert.ok(ENG_OTERRA && ENG_TURING && ENG_OCEAN);
    assert.equal(ENG_OTERRA.kind, "engagement");
    assert.equal(ENG_OTERRA.status, "active");
    assert.equal(ENG_OTERRA.impact, "clock");
    assert.equal(ENG_OTERRA.clock, "2026-09-21");
    assert.equal(ENG_OTERRA.last, "NDA ~10-11 Sep + quote/Day 45");
    assert.equal(ENG_OTERRA.next, "SKU+site+date");
    assert.equal(ENG_OTERRA.outcome, "none");
    assert.equal(ENG_OTERRA.evidence, "stated");
    assert.equal(ENG_OTERRA.parentId, "dye-check-plant");
    assert.match(ENG_OTERRA.killLine, /NDA is not Try/);

    assert.equal(ENG_TURING.kind, "engagement");
    assert.equal(ENG_TURING.status, "active");
    assert.equal(ENG_TURING.impact, "learning");
    assert.equal(ENG_TURING.last, "NDA + 18 SKUs asked");
    assert.equal(ENG_TURING.next, "she pursues proposal");
    assert.equal(ENG_TURING.evidence, "stated");
    assert.equal(ENG_TURING.parentId, "dye-check-plant");

    assert.equal(ENG_OCEAN.kind, "engagement");
    assert.equal(ENG_OCEAN.status, "waiting");
    assert.equal(ENG_OCEAN.next, "call #2 22 Sep");
    assert.equal(ENG_OCEAN.evidence, "stated");
    assert.equal(ENG_OCEAN.parentId, "dye-check-plant");

    const card = cardOf();
    const nested = card.customerChecks[0].engagements.map((row) => row.id);
    assert.deepEqual(nested, ["dye-eng-oterra", "dye-eng-turing", "dye-eng-ocean-spray"]);
    const body = formatInitiativeCard(card).join("\n");
    assert.match(body, /NDA is not Try/);
    assert.doesNotMatch(body, /Ask \/ Do \/ Write back is a card/);
  });

  it("footer paper: SAFE waiting no close stamp; FAST proposed SOPA; SeedLegal obligation; Supply Change capital learned", () => {
    assert.ok(CLOSED && CAPITAL && ADVISOR && LEGAL);
    assert.equal(CLOSED.kind, "capital");
    assert.equal(CLOSED.status, "closed");
    assert.equal(CLOSED.outcome, "learned");
    assert.equal(CLOSED.impact, "none");
    assert.match(CLOSED.premise, /Supply Change \/ Rachel/);
    assert.equal(CLOSED.id, "dye-capital-supply-change");
    assert.equal(
      ROWS.some((row) => row.id === "dye-eng-supply-change" || (row.kind === "engagement" && /Supply Change/i.test(row.premise))),
      false,
    );

    assert.equal(CAPITAL.kind, "capital");
    assert.equal(CAPITAL.status, "waiting");
    assert.equal(CAPITAL.impact, "clock");
    assert.equal(CAPITAL.last, "she told Mo no $1M/2.5%");
    assert.equal(CAPITAL.next, "FI/Mo resolve");
    assert.equal("clock" in CAPITAL, false);
    assert.notEqual(CAPITAL.clock, "2026-09-20");
    assert.doesNotMatch(`${CAPITAL.clock || ""}`, /2026-09-20/);

    assert.equal(ADVISOR.kind, "advisor");
    assert.equal(ADVISOR.status, "proposed");
    assert.equal(ADVISOR.impact, "obligation");
    assert.equal(ADVISOR.clock, "2026-11-29");
    assert.equal(ADVISOR.last, "PDF 31 Aug plan not adopted");
    assert.equal(ADVISOR.next, "SOPA after founder paper clean and before SAFE close");

    assert.equal(LEGAL.kind, "legal");
    assert.equal(LEGAL.status, "waiting");
    assert.equal(LEGAL.impact, "obligation");
    assert.equal(LEGAL.last, "defective + 83(b) on bad paper");
    assert.equal(LEGAL.next, "partner cleanup");
    assert.equal("clock" in LEGAL, false);

    const card = cardOf();
    const footerIds = card.footer.map((row) => row.id);
    assert.deepEqual(
      footerIds.filter((id) =>
        ["dye-capital-safe", "dye-advisor-fast", "dye-legal-seed", "dye-capital-supply-change"].includes(id),
      ).sort(),
      ["dye-advisor-fast", "dye-capital-safe", "dye-capital-supply-change", "dye-legal-seed"],
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

  it("kinds are v1 only", () => {
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
      why: "recon map Heavy-locked dyeconverter initiatives",
      founderYes: false,
    });
    assert.equal(wrote.ok, true, wrote.error || JSON.stringify(wrote).slice(0, 240));
    assert.equal(wrote.idea.clocks.journeyPhase, 1);
    assert.equal(wrote.idea.clocks.loopStage, 1);
    assert.equal(wrote.idea.clocks.currentGate, "hold");
    assert.equal(wrote.idea.clocks.journeySpoken, "Write the bet");
    assert.equal(wrote.card.bottleneck.kind, "customer_check");
    assert.equal(wrote.card.bottleneck.id, "dye-check-plant");
    assert.equal(wrote.card.bottleneck.premise, PLANT_PREMISE);
    assert.equal(wrote.idea.scoreboard.initiatives[0].id, "dye-check-plant");
    assert.equal(wrote.idea.scoreboard.constraint_this_week, CONSTRAINT);
    assert.deepEqual(wrote.idea.scoreboard.openQuestions, FIXTURE.scoreboard.openQuestions);

    const seen = await store.getJourney(founder, { companySlug: "dyeconverter" });
    assert.equal(seen.ok, true);
    assert.equal(seen.card.bottleneck.kind, "customer_check");
    assert.equal(seen.card.bottleneck.id, "dye-check-plant");
    assert.equal(seen.ideas[0].clocks.journeyPhase, 1);
    assert.equal(seen.ideas[0].clocks.currentGate, "hold");
    assert.match(seen.ideas[0].snapshot, /WHERE ARE WE — DyeConverter/);
    assert.match(seen.ideas[0].snapshot, /Oterra SKU\+site\+date only/);
    assert.match(seen.ideas[0].snapshot, /plants already buying pigment pay for conversion\/tenancy on one SKU/);
    assert.match(seen.ideas[0].snapshot, /OTHER INITIATIVES/);
    const cardLead = seen.ideas[0].snapshot.split("WHERE ARE WE — DyeConverter")[1].split("OTHER INITIATIVES")[0];
    assert.match(cardLead, /#1 BOTTLENECK  dye-check-plant · plants already buying pigment pay for conversion\/tenancy on one SKU/);
    assert.doesNotMatch(cardLead, /SAFE|FAST/);
  });
});

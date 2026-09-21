/**
 * PR2.1 — micdots Heavy-locked initiatives[] map.
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
const FIXTURE_PATH = path.join(HERE, "fixtures", "micdots-initiatives.json");
const FIXTURE_TEXT = fs.readFileSync(FIXTURE_PATH, "utf8");
const FIXTURE = JSON.parse(FIXTURE_TEXT);

const ROWS = FIXTURE.scoreboard.initiatives;
const CHECK = ROWS.find((row) => row.id === "mic-check-paid-site");
const ENG = ROWS.find((row) => row.id === "mic-eng-ccg");
const GRANITE = ROWS.find((row) => row.id === "mic-eng-granite");
const ADVISOR = ROWS.find((row) => row.id === "mic-advisor-fast");
const ANGELS = ROWS.find((row) => row.id === "mic-capital-angels");
const WARRANT = ROWS.find((row) => row.id === "mic-capital-fi-warrant");
const LEGAL = ROWS.find((row) => row.id === "mic-legal-sopa");

const PAID_SITE_PREMISE = "paid construction work puts the first check in the company";
const PAID_SITE_MEASURE = "signed paid SOW or retainer";
const PAID_SITE_KILL = "kill beachhead if the on-site trial does not convert to paid work";
const CONSTRAINT = "CCG trial to paid retainer after Sam budget check";
const OPEN_QUESTIONS = [
  "Did Donna talk to Sam?",
  "CCG SOW in draft?",
  "Angel SAFE in inbox?",
];

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

describe("PR2.1 micdots Heavy-locked initiatives map", () => {
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

  it("renames leftover mic-check-ccg; kinds are v1; 7 Cos rows only", () => {
    assert.equal(FIXTURE_TEXT.includes("mic-check-ccg"), false);
    assert.equal(
      ROWS.some((row) => row.id === "mic-check-ccg"),
      false,
    );
    assert.deepEqual(
      ROWS.map((row) => row.id),
      [
        "mic-check-paid-site",
        "mic-eng-ccg",
        "mic-eng-granite",
        "mic-advisor-fast",
        "mic-capital-angels",
        "mic-capital-fi-warrant",
        "mic-legal-sopa",
      ],
    );
    assert.equal(
      ROWS.some((row) => /cto bot|wed 23|wednesday 23/i.test(`${row.id} ${row.premise} ${row.last} ${row.next}`)),
      false,
    );
    const kinds = new Set(ROWS.map((row) => row.kind));
    for (const kind of kinds) {
      assert.equal(
        ["customer_check", "engagement", "capital", "legal", "advisor"].includes(kind),
        true,
        kind,
      );
    }
  });

  it("mic-check-paid-site is the beachhead; constraint is CCG trial to paid retainer after Sam budget check", () => {
    const hit = normalizeInitiatives(ROWS);
    assert.equal(hit.ok, true, hit.ok ? "" : hit.error);
    assert.ok(CHECK);
    assert.equal(CHECK.kind, "customer_check");
    assert.equal(CHECK.status, "active");
    assert.equal(CHECK.outcome, "none");
    assert.equal(CHECK.impact, "none");
    assert.equal(CHECK.evidence, "stated");
    assert.equal("clock" in CHECK, false);
    assert.equal(CHECK.premise, PAID_SITE_PREMISE);
    assert.equal(CHECK.measure, PAID_SITE_MEASURE);
    assert.equal(CHECK.killLine, PAID_SITE_KILL);
    assert.equal(CHECK.last, "CCG/CCJ trial on site and expanding");
    assert.equal(CHECK.next, "paid retainer after Sam budget check");
    assert.equal(FIXTURE.scoreboard.constraint_this_week, CONSTRAINT);
    assert.notEqual(CHECK.premise, CONSTRAINT);
    assert.doesNotMatch(CHECK.premise, /FAST|angels|SOPA|legal/i);
    assert.doesNotMatch(FIXTURE.scoreboard.constraint_this_week, /FAST|angels|SOPA|legal/i);
    assert.equal(
      isConcatenatedClockOperatingLead(`${CHECK.premise} ${CHECK.measure} ${CHECK.killLine}`),
      false,
    );

    const card = cardOf();
    assert.equal(card.company.stage, "Write the bet (1)");
    assert.equal(card.company.gate, "iterate");
    assert.equal(card.company.wipLimit, 1);
    assert.equal(card.bottleneck?.kind, "customer_check");
    assert.equal(card.bottleneck?.id, "mic-check-paid-site");
    assert.equal(card.company.bottleneckId, "mic-check-paid-site");
    assert.equal(card.customerChecks.length, 1);
    assert.equal(card.customerChecks[0].id, "mic-check-paid-site");
    assert.equal(card.bottleneck.premise, PAID_SITE_PREMISE);
    assert.doesNotMatch(card.bottleneck.premise, /FAST|angels|SOPA|legal/i);
    assert.notEqual(card.bottleneck?.kind, "legal");
    assert.notEqual(card.bottleneck?.kind, "capital");
    assert.notEqual(card.bottleneck?.kind, "advisor");
  });

  it("nests CCG and Granite under mic-check-paid-site; Granite is not orphan and has no clock", () => {
    assert.ok(ENG && GRANITE);
    assert.equal(ENG.kind, "engagement");
    assert.equal(ENG.parentId, "mic-check-paid-site");
    assert.equal(ENG.premise, "CCG/CCJ on-site trial");
    assert.equal(ENG.measure, "paid SOW or retainer");
    assert.equal(ENG.killLine, "trial is not paid use");
    assert.equal(ENG.status, "active");
    assert.equal(ENG.last, "trial expanding (16 Sep office hours)");
    assert.equal(ENG.next, "Donna checks range with Sam, then paid SOW");
    assert.equal(ENG.outcome, "none");
    assert.equal(ENG.impact, "obligation");
    assert.equal(ENG.evidence, "stated");

    assert.equal(GRANITE.kind, "engagement");
    assert.equal(GRANITE.parentId, "mic-check-paid-site");
    assert.equal(GRANITE.premise, "Granite Design intro");
    assert.equal(GRANITE.measure, "paid Design gate $30-45k");
    assert.equal(GRANITE.killLine, "intro is not Try");
    assert.equal(GRANITE.status, "waiting");
    assert.equal(GRANITE.last, "one-pager cleared 18 Sep");
    assert.equal(GRANITE.next, "paid Design intro at $30-45k");
    assert.equal(GRANITE.outcome, "none");
    assert.equal(GRANITE.impact, "learning");
    assert.equal(GRANITE.evidence, "stated");
    assert.equal("clock" in GRANITE, false);
    assert.notEqual(GRANITE.kind, "customer_check");

    const card = cardOf();
    assert.equal(card.customerChecks.length, 1);
    const nested = card.customerChecks[0].engagements.map((row) => row.id);
    assert.deepEqual(nested, ["mic-eng-ccg", "mic-eng-granite"]);
    const footerIds = card.footer.map((row) => row.id);
    assert.equal(footerIds.includes("mic-eng-granite"), false);
    const body = formatInitiativeCard(card).join("\n");
    assert.match(body, /WIP 1 on customer_check until paid use/);
    assert.match(body, /Granite Design intro/);
    assert.equal(GRANITE.killLine, "intro is not Try");
    assert.doesNotMatch(body, /Ask \/ Do \/ Write back is a card/);

    const secondCheck = { ...GRANITE, id: "mic-check-granite", kind: "customer_check", status: "active" };
    const wip = normalizeInitiatives([CHECK, ENG, secondCheck]);
    assert.equal(wip.ok, false);
    assert.equal(wip.error, CUSTOMER_CHECK_WIP);
  });

  it("footer paper: FAST proposed no clock; angels keep warm; FI warrant learned; SOPA parked", () => {
    assert.ok(ADVISOR && ANGELS && WARRANT && LEGAL);
    assert.equal(ADVISOR.kind, "advisor");
    assert.equal(ADVISOR.status, "proposed");
    assert.equal(ADVISOR.impact, "obligation");
    assert.equal(ADVISOR.premise, "FAST Expert 1% countersigned 17 Sep; grant not on sheet");
    assert.equal(ADVISOR.measure, "SOPA only when a SAFE is in draft");
    assert.equal(ADVISOR.killLine, "advisor ride-along cannot promote");
    assert.equal(ADVISOR.last, "PDF 17 Sep");
    assert.equal(ADVISOR.next, "SOPA only when a SAFE is in draft");
    assert.equal("clock" in ADVISOR, false);

    assert.equal(ANGELS.kind, "capital");
    assert.equal(ANGELS.status, "proposed");
    assert.equal(ANGELS.impact, "none");
    assert.equal(ANGELS.premise, "Angels verbal only");
    assert.equal(ANGELS.measure, "keep warm");
    assert.equal(ANGELS.killLine, "verbal interest cannot promote");
    assert.equal(ANGELS.last, "Data room 16 Sep no roster rush");
    assert.equal(ANGELS.next, "keep warm");

    assert.equal(WARRANT.kind, "capital");
    assert.equal(WARRANT.status, "closed");
    assert.equal(WARRANT.outcome, "learned");
    assert.equal(WARRANT.impact, "none");
    assert.equal(WARRANT.premise, "FI warrant 2.5% signed 5 Sep");
    assert.equal(WARRANT.last, "signed 5 Sep");
    assert.equal(WARRANT.next, "done");
    assert.equal("clock" in WARRANT, false);

    assert.equal(LEGAL.kind, "legal");
    assert.equal(LEGAL.status, "waiting");
    assert.equal(LEGAL.impact, "none");
    assert.equal(LEGAL.premise, "plan/pool/SOPA not adopted");
    assert.equal(LEGAL.measure, "parked until SAFE draft");
    assert.equal(LEGAL.killLine, "legal paper cannot promote");
    assert.equal(LEGAL.last, "not adopted; 8M common still 100% Donna");
    assert.equal(LEGAL.next, "parked until SAFE draft");

    const card = cardOf();
    const footerIds = card.footer.map((row) => row.id);
    assert.deepEqual(
      footerIds.filter((id) =>
        [
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
        "mic-legal-sopa",
      ],
    );
    assert.equal(footerIds.includes("mic-eng-granite"), false);
    assert.equal(card.warn, undefined);
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
    assert.deepEqual(FIXTURE.scoreboard.openQuestions, OPEN_QUESTIONS);
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
      why: "recon map Heavy-locked micdots initiatives",
      founderYes: false,
    });
    assert.equal(wrote.ok, true, wrote.error || JSON.stringify(wrote).slice(0, 240));
    assert.equal(wrote.idea.clocks.journeyPhase, 1);
    assert.equal(wrote.idea.clocks.loopStage, 1);
    assert.equal(wrote.idea.clocks.currentGate, "iterate");
    assert.equal(wrote.idea.clocks.journeySpoken, "Write the bet");
    assert.equal(wrote.card.bottleneck.kind, "customer_check");
    assert.equal(wrote.card.bottleneck.id, "mic-check-paid-site");
    assert.equal(wrote.card.bottleneck.premise, PAID_SITE_PREMISE);
    assert.equal(wrote.idea.scoreboard.initiatives[0].id, "mic-check-paid-site");
    assert.equal(wrote.idea.scoreboard.constraint_this_week, CONSTRAINT);
    assert.deepEqual(wrote.idea.scoreboard.openQuestions, OPEN_QUESTIONS);

    const seen = await store.getJourney(founder, { companySlug: "micdots" });
    assert.equal(seen.ok, true);
    assert.equal(seen.card.bottleneck.kind, "customer_check");
    assert.equal(seen.card.bottleneck.id, "mic-check-paid-site");
    assert.equal(seen.ideas[0].clocks.journeyPhase, 1);
    assert.equal(seen.ideas[0].clocks.currentGate, "iterate");
    assert.match(seen.ideas[0].snapshot, /WHERE ARE WE — MicDots/);
    assert.match(seen.ideas[0].snapshot, /CCG trial to paid retainer after Sam budget check/);
    assert.match(seen.ideas[0].snapshot, /paid construction work puts the first check in the company/);
    assert.match(seen.ideas[0].snapshot, /OTHER INITIATIVES/);
    assert.match(seen.ideas[0].snapshot, /Granite Design intro/);
    assert.doesNotMatch(seen.ideas[0].snapshot, /mic-check-ccg/);
    const cardLead = seen.ideas[0].snapshot.split("WHERE ARE WE — MicDots")[1].split("OTHER INITIATIVES")[0];
    assert.match(cardLead, /#1 BOTTLENECK  mic-check-paid-site · paid construction work puts the first check in the company/);
    assert.match(cardLead, /Granite Design intro/);
    assert.doesNotMatch(cardLead, /FAST|SOPA|angels|legal/i);
  });
});

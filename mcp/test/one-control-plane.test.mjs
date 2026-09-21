/**
 * OS 2.8.18 one founder control plane.
 * Fixtures: fictional alpha / bravo only. No mentee / PII. No live journeyPhase.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MemoryJourneyStore, defaultScoreboard } from "../dist/journey.js";
import {
  CONTROL_PLANE_ORDER,
  ENGAGEMENT_INVALID,
  PRIMARY_PHASE_NEEDS_PRODUCT_WHY,
  RELATIONSHIP_AS_PRIMARY_REJECTED,
  admitPrimaryPhaseWhy,
  admitPrimaryWhy,
  hasNamedGroupKillLine,
  instrumentIsPrimaryObject,
  primaryObjectIsPersonOrInstrument,
  relationshipIsPrimaryObject,
} from "../dist/control-plane.js";
import { OS_VERSION } from "../dist/constants.js";
import { engagementMayPromote, supportingMayPromote } from "../dist/house-rules.js";

const PRODUCT_WHY =
  "operators who already pay for dispatch — kill if they do not use the weekly report";
const KEYWORD_IN_PRODUCT =
  "operators who already pay a bookkeeper so they stop hiring a second employee — kill if they do not use the close checklist";
const SAFE_IN_PRODUCT =
  "founders who already pay counsel for SAFE reviews — kill if they will not use the term checklist";
const HIRE_BET = "hire a contractor to build the slice";
const SAFE_BET = "close the SAFE with the lead investor this week";
const CHANNEL_BET = "the idea is the channel partner as the bet";
const GATE_ENR = {
  whatChanged: "named the week's bottleneck",
  whatWereNotDoing: "not a landing-page side quest",
};
const ADVISOR_FAST = {
  role: "advisor",
  state: "promise",
  clock: "—",
  nextAction: "send FAST draft",
  lastObservedFact: "office hours tip recorded",
};
const PLANT_NDA = {
  account: "bravo plant",
  kind: "nda",
  state: "clock",
};

function bearer(email) {
  return { authenticated: true, email, principal: email, identityStore: "memory" };
}

function alphaStore() {
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
        scoreboard: defaultScoreboard(),
      },
    ],
    [],
    [],
  );
}

describe("OS 2.8.18 one founder control plane", () => {
  it("pins pack version and class helpers", () => {
    assert.equal(OS_VERSION, "2.8.19");
    assert.deepEqual([...CONTROL_PLANE_ORDER], ["primary", "supporting", "engagements"]);
    assert.equal(supportingMayPromote(), false);
    assert.equal(engagementMayPromote(), false);
    assert.equal(hasNamedGroupKillLine(PRODUCT_WHY), true);
    assert.equal(hasNamedGroupKillLine(KEYWORD_IN_PRODUCT), true);
    assert.equal(hasNamedGroupKillLine(SAFE_IN_PRODUCT), true);
    assert.equal(hasNamedGroupKillLine(HIRE_BET), false);
    assert.equal(relationshipIsPrimaryObject(HIRE_BET), true);
    assert.equal(instrumentIsPrimaryObject(SAFE_BET), true);
    assert.equal(primaryObjectIsPersonOrInstrument(HIRE_BET), true);
    assert.equal(primaryObjectIsPersonOrInstrument(PRODUCT_WHY), false);
    assert.equal(primaryObjectIsPersonOrInstrument(KEYWORD_IN_PRODUCT), false);
    assert.equal(admitPrimaryWhy(HIRE_BET).ok, false);
    assert.equal(admitPrimaryWhy(PRODUCT_WHY).ok, true);
    assert.equal(admitPrimaryPhaseWhy(PRODUCT_WHY, true).ok, true);
    assert.equal(admitPrimaryPhaseWhy("founder yes in chat", true).ok, false);
    assert.match(RELATIONSHIP_AS_PRIMARY_REJECTED, /supporting\[\]/);
    assert.doesNotMatch(RELATIONSHIP_AS_PRIMARY_REJECTED, /instrument tracker/);
    assert.match(PRIMARY_PHASE_NEEDS_PRODUCT_WHY, /named-group kill line/);
  });

  it("relationship-as-primary is rejected on create_idea and phase", async () => {
    const store = alphaStore();
    const founder = bearer("founder@example.test");

    const hire = await store.createIdea(founder, {
      companySlug: "alpha",
      ideaSlug: "hire-bet",
      founderYes: true,
      why: HIRE_BET,
    });
    assert.equal(hire.ok, false);
    assert.match(String(hire.error), /supporting\[\]/);
    assert.match(String(hire.error), /Exile/);

    const paper = await store.createIdea(founder, {
      companySlug: "alpha",
      ideaSlug: "safe-bet",
      founderYes: true,
      why: SAFE_BET,
    });
    assert.equal(paper.ok, false);

    const channel = await store.createIdea(founder, {
      companySlug: "alpha",
      ideaSlug: "partner-bet",
      founderYes: true,
      why: CHANNEL_BET,
    });
    assert.equal(channel.ok, false);

    const phaseHire = await store.putJourney(founder, {
      companySlug: "alpha",
      journeyPhase: 2,
      why: HIRE_BET,
      founderYes: true,
      gateEnrichment: GATE_ENR,
    });
    assert.equal(phaseHire.ok, false);
    assert.match(String(phaseHire.error), /supporting\[\]/);
  });

  it("primary phase needs founderYes + product bet-class why", async () => {
    const store = alphaStore();
    const founder = bearer("founder@example.test");

    const noYes = await store.putJourney(founder, {
      companySlug: "alpha",
      journeyPhase: 2,
      why: PRODUCT_WHY,
      founderYes: false,
      gateEnrichment: GATE_ENR,
    });
    assert.equal(noYes.ok, false);

    const noProduct = await store.putJourney(founder, {
      companySlug: "alpha",
      journeyPhase: 2,
      why: "founder yes in chat",
      founderYes: true,
      gateEnrichment: GATE_ENR,
    });
    assert.equal(noProduct.ok, false);
    assert.match(String(noProduct.error), /named-group kill line/);

    const keyword = await store.createIdea(founder, {
      companySlug: "alpha",
      ideaSlug: "books-bet",
      founderYes: true,
      why: KEYWORD_IN_PRODUCT,
    });
    assert.equal(keyword.ok, true);

    const ok = await store.putJourney(founder, {
      companySlug: "alpha",
      ideaSlug: "books-bet",
      journeyPhase: 2,
      currentGate: "advance",
      why: PRODUCT_WHY,
      founderYes: true,
      gateEnrichment: GATE_ENR,
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.idea.clocks.journeyPhase, 2);
  });

  it("supporting write is OK without a journey write", async () => {
    const store = alphaStore();
    const founder = bearer("founder@example.test");

    const wrote = await store.putJourney(founder, {
      companySlug: "alpha",
      supporting: [ADVISOR_FAST],
      why: "recon patch advisor FAST",
      founderYes: false,
    });
    assert.equal(wrote.ok, true);
    assert.equal(wrote.idea.clocks.journeyPhase, 1);
    assert.equal(wrote.idea.clocks.currentGate, "hold");
    assert.equal(wrote.supporting[0].role, "advisor");
    assert.equal(wrote.supporting[0].state, "promise");
    assert.equal(wrote.supporting[0].clock, "—");
    assert.equal(wrote.controlPlaneOrder[0], "primary");
    assert.equal(wrote.idea.scoreboard.supporting[0].role, "advisor");
  });

  it("where-are-we order is primary → supporting → engagements", async () => {
    const store = alphaStore();
    const founder = bearer("founder@example.test");
    await store.putJourney(founder, {
      companySlug: "alpha",
      supporting: [ADVISOR_FAST],
      engagements: [PLANT_NDA],
      why: "recon patch",
      founderYes: false,
    });
    const seen = await store.getJourney(founder, { companySlug: "alpha" });
    assert.equal(seen.ok, true);
    assert.deepEqual([...seen.controlPlaneOrder], ["primary", "supporting", "engagements"]);
    assert.equal(seen.primary[0].slug, "default");
    assert.equal(seen.supporting[0].role, "advisor");
    assert.equal(seen.engagements[0].kind, "nda");
    assert.equal(seen.ideas[0].engagements[0].account, "bravo plant");
    const snap = seen.ideas[0].snapshot;
    assert.match(seen.spoken, /Bottleneck/);
    assert.match(snap, /Bottleneck/);
    assert.doesNotMatch(snap, /journey phase \d/);
    assert.doesNotMatch(snap, /PRIMARY \(customer bet/);
    assert.doesNotMatch(snap, /Relationship shelf/);
    assert.doesNotMatch(snap, /instrument tracker/);
  });

  it("recon cannot Advance primary", async () => {
    const store = alphaStore();
    const founder = bearer("founder@example.test");

    const advance = await store.putJourney(founder, {
      companySlug: "alpha",
      journeyPhase: 2,
      currentGate: "advance",
      supporting: [ADVISOR_FAST],
      constraintThisWeek: "need one operator who already pays",
      scoreboard: {
        schema_version: 1,
        progress: ["called the plant"],
      },
      why: "recon patch",
      founderYes: false,
      gateEnrichment: GATE_ENR,
    });
    assert.equal(advance.ok, false);
    assert.match(String(advance.error), /founder yes required/);

    const recon = await store.putJourney(founder, {
      companySlug: "alpha",
      supporting: [ADVISOR_FAST],
      engagements: [PLANT_NDA],
      constraintThisWeek: "need one operator who already pays",
      scoreboard: {
        schema_version: 1,
        progress: ["called the plant"],
      },
      why: "recon patch supporting + constraint + progress",
      founderYes: false,
    });
    assert.equal(recon.ok, true);
    assert.equal(recon.idea.clocks.journeyPhase, 1);
    assert.equal(recon.idea.clocks.currentGate, "hold");
    assert.equal(recon.idea.constraintThisWeek, "need one operator who already pays");
    assert.deepEqual(recon.idea.scoreboard.progress, ["called the plant"]);
    assert.equal(recon.supporting[0].role, "advisor");
    assert.equal(recon.idea.engagements[0].kind, "nda");
  });

  it("supporting cannot carry journeyPhase", async () => {
    const store = alphaStore();
    const founder = bearer("founder@example.test");
    const bad = await store.putJourney(founder, {
      companySlug: "alpha",
      supporting: [{ ...ADVISOR_FAST, journeyPhase: 3 }],
      why: "recon",
      founderYes: false,
    });
    assert.equal(bad.ok, false);
    assert.match(String(bad.error), /no journeyPhase/);
    assert.match(ENGAGEMENT_INVALID, /NDA is not Try/);
  });
});

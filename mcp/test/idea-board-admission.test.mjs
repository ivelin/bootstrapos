/**
 * OS 2.8.18 idea-board admission — bet class, not keyword spam.
 * Fixtures: fictional alpha / bravo only. No mentee / PII.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MemoryJourneyStore,
  defaultScoreboard,
} from "../dist/journey.js";
import {
  IDEA_BOARD_ADMISSION_REJECTED,
  RELATIONSHIP_SHELF_LINE,
  admitIdeaBoardWhy,
  classifyBetClass,
  detectStoredBetClass,
  hasNamedGroupKillLine,
  instrumentIsPrimaryObject,
  relationshipIsPrimaryObject,
} from "../dist/idea-board-admission.js";
import { OS_VERSION } from "../dist/constants.js";
import { relationshipRowMayBeIdeaBoard } from "../dist/house-rules.js";

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

function bearer(email) {
  return { authenticated: true, email, principal: email, identityStore: "memory" };
}

function alphaStore(extraIdeas = []) {
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
      ...extraIdeas,
    ],
    [],
    [],
  );
}

describe("OS 2.8.18 idea-board admission (bet class)", () => {
  it("pins pack version and class helpers", () => {
    assert.equal(OS_VERSION, "2.8.18");
    assert.equal(relationshipRowMayBeIdeaBoard(), false);
    assert.equal(hasNamedGroupKillLine(PRODUCT_WHY), true);
    assert.equal(hasNamedGroupKillLine(KEYWORD_IN_PRODUCT), true);
    assert.equal(hasNamedGroupKillLine(SAFE_IN_PRODUCT), true);
    assert.equal(hasNamedGroupKillLine(HIRE_BET), false);
    assert.equal(classifyBetClass(PRODUCT_WHY), "product");
    assert.equal(classifyBetClass(HIRE_BET), "relationship");
    assert.equal(classifyBetClass(SAFE_BET), "instrument");
    assert.equal(classifyBetClass(CHANNEL_BET), "relationship");
    assert.equal(relationshipIsPrimaryObject(HIRE_BET), true);
    assert.equal(instrumentIsPrimaryObject(SAFE_BET), true);
    assert.equal(admitIdeaBoardWhy(PRODUCT_WHY).ok, true);
    assert.equal(admitIdeaBoardWhy(KEYWORD_IN_PRODUCT).ok, true);
    assert.equal(admitIdeaBoardWhy(SAFE_IN_PRODUCT).ok, true);
    assert.equal(admitIdeaBoardWhy(HIRE_BET).ok, false);
    assert.equal(admitIdeaBoardWhy(SAFE_BET).ok, false);
    assert.match(IDEA_BOARD_ADMISSION_REJECTED, /relationship book \/ instrument tracker/);
    assert.match(RELATIONSHIP_SHELF_LINE, /not a journey/);
    assert.equal(detectStoredBetClass(["alpha", ""]).shelf, false);
    assert.equal(detectStoredBetClass(["Lead paper", SAFE_BET]).shelf, true);
  });

  it("relationship and instrument bets reject on create_idea", async () => {
    const store = alphaStore();
    const founder = bearer("founder@example.test");

    const hire = await store.createIdea(founder, {
      companySlug: "alpha",
      ideaSlug: "hire-bet",
      founderYes: true,
      why: HIRE_BET,
    });
    assert.equal(hire.ok, false);
    assert.match(String(hire.error), /relationship book \/ instrument tracker/);

    const paper = await store.createIdea(founder, {
      companySlug: "alpha",
      ideaSlug: "safe-bet",
      founderYes: true,
      why: SAFE_BET,
    });
    assert.equal(paper.ok, false);
    assert.match(String(paper.error), /instrument tracker/);

    const channel = await store.createIdea(founder, {
      companySlug: "alpha",
      ideaSlug: "partner-bet",
      founderYes: true,
      why: CHANNEL_BET,
    });
    assert.equal(channel.ok, false);
  });

  it("named-group kill line (pay or use) succeeds; keywords in a product why do not reject", async () => {
    const store = alphaStore();
    const founder = bearer("founder@example.test");

    const created = await store.createIdea(founder, {
      companySlug: "alpha",
      ideaSlug: "dispatch-bet",
      founderYes: true,
      why: PRODUCT_WHY,
    });
    assert.equal(created.ok, true);
    assert.equal(created.ideas[0].slug, "dispatch-bet");
    assert.equal(created.ideas[0].clocks.journeyPhase, 1);
    assert.equal(created.ideas[0].relationshipShelf, undefined);

    const keyword = await store.createIdea(founder, {
      companySlug: "alpha",
      ideaSlug: "books-bet",
      founderYes: true,
      why: KEYWORD_IN_PRODUCT,
    });
    assert.equal(keyword.ok, true);

    const phase = await store.putJourney(founder, {
      companySlug: "alpha",
      ideaSlug: "dispatch-bet",
      journeyPhase: 2,
      currentGate: "advance",
      why: PRODUCT_WHY,
      founderYes: true,
      gateEnrichment: GATE_ENR,
    });
    assert.equal(phase.ok, true);
    assert.equal(phase.idea.clocks.journeyPhase, 2);
  });

  it("constraint-only / recon non-phase still OK under 2.8.17", async () => {
    const store = alphaStore();
    const founder = bearer("founder@example.test");

    const recon = await store.putJourney(founder, {
      companySlug: "alpha",
      constraintThisWeek: "need one operator who already pays",
      why: "recon patch",
      founderYes: false,
    });
    assert.equal(recon.ok, true);
    assert.equal(recon.idea.constraintThisWeek, "need one operator who already pays");
    assert.equal(recon.idea.clocks.journeyPhase, 1);
  });

  it("existing non-product slug rejects phase writes and does not pretend a journey", async () => {
    const store = alphaStore([
      {
        id: "idea-paper",
        companyId: "co-alpha",
        slug: "lead-paper",
        name: "Lead paper",
        journeyPhase: 1,
        loopStage: 1,
        currentGate: "hold",
        scoreboard: {
          ...defaultScoreboard(),
          hypothesis: SAFE_BET,
        },
      },
    ]);
    const founder = bearer("founder@example.test");

    const seen = await store.getJourney(founder, {
      companySlug: "alpha",
      ideaSlug: "lead-paper",
    });
    assert.equal(seen.ok, true);
    assert.equal(seen.ideas[0].relationshipShelf, true);
    assert.match(seen.ideas[0].snapshot, /Relationship shelf — not a journey/);
    assert.doesNotMatch(seen.ideas[0].snapshot, /Journey: Write the bet/);
    assert.match(seen.ideas[0].visualFlow, /not a journey/);

    const phase = await store.putJourney(founder, {
      companySlug: "alpha",
      ideaSlug: "lead-paper",
      journeyPhase: 2,
      why: PRODUCT_WHY,
      founderYes: true,
      gateEnrichment: GATE_ENR,
    });
    assert.equal(phase.ok, false);
    assert.match(String(phase.error), /relationship book \/ instrument tracker/);

    const recon = await store.putJourney(founder, {
      companySlug: "alpha",
      ideaSlug: "lead-paper",
      constraintThisWeek: "call the lawyer on Tuesday",
      why: "recon patch",
      founderYes: false,
    });
    assert.equal(recon.ok, true);
    assert.equal(recon.idea.constraintThisWeek, "call the lawyer on Tuesday");
    assert.equal(recon.idea.clocks.journeyPhase, 1);
    assert.equal(recon.idea.relationshipShelf, true);
  });
});

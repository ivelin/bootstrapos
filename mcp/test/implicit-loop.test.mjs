/**
 * OS 2.8.17 implicit loop — quality bar, not card.
 * loopStage change → reject. Constraint-only write → succeeds.
 * Phase/gate still need founderYes. No mentee/PII.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  fixtureJourneyStore,
  twoMinuteSnapshot,
} from "../dist/journey.js";
import {
  LOOP_STAGE_MUTATION_REJECTED,
  SPOKEN_LOOP_WRITE_REJECTED,
  loopStageMutationRejected,
  spokenLoopWriteRejected,
  writeBackMissingFromArtifacts,
} from "../dist/loop-freeze.js";
import { OS_VERSION } from "../dist/constants.js";
import { patchState, readState } from "../dist/state.js";
import { initCompany, useCompany, clearSession } from "../dist/companies.js";
import { makeTempEnv, rmrf } from "./helpers.mjs";

function bearer(email) {
  return { authenticated: true, email, principal: email, identityStore: "memory" };
}

const GATE_ENR = {
  whatChanged: "named the week's bottleneck",
  whatWereNotDoing: "not a landing-page side quest",
};

describe("OS 2.8.17 implicit loop (quality bar, not card)", () => {
  it("pins pack version and reject helpers", () => {
    assert.equal(OS_VERSION, "2.8.18");
    assert.equal(loopStageMutationRejected(1, undefined), false);
    assert.equal(loopStageMutationRejected(1, 1), false);
    assert.equal(loopStageMutationRejected(1, 2), true);
    assert.equal(spokenLoopWriteRejected({}), false);
    assert.equal(spokenLoopWriteRejected({ loopSpoken: "Ask" }), true);
    assert.equal(spokenLoopWriteRejected({ loopWeek: "Do" }), true);
    assert.equal(writeBackMissingFromArtifacts({}), true);
    assert.equal(writeBackMissingFromArtifacts({ lastWeeklySnapshotAt: "2026-09-20" }), false);
    assert.match(LOOP_STAGE_MUTATION_REJECTED, /quality bar/);
    assert.match(SPOKEN_LOOP_WRITE_REJECTED, /not card fields/);
  });

  it("put_journey rejects loopStage change; identical no-op is allowed", async () => {
    const store = fixtureJourneyStore();
    const founder = bearer("founder-core@example.test");
    const changed = await store.putJourney(founder, {
      companySlug: "corehaul",
      loopStage: 2,
      why: "try to move the week verb",
      founderYes: true,
    });
    assert.equal(changed.ok, false);
    assert.match(String(changed.error), /loopStage mutations are rejected/);

    const spoken = await store.putJourney(founder, {
      companySlug: "corehaul",
      loopSpoken: "Ask",
      why: "spoken label write",
      founderYes: true,
    });
    assert.equal(spoken.ok, false);
    assert.match(String(spoken.error), /not card fields/);

    const noop = await store.putJourney(founder, {
      companySlug: "corehaul",
      loopStage: 1,
      constraintThisWeek: "need two operators who already pay for dispatch",
      why: "identical loop is a no-op",
      founderYes: true,
    });
    assert.equal(noop.ok, true);
    assert.equal(noop.idea.clocks.loopStage, 1);
    assert.equal(noop.idea.constraintThisWeek, "need two operators who already pay for dispatch");
  });

  it("constraint-only write succeeds; phase and gate still need founderYes", async () => {
    const store = fixtureJourneyStore();
    const founder = bearer("founder-core@example.test");

    const constraint = await store.putJourney(founder, {
      companySlug: "corehaul",
      constraintThisWeek: "need one operator who already pays",
      why: "recon patch",
      founderYes: false,
    });
    assert.equal(constraint.ok, true);
    assert.equal(constraint.idea.constraintThisWeek, "need one operator who already pays");
    assert.equal(constraint.idea.clocks.journeyPhase, 1);
    assert.equal(constraint.idea.clocks.currentGate, "hold");

    const phaseNo = await store.putJourney(founder, {
      companySlug: "corehaul",
      journeyPhase: 2,
      why: "thesis written",
      founderYes: false,
    });
    assert.equal(phaseNo.ok, false);
    assert.match(String(phaseNo.error), /founder yes required/);

    const gateNo = await store.putJourney(founder, {
      companySlug: "corehaul",
      currentGate: "advance",
      why: "ready",
      founderYes: false,
      gateEnrichment: GATE_ENR,
    });
    assert.equal(gateNo.ok, false);
    assert.match(String(gateNo.error), /founder yes required/);

    const phaseYes = await store.putJourney(founder, {
      companySlug: "corehaul",
      journeyPhase: 2,
      currentGate: "advance",
      why: "operators who already pay for dispatch — kill if they do not use the weekly report",
      founderYes: true,
      gateEnrichment: GATE_ENR,
    });
    assert.equal(phaseYes.ok, true);
    assert.equal(phaseYes.idea.clocks.journeyPhase, 2);
    assert.equal(phaseYes.idea.clocks.currentGate, "advance");
    assert.equal(phaseYes.idea.clocks.loopStage, 1);
  });

  it("founder snapshot is journey + gate + constraint + missing artifacts", async () => {
    const store = fixtureJourneyStore();
    const founder = bearer("founder-core@example.test");
    const seen = await store.getJourney(founder, { companySlug: "corehaul" });
    const snap = seen.ideas[0].snapshot;
    assert.match(snap, /Journey: Write the bet \(1\)/);
    assert.match(snap, /Gate: hold/);
    assert.match(snap, /Missing artifacts: Write back/);
    assert.doesNotMatch(snap, /Loop: Ask/);
    assert.doesNotMatch(snap, /Loop: Do/);
    assert.doesNotMatch(snap, /Loop: Write back \(7\)/);
    assert.equal(seen.ideas[0].clocks.loopStage, 1);
    assert.equal(seen.ideas[0].clocks.loopSpoken, "Ask");
    const rebuilt = twoMinuteSnapshot(
      { slug: "corehaul", label: "corehaul" },
      {
        name: "corehaul",
        journeyPhase: 1,
        loopStage: 7,
        currentGate: "hold",
        scoreboard: { schema_version: 1, openQuestions: [] },
      },
      [],
      [],
    );
    assert.doesNotMatch(rebuilt, /Loop: Write back/);
    assert.match(rebuilt, /Missing artifacts: Write back/);
  });
});

describe("local patchState implicit loop", () => {
  let dataRoot;

  beforeEach(() => {
    dataRoot = makeTempEnv();
    clearSession();
    initCompany({ companyId: "alpha", displayName: "Alpha", hypothesis: "OS for founders" });
    useCompany("alpha");
  });

  afterEach(() => {
    clearSession();
    rmrf(dataRoot);
  });

  it("rejects loopStage change and spoken-label writes; constraint-like fields still patch", () => {
    assert.throws(() => patchState({ loopStage: 4 }), /loopStage mutations are rejected/);
    assert.throws(() => patchState({ loopSpoken: "Do" }), /not card fields/);
    const { state } = patchState({ openQuestions: ["what would kill this bet"] });
    assert.deepEqual(state.openQuestions, ["what would kill this bet"]);
    assert.equal(readState().loopStage, 1);
  });
});

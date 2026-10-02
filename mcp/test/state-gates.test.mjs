import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { makeTempEnv, rmrf } from "./helpers.mjs";
import {
  initCompany,
  useCompany,
  clearSession,
  listCompanies,
} from "../dist/companies.js";
import { patchState, readState, whereAreWePlain, appendDecisionTrace } from "../dist/state.js";

describe("phase advance gate", () => {
  let dataRoot;

  beforeEach(() => {
    dataRoot = makeTempEnv();
    clearSession();
    initCompany({ companyId: "charlie", displayName: "Pirin", hypothesis: "OS for founders" });
  });

  afterEach(() => {
    clearSession();
    rmrf(dataRoot);
  });

  it("rejects journeyPhase change without founder approval", () => {
    const before = readState();
    assert.equal(before.journeyPhase, 1);
    const { state, warnings } = patchState({ journeyPhase: 5 }, { allowPhaseAdvance: false });
    assert.equal(state.journeyPhase, 1);
    assert.ok(warnings.some((w) => /founder approval/i.test(w)));
  });

  it("applies journeyPhase change only with founder approval", () => {
    const { state, warnings } = patchState({ journeyPhase: 5 }, { allowPhaseAdvance: true });
    assert.equal(state.journeyPhase, 5);
    assert.ok(warnings.some((w) => /founderApprovedPhaseChange/i.test(w)));
  });

  it("rejects loopStage mutation; identical no-op is allowed", () => {
    const before = readState();
    assert.throws(
      () => patchState({ loopStage: 3 }, { allowPhaseAdvance: false }),
      /loopStage mutations are rejected/,
    );
    assert.equal(readState().loopStage, before.loopStage);
    const { state } = patchState({ loopStage: before.loopStage }, { allowPhaseAdvance: false });
    assert.equal(state.loopStage, before.loopStage);
    assert.equal(state.journeyPhase, 1);
  });

  it("whereAreWePlain includes company and clocks", () => {
    const plain = whereAreWePlain(readState());
    assert.match(plain, /\*\*charlie's biggest problem right now:/);
    assert.match(plain, /\| What we're working on \| Where it stands \| What happens next \| Who \|/);
    assert.match(plain, /\*🟢 working on it now/);
    assert.doesNotMatch(plain, /Journey: Write the bet/);
    assert.doesNotMatch(plain, /\bP0\b|customer bet|\bengagement\b/i);
  });

  it("appendDecisionTrace writes under active company traces", () => {
    const file = appendDecisionTrace({
      title: "Hold phase",
      decision: "Stay in phase 1 until thesis written",
      evidence: "no real conversations yet",
      founderApproved: true,
    });
    assert.ok(fs.existsSync(file));
    const body = fs.readFileSync(file, "utf8");
    assert.match(body, /Hold phase/);
    assert.match(body, /Founder approved:\*\* yes/);
    assert.ok(file.includes(path.join("instances", "charlie")));
  });
});

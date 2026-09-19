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

  it("allows loopStage without founder phase flag", () => {
    const { state } = patchState({ loopStage: 3 }, { allowPhaseAdvance: false });
    assert.equal(state.loopStage, 3);
    assert.equal(state.journeyPhase, 1);
  });

  it("whereAreWePlain includes company and clocks", () => {
    const plain = whereAreWePlain(readState());
    assert.match(plain, /charlie/i);
    assert.match(plain, /Journey: Write the bet \(1\)/);
    assert.match(plain, /Live loop: Ask \(1\)/);
    assert.match(plain, /not demand or PMF/i);
    assert.match(plain, /observed wins/i);
    assert.match(plain, /Spoken yes cannot promote/i);
    assert.match(plain, /demographic one-liner/i);
    assert.match(plain, /where-are-we\.py/);
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

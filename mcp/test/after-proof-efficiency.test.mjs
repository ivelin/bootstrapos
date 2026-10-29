/**
 * After-proof efficiency page + plugin gate.
 * Not a house rule. Not Path 1. Not a mentee dashboard.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  afterProofEfficiencyPageMayOpen,
  emptyContextMayInventEfficiencyMetrics,
  path1MayCiteEfficiencyNumbers,
  sourceOlderThanOneYearIsLive,
  AFTER_PROOF_EFFICIENCY_URL,
} from "../dist/after-proof-efficiency.js";
import { REPO_ROOT } from "./helpers.mjs";

const PAGE = path.join(REPO_ROOT, "company-os", "after-proof-efficiency.md");
const FIRST = path.join(REPO_ROOT, "company-os", "first-hour.md");
const PATH1_SKILL = path.join(REPO_ROOT, "plugin", "skills", "path-1-default", "SKILL.md");
const FIRST_SKILL = path.join(REPO_ROOT, "plugin", "skills", "first-hour", "SKILL.md");
const GATE_SKILL = path.join(
  REPO_ROOT,
  "plugin",
  "skills",
  "after-proof-efficiency",
  "SKILL.md",
);
const STANDING = path.join(REPO_ROOT, "plugin", "skills", "query-os-first", "SKILL.md");
const PINS = path.join(REPO_ROOT, "plugin", "skills", "house-rule-pins", "SKILL.md");

const LEAK = /CAC payback|NRR|GRR|magic number|0\.75 stop-spend|1\.0 may-spend/;

function day0Block(os) {
  const m = os.match(/## Day 0: lifestyle or swinging for the fences[\s\S]*?(?=\n## )/);
  assert.ok(m, "Day 0 section missing");
  return m[0];
}

function path1Block(readme) {
  const m = readme.match(/### 1\. Point an AI at this pack[\s\S]*?(?=### 2\. Instantiate files)/);
  return m ? m[0] : readme;
}

describe("after-proof efficiency (resource page)", () => {
  it("page is dated, five instruments only, stale not the aim", () => {
    const page = fs.readFileSync(PAGE, "utf8");
    assert.match(page, /Dated:\*\* 2026-08-24/);
    assert.match(page, /Not a house rule/);
    assert.match(page, /Not a third clock/);
    assert.match(page, /Not Day 0/);
    assert.match(page, /Not Path 1/);
    assert.match(page, /Not a mentee dashboard/);
    assert.match(page, /Open only if all three/);
    assert.match(page, /CAC payback \(gross-margin adjusted\)/);
    assert.match(page, /NRR and GRR/);
    assert.match(page, /Pilots fake NRR/);
    assert.match(page, /Usage, not seats/);
    assert.match(page, /Gross margin/);
    assert.match(page, /Magic number only if margin-adjusted/);
    assert.match(page, /0\.75 stop-spend/);
    assert.match(page, /1\.0 may-spend/);
    assert.match(page, /Benchmarkit 2026/);
    assert.match(page, /https:\/\/www\.benchmarkit\.ai\/2026-saas-ai-native-metrics/);
    assert.match(page, /LTV:CAC 3x/);
    assert.match(page, /T2D3/);
    assert.match(page, /dead as the aim/);
    assert.match(page, /Wiz-sized exit is not a goal/);
    assert.match(page, /older than a year is \*\*dead\*\* or \*\*cut\*\*/);
    assert.doesNotMatch(page, /T2D3 is the aim/);
    assert.doesNotMatch(page, /LTV:CAC 3x is the aim/);
  });

  it("gate opens only if fences + proof + they asked", () => {
    assert.equal(
      afterProofEfficiencyPageMayOpen({
        choseFences: true,
        hasProof: true,
        askedEfficiencyOrExit: true,
      }),
      true,
    );
    assert.equal(
      afterProofEfficiencyPageMayOpen({
        choseFences: false,
        hasProof: true,
        askedEfficiencyOrExit: true,
      }),
      false,
    );
    assert.equal(
      afterProofEfficiencyPageMayOpen({
        choseFences: true,
        hasProof: false,
        askedEfficiencyOrExit: true,
      }),
      false,
    );
    assert.equal(
      afterProofEfficiencyPageMayOpen({
        choseFences: true,
        hasProof: true,
        askedEfficiencyOrExit: false,
      }),
      false,
    );
    assert.equal(emptyContextMayInventEfficiencyMetrics(), false);
    assert.equal(path1MayCiteEfficiencyNumbers(), false);
    assert.equal(sourceOlderThanOneYearIsLive(), false);
  });

  it("plugin skill is the load-bearing gate; Path 1 / Day 0 leak no numbers", () => {
    const gate = fs.readFileSync(GATE_SKILL, "utf8");
    assert.ok(gate.length < 1800);
    assert.match(gate, /ALL of|ALL three/);
    assert.match(gate, /fences/);
    assert.match(gate, /lifestyle/);
    assert.match(gate, /proof/);
    assert.match(gate, /efficiency or an exit/);
    assert.match(gate, /Two clocks/);
    assert.ok(gate.includes(AFTER_PROOF_EFFICIENCY_URL));
    assert.doesNotMatch(gate, /0\.75 stop-spend/);
    assert.doesNotMatch(gate, /1\.0 may-spend/);

    const standing = fs.readFileSync(STANDING, "utf8");
    assert.match(standing, /Exit without fences\+proof/);
    assert.match(standing, /Two clocks/);

    const pins = fs.readFileSync(PINS, "utf8");
    assert.match(pins, /LTV:CAC 3x \/ T2D3 stale/);
    assert.ok(pins.includes(AFTER_PROOF_EFFICIENCY_URL));

    for (const file of [FIRST, PATH1_SKILL, FIRST_SKILL]) {
      const body = fs.readFileSync(file, "utf8");
      assert.doesNotMatch(body, LEAK);
      assert.doesNotMatch(body, /after-proof-efficiency/);
    }

    const readme = fs.readFileSync(path.join(REPO_ROOT, "README.md"), "utf8");
    assert.doesNotMatch(path1Block(readme), LEAK);
    assert.doesNotMatch(path1Block(readme), /after-proof-efficiency/);

    const os = fs.readFileSync(path.join(REPO_ROOT, "company-os", "operating-system.md"), "utf8");
    assert.doesNotMatch(day0Block(os), LEAK);
    assert.doesNotMatch(day0Block(os), /after-proof-efficiency/);
  });
});

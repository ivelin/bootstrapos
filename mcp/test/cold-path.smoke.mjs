/**
 * Cold-path smoke: clone-layout → build artifacts assumed → init companies → gates.
 * Run after `npm run build`. Exit non-zero on failure.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { makeTempEnv, rmrf, REPO_ROOT } from "./helpers.mjs";
import {
  initCompany,
  useCompany,
  clearSession,
  listCompanies,
} from "../dist/companies.js";
import { patchState, readState, whereAreWePlain } from "../dist/state.js";
import { evaluateExternalAsk } from "../dist/policy.js";
import { listOsDocs, readOsDoc } from "../dist/docs.js";

const dataRoot = makeTempEnv("bootstrap-cold-path-");
clearSession();

try {
  // 1. Docs readable
  assert.ok(listOsDocs().every((d) => d.bytes > 0));
  assert.match(readOsDoc("ready-for-human-eyes"), /human eyes/i);

  // 2. Multi-company init (alpha / bravo / charlie)
  for (const id of ["alpha", "bravo", "charlie"]) {
    initCompany({ companyId: id, displayName: id, hypothesis: `${id} thesis` });
  }
  assert.equal(listCompanies().companies.length, 3);

  // 3. Phase gate
  useCompany("charlie");
  let r = patchState({ journeyPhase: 6 }, { allowPhaseAdvance: false });
  assert.equal(r.state.journeyPhase, 1);
  r = patchState({ journeyPhase: 6 }, { allowPhaseAdvance: true });
  assert.equal(r.state.journeyPhase, 6);

  // 4. Isolation
  useCompany("alpha");
  assert.equal(readState().journeyPhase, 1);

  // 5. Human-eyes refuse
  useCompany("charlie");
  const eyes = readState().readyForHumanEyes?.status ?? "unknown";
  const deny = evaluateExternalAsk({ readyStatus: eyes, intent: "try my link" });
  assert.equal(deny.allow, false);

  // 6. Status plain + house rules
  const plain = whereAreWePlain(readState());
  assert.match(plain, /\*\*charlie's biggest problem right now:/);
  assert.match(plain, /\| What we're working on \| Where it stands \| What happens next \| Who \|/);
  assert.match(plain, /\*🟢 working on it now/);
  assert.doesNotMatch(plain, /Journey:|gate hold|customer bet|\bP0\b/i);

  const wherePy = path.join(
    dataRoot,
    "instances",
    "charlie",
    "company",
    "state",
    "where-are-we.py",
  );
  assert.ok(fs.existsSync(wherePy), "same state: where-are-we.py copied into instance");

  // 7. State files only under data root (never write company-os/)
  const osTemplate = path.join(REPO_ROOT, "company-os");
  const before = fs.readdirSync(osTemplate).sort().join(",");
  patchState({ lastAction: "cold_path_smoke" }, { allowPhaseAdvance: false });
  const after = fs.readdirSync(osTemplate).sort().join(",");
  assert.equal(before, after, "MCP must not mutate company-os templates");

  console.log("cold-path smoke: PASS");
  console.log(
    JSON.stringify(
      {
        dataRoot,
        companies: listCompanies().companies.map((c) => ({
          id: c.companyId,
          phase: c.journeyPhase,
          active: c.active,
        })),
      },
      null,
      2,
    ),
  );
} finally {
  clearSession();
  rmrf(dataRoot);
}

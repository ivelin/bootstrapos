/**
 * Spoken payload lead. Alpha fixture only. No DyeConverter/MicDots live writes.
 * Snapshot/spoken are founder voice — not a clock dump.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MemoryJourneyStore, defaultScoreboard } from "../dist/journey.js";
import { GATE_HOLD_DUMP, JOURNEY_PHASE_DUMP } from "../dist/initiative-card.js";
import { TOOL_GET_JOURNEY, HOSTED_MCP_INSTRUCTIONS } from "../dist/hosted-copy.js";
import { REPO_ROOT } from "./helpers.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(HERE, "..", "docs", "hosted-board-import.json"), "utf8"),
);

function bearer(email) {
  return { authenticated: true, email, principal: email, identityStore: "memory" };
}

function alphaStore() {
  const alpha = FIXTURE.companies.find((c) => c.slug === "alpha");
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
        scoreboard: { ...defaultScoreboard(), ...alpha.scoreboard },
      },
    ],
    [],
    [],
  );
}

describe("spoken payload lead (alpha fixture)", () => {
  it("spoken and snapshot are founder voice; not a clock dump", async () => {
    const store = alphaStore();
    const seen = await store.getJourney(bearer("founder@example.test"), { companySlug: "alpha" });
    assert.equal(seen.ok, true);
    assert.equal(typeof seen.spoken, "string");
    assert.match(seen.spoken, /^\*\*alpha\*\*:/);
    assert.match(seen.spoken, /operators who already pay for dispatch at bravo plant/);
    assert.match(seen.spoken, /\| Work \| State \| When \| Who \|/);
    assert.match(seen.spoken, /\*\*Next:\*\*/);
    assert.match(seen.spoken, /side file for counsel notes/);
    assert.doesNotMatch(seen.spoken, /^Open questions/m);
    assert.doesNotMatch(seen.spoken, /\bP0\b|\bFAST\b|\bSOPA\b|\bengagement\b|customer bet/i);
    assert.doesNotMatch(seen.spoken, JOURNEY_PHASE_DUMP);
    assert.doesNotMatch(seen.spoken, GATE_HOLD_DUMP);
    assert.doesNotMatch(seen.spoken, /customer_check|engagement|legal/);
    assert.doesNotMatch(seen.spoken, /wipLimit|OS 2\.8|journeyPhase/);
    assert.equal(Object.keys(seen)[1], "spoken");

    const snap = seen.ideas[0].snapshot;
    assert.equal(snap, seen.spoken);
    assert.doesNotMatch(snap, JOURNEY_PHASE_DUMP);
    assert.doesNotMatch(snap, GATE_HOLD_DUMP);
    assert.match(snap, /The goal is/);
    assert.equal(seen.ideas[0].clocks.journeyPhase, 1);
    assert.equal(seen.ideas[0].clocks.loopStage, 1);
    assert.equal(seen.ideas[0].clocks.currentGate, "hold");
    assert.ok(seen.card.bottleneck);
    assert.ok(Array.isArray(seen.card.customerChecks));
    assert.ok(Array.isArray(seen.card.footer));
    assert.equal("stage" in seen.card.company, false);
    assert.equal("gate" in seen.card.company, false);
    assert.equal("wipLimit" in seen.card.company, false);
    assert.equal(seen.card.clocks, undefined);
  });

  it("expand moves company clocks under card.clocks only", async () => {
    const store = alphaStore();
    const seen = await store.getJourney(bearer("founder@example.test"), {
      companySlug: "alpha",
      expandMeetingDoc: true,
    });
    assert.match(seen.spoken, /The goal is/);
    assert.doesNotMatch(seen.spoken, JOURNEY_PHASE_DUMP);
    assert.doesNotMatch(seen.ideas[0].snapshot, GATE_HOLD_DUMP);
    assert.equal("stage" in seen.card.company, false);
    assert.equal(seen.card.clocks.stage, "Write the bet (1)");
    assert.equal(seen.card.clocks.gate, "hold");
    assert.equal(seen.card.clocks.wipLimit, 1);
  });

  it("tool descriptions pin print spoken first", () => {
    assert.match(TOOL_GET_JOURNEY, /Print spoken first/);
    assert.doesNotMatch(TOOL_GET_JOURNEY, /Hide clocks|spoken card|Clocks are storage/);
    assert.match(HOSTED_MCP_INSTRUCTIONS, /Print spoken first/);
    assert.doesNotMatch(HOSTED_MCP_INSTRUCTIONS, /Clocks are storage|spoken card/);
    const info = fs.readFileSync(path.join(REPO_ROOT, "mcp/src/server.ts"), "utf8");
    assert.doesNotMatch(info, /spoken-card default/);
    assert.doesNotMatch(info, /five journey rungs \(Bet/);
    const os = fs.readFileSync(path.join(REPO_ROOT, "company-os/operating-system.md"), "utf8");
    assert.match(os, /Payload lead is spoken/);
    assert.match(os, /Leave week labels off the page until they ask/);
    assert.doesNotMatch(os, /Spoken card|Clocks are storage|Bet \/ Filter \/ Ground \/ Build \/ Try/);
  });
});

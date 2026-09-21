/**
 * Spoken-card + grounding EVAL (Ivelin yes 21 Sep 2026 Heavy).
 * Alpha / bravo fixtures only. No mentee PII. No live put_journey.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { MemoryJourneyStore, defaultScoreboard } from "../dist/journey.js";
import {
  GATE_HOLD_DUMP,
  JOURNEY_PHASE_DUMP,
  applySpokenPayloadLead,
  cardFromScoreboard,
  formatSpokenCard,
  isActivePayOrUse,
  looksLikePaperBottleneck,
  spokenBottleneckLineOf,
} from "../dist/initiative-card.js";
import { REPO_ROOT } from "./helpers.mjs";

const DUMP = {
  phase: JOURNEY_PHASE_DUMP,
  loop: /loop stage/i,
  gate: GATE_HOLD_DUMP,
  os: /osVersion/,
  wip: /\bWIP\b/,
};

const SUPPORTING = [
  {
    role: "advisor",
    state: "promise",
    clock: "—",
    nextAction: "keep the side file",
    lastObservedFact: "office hours tip recorded",
  },
  {
    role: "counsel",
    state: "clock",
    clock: "2026-11-01",
    nextAction: "park paper",
    lastObservedFact: "side file for counsel notes",
  },
];

const ENGAGEMENTS = [{ account: "bravo plant", kind: "nda", state: "clock" }];

const ALPHA_CHECK = {
  id: "alpha-check-1",
  kind: "customer_check",
  premise: "operators who already pay for dispatch at bravo plant — one conversation by 2026-10-03",
  measure: "one paid weekly report used in their shop",
  killLine: "kill if they do not use the weekly report",
  status: "active",
  last: "hold fixture empty board",
  next: "named operator conversation with a date",
  outcome: "none",
  impact: "none",
  evidence: "stated",
  clock: "2026-10-03",
};

const ALPHA_ENG = {
  id: "alpha-eng-1",
  kind: "engagement",
  premise: "bravo plant NDA",
  measure: "signed paper is not Try",
  killLine: "NDA is not Try",
  status: "waiting",
  last: "nda sent",
  next: "paid or use in their environment",
  outcome: "none",
  impact: "obligation",
  evidence: "stated",
  parentId: "alpha-check-1",
};

const ALPHA_LEGAL = {
  id: "alpha-legal-1",
  kind: "legal",
  premise: "side file for counsel notes",
  measure: "paper cannot promote",
  killLine: "legal paper cannot promote",
  status: "proposed",
  last: "none",
  next: "keep off the title",
  outcome: "none",
  impact: "clock",
  evidence: "stated",
};

function bearer(email) {
  return { authenticated: true, email, principal: email, identityStore: "memory" };
}

function alphaStore(scoreboard, gate = "hold") {
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
        currentGate: gate,
        scoreboard,
      },
    ],
    [],
    [],
  );
}

function alsoMovingBody(spoken) {
  const chunk = String(spoken).split("Also moving (not the bottleneck)")[1] ?? "";
  return chunk.split("Open questions")[0] ?? "";
}

function assertNoClockDump(text) {
  assert.doesNotMatch(text, DUMP.phase);
  assert.doesNotMatch(text, DUMP.loop);
  assert.doesNotMatch(text, DUMP.gate);
  assert.doesNotMatch(text, DUMP.os);
  assert.doesNotMatch(text, DUMP.wip);
}

describe("spoken-card eval A format", () => {
  it("spoken exists, starts with company then Bottleneck #1; no clock dump", async () => {
    const store = alphaStore({
      ...defaultScoreboard(),
      constraint_this_week: "operators at bravo plant who already pay for dispatch",
      openQuestions: ["Which operator will try a paid week?"],
      supporting: SUPPORTING,
      engagements: ENGAGEMENTS,
    });
    const seen = await store.getJourney(bearer("founder@example.test"), { companySlug: "alpha" });
    assert.equal(seen.ok, true);
    assert.equal(typeof seen.spoken, "string");
    assert.match(seen.spoken, /^alpha\n/);
    assert.match(seen.spoken, /Bottleneck #1/);
    const companyIdx = seen.spoken.indexOf("alpha");
    const bnIdx = seen.spoken.indexOf("Bottleneck #1");
    assert.ok(companyIdx >= 0 && bnIdx > companyIdx);
    assertNoClockDump(seen.spoken);
    assertNoClockDump(seen.ideas[0].snapshot);
    assert.equal("stage" in seen.card.company, false);
    assert.equal("gate" in seen.card.company, false);
    assert.equal("wipLimit" in seen.card.company, false);
    assert.match(seen.spoken, /Also moving \(not the bottleneck\)/);
    assert.match(seen.spoken, /Open questions/);
    assert.match(seen.spoken, /Which operator will try a paid week\?/);
    assert.doesNotMatch(seen.spoken, /loopStage|journeyPhase|osVersion/);
  });
});

describe("spoken-card eval B grounding", () => {
  it("empty initiatives[] + supporting/engagements lists them in the spoken footer", async () => {
    const store = alphaStore({
      ...defaultScoreboard(),
      constraint_this_week: "operators at bravo plant who already pay for dispatch",
      openQuestions: ["Which operator will try a paid week?"],
      supporting: SUPPORTING,
      engagements: ENGAGEMENTS,
      initiatives: [],
    });
    const seen = await store.getJourney(bearer("founder@example.test"), { companySlug: "alpha" });
    const footer = alsoMovingBody(seen.spoken);
    assert.doesNotMatch(footer, /^\s*none yet\s*$/m);
    assert.match(footer, /office hours tip recorded/);
    assert.match(footer, /side file for counsel notes/);
    assert.match(footer, /bravo plant/);
    assert.equal(Array.isArray(seen.ideas[0].scoreboard.initiatives), true);
    assert.equal(seen.ideas[0].scoreboard.initiatives.length, 0);
  });

  it("initiatives[] present nests engagements and keeps paper in the footer", async () => {
    const store = alphaStore({
      ...defaultScoreboard(),
      constraint_this_week: "quote to site and date",
      openQuestions: ["Which operator will try a paid week?"],
      initiatives: [ALPHA_CHECK, ALPHA_ENG, ALPHA_LEGAL],
    });
    const seen = await store.getJourney(bearer("founder@example.test"), { companySlug: "alpha" });
    const lead = seen.spoken.split("Also moving")[0];
    assert.match(lead, /operators who already pay for dispatch at bravo plant/);
    assert.match(lead, /bravo plant NDA/);
    assert.match(lead, /where it stands:/);
    assert.doesNotMatch(lead, /side file for counsel notes/);
    assert.match(alsoMovingBody(seen.spoken), /side file for counsel notes/);
    assert.equal(seen.card.bottleneck.kind, "customer_check");
    assert.equal(seen.card.customerChecks[0].engagements[0].premise, "bravo plant NDA");
    assert.equal(seen.card.footer.some((row) => row.kind === "legal"), true);
    assert.notEqual(seen.card.bottleneck.kind, "legal");
    assert.notEqual(seen.card.bottleneck.kind, "advisor");
    assert.notEqual(seen.card.bottleneck.kind, "capital");
  });

  it("paper SAFE/SOPA/FAST cannot be the bottleneck premise without the override flag", () => {
    assert.equal(looksLikePaperBottleneck("SOPA side file while the plant try waits"), true);
    assert.equal(looksLikePaperBottleneck("close the SAFE"), true);
    assert.equal(looksLikePaperBottleneck("FAST draft"), true);
    assert.equal(looksLikePaperBottleneck("operators who already pay for dispatch"), false);
    const paperConstraint = "SOPA side file while the plant try waits";
    const denied = cardFromScoreboard({
      slug: "alpha",
      label: "alpha",
      journeyPhase: 1,
      gate: "hold",
      scoreboard: {
        constraint_this_week: paperConstraint,
        supporting: SUPPORTING,
        engagements: ENGAGEMENTS,
      },
    });
    assert.equal(denied.bottleneck, null);
    const spoken = formatSpokenCard({
      label: "alpha",
      card: denied,
      constraintThisWeek: paperConstraint,
      supporting: SUPPORTING,
      engagements: ENGAGEMENTS,
      initiativesPresent: false,
      openQuestions: ["Which operator will try a paid week?"],
    });
    assert.doesNotMatch(spokenBottleneckLineOf(spoken), /SOPA|SAFE|FAST/);
    const allowed = cardFromScoreboard({
      slug: "alpha",
      label: "alpha",
      journeyPhase: 1,
      gate: "hold",
      scoreboard: { constraint_this_week: paperConstraint },
      allowPaperBottleneck: true,
    });
    assert.match(allowed.bottleneck?.premise ?? "", /SOPA/);
    const override = formatSpokenCard({
      label: "alpha",
      card: allowed,
      constraintThisWeek: paperConstraint,
      allowPaperBottleneck: true,
    });
    assert.match(spokenBottleneckLineOf(override), /SOPA/);
  });

  it("killed idea spoken has Kill and does not invent an active pay-or-use bottleneck", async () => {
    const store = alphaStore(
      {
        ...defaultScoreboard(),
        constraint_this_week: "operators at bravo plant who already pay for dispatch",
        openQuestions: ["What did we learn?"],
        supporting: SUPPORTING,
        killPostmortem: {
          why: "no one paid",
          lessonsLearned: "operators already have a workaround",
          actionableInsights: "start from observed paid use",
        },
      },
      "kill",
    );
    const seen = await store.getJourney(bearer("founder@example.test"), { companySlug: "alpha" });
    assert.match(seen.spoken, /Kill/);
    assert.match(seen.ideas[0].snapshot, /Kill/);
    assert.equal(isActivePayOrUse(seen.card.bottleneck), false);
    if (seen.card.bottleneck) {
      assert.notEqual(seen.card.bottleneck.status, "active");
      assert.doesNotMatch(seen.card.bottleneck.measure ?? "", /pay or use/i);
    }
    assert.equal(
      seen.card.customerChecks.some((row) => row.id === "legacy-constraint" && isActivePayOrUse(row)),
      false,
    );
  });
});

describe("spoken-card eval C snapshot bottleneck line", () => {
  it("same Bottleneck #1 line on spoken and snapshot when constraint != premise", async () => {
    const store = alphaStore({
      ...defaultScoreboard(),
      constraint_this_week: "quote to site and date",
      openQuestions: ["Which operator will try a paid week?"],
      initiatives: [ALPHA_CHECK, ALPHA_ENG, ALPHA_LEGAL],
    });
    const seen = await store.getJourney(bearer("founder@example.test"), { companySlug: "alpha" });
    const spokenLine = spokenBottleneckLineOf(seen.spoken);
    const snapLine = spokenBottleneckLineOf(seen.ideas[0].snapshot);
    assert.equal(spokenLine, snapLine);
    assert.match(spokenLine, /operators who already pay for dispatch at bravo plant/);
    assert.notEqual(spokenLine, seen.ideas[0].constraintThisWeek);
    assert.equal(seen.ideas[0].constraintThisWeek, "quote to site and date");
  });

  it("hosted-shaped payload: payload supporting + missing idea.card still grounds and matches", () => {
    const raw = {
      ok: true,
      company: { slug: "alpha", label: "alpha" },
      supporting: SUPPORTING,
      engagements: ENGAGEMENTS,
      ideas: [
        {
          slug: "default",
          name: "alpha",
          clocks: { journeyPhase: 1, loopStage: 1, currentGate: "hold" },
          constraintThisWeek: "quote to site and date",
          scoreboard: {
            schema_version: 1,
            constraint_this_week: "quote to site and date",
            openQuestions: ["Which operator will try a paid week?"],
          },
          snapshot: "Bottleneck #1: quote to site and date",
        },
      ],
    };
    const seen = applySpokenPayloadLead(raw);
    const footer = alsoMovingBody(seen.spoken);
    assert.doesNotMatch(footer, /^\s*none yet\s*$/m);
    assert.match(footer, /office hours tip recorded/);
    assert.match(footer, /bravo plant/);
    assert.equal(spokenBottleneckLineOf(seen.spoken), spokenBottleneckLineOf(seen.ideas[0].snapshot));
    assert.equal(seen.spoken, seen.ideas[0].snapshot);
  });
});

describe("spoken-card eval D CI wires", () => {
  it("test:unit, user-path, and OS one-line note include the eval", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "mcp/package.json"), "utf8"));
    assert.match(pkg.scripts["test:unit"], /spoken-card-eval\.test\.mjs/);
    assert.match(pkg.scripts["verify:user-path"], /spoken-card-eval\.test\.mjs/);
    const yml = fs.readFileSync(path.join(REPO_ROOT, ".github/workflows/mcp-ci.yml"), "utf8");
    assert.match(yml, /npm run test:unit/);
    assert.match(yml, /npm run verify:user-path/);
    assert.match(yml, /production pin \(main only\)/);
    assert.match(yml, /github\.ref == 'refs\/heads\/main'/);
    assert.doesNotMatch(yml, /new Vercel project|vercel project create/i);
    const os = fs.readFileSync(path.join(REPO_ROOT, "company-os/operating-system.md"), "utf8");
    assert.match(
      os,
      /Eval is CI\. Spoken footer cannot drop supporting\/engagements\. Snapshot matches spoken bottleneck line\./,
    );
  });
});

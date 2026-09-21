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
  alsoMovingBodyOf,
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
  writeTheBet: /Write the bet \(\d\)/,
  ndaTry: /NDA is not Try/,
  safeProof: /SAFE is not proof/,
  storedClocks: /stored clocks stay/,
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

const ALPHA_CAPITAL = {
  id: "alpha-capital-1",
  kind: "capital",
  premise: "side file for a term note",
  measure: "paper cannot promote",
  killLine: "instrument cannot promote",
  status: "waiting",
  last: "inbox only",
  next: "keep off the title",
  outcome: "none",
  impact: "clock",
  evidence: "stated",
};

const ALPHA_ADVISOR = {
  id: "alpha-advisor-1",
  kind: "advisor",
  premise: "office hours tip recorded",
  measure: "ride-along is assumed",
  killLine: "advisor cannot promote",
  status: "proposed",
  last: "tip recorded",
  next: "keep off the title",
  outcome: "none",
  impact: "none",
  evidence: "stated",
};

const DYE_SHAPED = [ALPHA_CHECK, ALPHA_ENG, ALPHA_CAPITAL, ALPHA_LEGAL, ALPHA_ADVISOR];

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
  return alsoMovingBodyOf(spoken) ?? "";
}

function assertNoClockDump(text) {
  assert.doesNotMatch(text, DUMP.phase);
  assert.doesNotMatch(text, DUMP.loop);
  assert.doesNotMatch(text, DUMP.gate);
  assert.doesNotMatch(text, DUMP.os);
  assert.doesNotMatch(text, DUMP.wip);
  assert.doesNotMatch(text, DUMP.writeTheBet);
  assert.doesNotMatch(text, DUMP.ndaTry);
  assert.doesNotMatch(text, DUMP.safeProof);
  assert.doesNotMatch(text, DUMP.storedClocks);
}

function assertAlsoMovingMatch(spoken, snapshot) {
  const snapFooter = alsoMovingBodyOf(snapshot);
  if (snapFooter === null) return;
  assert.equal(snapFooter, alsoMovingBodyOf(spoken));
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
    assertAlsoMovingMatch(seen.spoken, seen.ideas[0].snapshot);
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
    assertAlsoMovingMatch(seen.spoken, seen.ideas[0].snapshot);
  });

  it("empty initiatives[] + supporting[] lists supporting under Also moving", async () => {
    const store = alphaStore({
      ...defaultScoreboard(),
      constraint_this_week: "operators at bravo plant who already pay for dispatch",
      openQuestions: ["Which operator will try a paid week?"],
      supporting: SUPPORTING,
      initiatives: [],
    });
    const seen = await store.getJourney(bearer("founder@example.test"), { companySlug: "alpha" });
    const footer = alsoMovingBody(seen.spoken);
    assert.doesNotMatch(footer, /^\s*none yet\s*$/m);
    assert.notEqual(footer, "none yet");
    assert.match(footer, /office hours tip recorded/);
    assert.match(footer, /side file for counsel notes/);
    assertAlsoMovingMatch(seen.spoken, seen.ideas[0].snapshot);
  });

  it("DyeConverter-shaped alpha: capital|legal|advisor cannot be Also moving none yet", async () => {
    const store = alphaStore({
      ...defaultScoreboard(),
      constraint_this_week: "quote to site and date",
      openQuestions: ["Which operator will try a paid week?"],
      initiatives: DYE_SHAPED,
    });
    const seen = await store.getJourney(bearer("founder@example.test"), { companySlug: "alpha" });
    const footer = alsoMovingBody(seen.spoken);
    assert.doesNotMatch(footer, /^\s*none yet\s*$/m);
    assert.match(footer, /side file for a term note/);
    assert.match(footer, /side file for counsel notes/);
    assert.match(footer, /office hours tip recorded/);
    const lead = seen.spoken.split("Also moving")[0];
    assert.match(lead, /bravo plant NDA\n\s+where it stands:/);
    assert.match(lead, /\n\s+next:/);
    assert.doesNotMatch(lead, /side file for a term note/);
    assertAlsoMovingMatch(seen.spoken, seen.ideas[0].snapshot);
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
    assert.match(seen.spoken, /bravo plant NDA\n\s+where it stands:\s+nda sent/);
    assert.equal(seen.card.bottleneck.kind, "customer_check");
    assert.equal(seen.card.customerChecks[0].engagements[0].premise, "bravo plant NDA");
    assert.equal(seen.card.footer.some((row) => row.kind === "legal"), true);
    assert.notEqual(seen.card.bottleneck.kind, "legal");
    assert.notEqual(seen.card.bottleneck.kind, "advisor");
    assert.notEqual(seen.card.bottleneck.kind, "capital");
    assertAlsoMovingMatch(seen.spoken, seen.ideas[0].snapshot);
  });

  it("when initiatives[] present, dual-read is dead for the card lead", () => {
    const card = cardFromScoreboard({
      slug: "alpha",
      label: "alpha",
      journeyPhase: 1,
      gate: "hold",
      scoreboard: {
        initiatives: DYE_SHAPED,
        supporting: SUPPORTING,
        engagements: ENGAGEMENTS,
        progress: ["called the plant"],
        constraint_this_week: "quote to site and date",
      },
    });
    assert.equal(card.bottleneck?.premise, ALPHA_CHECK.premise);
    assert.doesNotMatch(card.bottleneck?.premise ?? "", /office hours|called the plant/);
    assert.equal(card.customerChecks[0].engagements[0].premise, "bravo plant NDA");
    assert.equal(card.footer.some((row) => row.kind === "capital"), true);
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
    assert.equal(seen.card.killed, true);
    assert.match(String(seen.ideas[0].killedCard ?? ""), /Kill/);
    assert.equal(isActivePayOrUse(seen.card.bottleneck), false);
    if (seen.card.bottleneck) {
      assert.notEqual(seen.card.bottleneck.status, "active");
      assert.equal(seen.card.bottleneck.outcome, "killed");
      assert.doesNotMatch(seen.card.bottleneck.measure ?? "", /pay or use/i);
    }
    assert.equal(
      seen.card.customerChecks.some((row) => row.id === "legacy-constraint" && isActivePayOrUse(row)),
      false,
    );
    assertAlsoMovingMatch(seen.spoken, seen.ideas[0].snapshot);
  });

  it("multi-idea company spoken does not pretend one unnamed card", async () => {
    const board = {
      ...defaultScoreboard(),
      constraint_this_week: "operators at bravo plant who already pay for dispatch",
      openQuestions: ["Which operator will try a paid week?"],
      supporting: SUPPORTING,
    };
    const store = new MemoryJourneyStore(
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
          scoreboard: board,
        },
        {
          id: "idea-bravo",
          companyId: "co-alpha",
          slug: "bravo",
          name: "bravo",
          journeyPhase: 1,
          loopStage: 1,
          currentGate: "hold",
          scoreboard: {
            ...defaultScoreboard(),
            constraint_this_week: "need one operator who already pays",
            openQuestions: ["What paid week is next?"],
          },
        },
      ],
      [],
      [],
    );
    const seen = await store.getJourney(bearer("founder@example.test"), { companySlug: "alpha" });
    assert.ok(seen.ideas.filter((idea) => idea.clocks.currentGate !== "kill").length >= 2);
    assert.match(seen.spoken, /Also live \(separate boards\): bravo/);
    assert.doesNotMatch(seen.spoken.split("Also live")[0] ?? seen.spoken, /^Bottleneck #1:/);
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
    assertAlsoMovingMatch(seen.spoken, seen.ideas[0].snapshot);
  });

  it("hosted Dye-shaped snapshot Also-moving matches spoken footer", () => {
    const raw = {
      ok: true,
      company: { slug: "alpha", label: "alpha" },
      card: {
        company: { slug: "alpha", label: "alpha", bottleneckId: "alpha-check-1" },
        bottleneck: { ...ALPHA_CHECK },
        customerChecks: [{ ...ALPHA_CHECK, engagements: [ALPHA_ENG] }],
        footer: [ALPHA_CAPITAL, ALPHA_LEGAL, ALPHA_ADVISOR],
      },
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
            initiatives: DYE_SHAPED,
          },
          snapshot: "alpha\n\nBottleneck #1: quote to site and date\n\nAlso moving (not the bottleneck)\n  none yet\n",
        },
      ],
    };
    const seen = applySpokenPayloadLead(raw);
    const footer = alsoMovingBody(seen.spoken);
    assert.doesNotMatch(footer, /^\s*none yet\s*$/m);
    assert.match(footer, /side file for a term note/);
    assert.equal(alsoMovingBodyOf(seen.ideas[0].snapshot), alsoMovingBodyOf(seen.spoken));
    assert.equal(spokenBottleneckLineOf(seen.spoken), spokenBottleneckLineOf(seen.ideas[0].snapshot));
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
    assert.match(
      os,
      /Also-moving cannot be none-yet when supporting or footer rows exist; killed cards are killed\./,
    );
    const ciSh = fs.readFileSync(path.join(REPO_ROOT, "scripts/ci.sh"), "utf8");
    assert.match(ciSh, /spoken-card-eval\.test\.mjs/);
  });
});

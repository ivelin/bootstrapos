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
  FOUNDER_CARD_LEGEND,
  formatInitiativeCard,
  formatSpokenCard,
  founderCardBannedHit,
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

const SECTION_ORDER = ["Bet", "Other paths (not the main bet)", "Past bets", "Background"];

function assertFounderCard(text) {
  const raw = String(text);
  const lines = raw.split("\n").filter((line) => line.trim());
  assert.match(lines[0], /^\*\*[^*]+\*\*: .+ The goal is .+\.$/);
  assert.doesNotMatch(lines[0], /biggest problem right now/);
  assert.doesNotMatch(raw, /\| What we're working on \|/);
  const headers = raw.split("\n").filter((line) => line.startsWith("| Work |"));
  assert.equal(headers.length, 1);
  assert.equal(headers[0], "| Work | State | When | Who |");
  assert.equal(lines.at(-2), FOUNDER_CARD_LEGEND);
  assert.match(lines.at(-1), /^\*\*Next:\*\* .+/);
  assert.equal(founderCardBannedHit(raw), null);
  assert.doesNotMatch(raw, /\bP0\b/);
  assert.doesNotMatch(raw, /Bottleneck #1/);
  const sections = [...raw.matchAll(/^\| \*\*(Bet|Other paths \(not the main bet\)|Past bets|Background)\*\* \| \| \| \|$/gm)].map(
    (hit) => hit[1],
  );
  assert.equal(sections[0], "Bet");
  let last = -1;
  for (const name of sections) {
    const idx = SECTION_ORDER.indexOf(name);
    assert.ok(idx > last, `section out of order: ${name}`);
    last = idx;
  }
  const afterBet = raw.slice(raw.indexOf("| **Bet** | | | |")).split("\n").slice(1);
  const top = afterBet.find((line) => line.startsWith("|") && !line.startsWith("|---"));
  assert.match(top ?? "", /^\| 🎯 /);
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
  it("spoken exists, headline first, one table, legend last; no clock dump", async () => {
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
    assert.match(seen.spoken, /^\*\*alpha\*\*:/);
    assertFounderCard(seen.spoken);
    assertFounderCard(seen.ideas[0].snapshot);
    assertNoClockDump(seen.spoken);
    assertNoClockDump(seen.ideas[0].snapshot);
    assert.equal("stage" in seen.card.company, false);
    assert.equal("gate" in seen.card.company, false);
    assert.equal("wipLimit" in seen.card.company, false);
    assert.equal(seen.ideas[0].scoreboard.openQuestions[0], "Which operator will try a paid week?");
    assert.doesNotMatch(seen.spoken, /^Open questions/m);
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
    assertFounderCard(seen.spoken);
    assertFounderCard(seen.ideas[0].snapshot);
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
    assertFounderCard(seen.spoken);
    assertFounderCard(seen.ideas[0].snapshot);
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
    const rows = (alsoMovingBody(seen.spoken) ?? "").split("\n");
    assert.match(rows.find((row) => row.includes("🎯")) ?? "", /operators who already pay for dispatch at bravo plant/);
    assert.match(seen.spoken, /· · /);
    assert.match(seen.spoken, /bravo plant/);
    assert.doesNotMatch(rows.find((row) => row.includes("🎯")) ?? "", /side file for a term note/);
    assertFounderCard(seen.spoken);
    assertFounderCard(seen.ideas[0].snapshot);
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
    const rows = (alsoMovingBody(seen.spoken) ?? "").split("\n");
    assert.match(rows.find((row) => row.includes("🎯")) ?? "", /operators who already pay for dispatch at bravo plant/);
    assert.match(seen.spoken, /bravo plant/);
    assert.match(seen.spoken, /confidentiality promise/);
    assert.doesNotMatch(rows.find((row) => row.includes("🎯")) ?? "", /side file for counsel notes/);
    assert.match(alsoMovingBody(seen.spoken), /side file for counsel notes/);
    assert.doesNotMatch(seen.spoken, /\bNDA\b/i);
    assert.equal(seen.card.bottleneck.kind, "customer_check");
    assert.equal(seen.card.customerChecks[0].engagements[0].premise, "bravo plant NDA");
    assert.equal(seen.card.footer.some((row) => row.kind === "legal"), true);
    assert.notEqual(seen.card.bottleneck.kind, "legal");
    assert.notEqual(seen.card.bottleneck.kind, "advisor");
    assert.notEqual(seen.card.bottleneck.kind, "capital");
    assertFounderCard(seen.spoken);
    assertFounderCard(seen.ideas[0].snapshot);
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
    assertFounderCard(spoken);
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
    assert.match(spokenBottleneckLineOf(override), /stock option paperwork/);
    assertFounderCard(override);
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
    assertFounderCard(seen.spoken);
    assertFounderCard(seen.ideas[0].snapshot);
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
    assert.match(seen.spoken, /🤝 \*\*bravo\*\*/);
    assert.match(seen.spoken, /Other paths \(not the main bet\)/);
    assert.match(seen.spoken, /^\*\*alpha\*\*:/);
    assertFounderCard(seen.spoken);
  });
});

describe("spoken-card eval C snapshot bottleneck line", () => {
  it("same biggest-problem line on spoken and snapshot when constraint != premise", async () => {
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
    assertFounderCard(seen.spoken);
    assertFounderCard(seen.ideas[0].snapshot);
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
    assertFounderCard(seen.spoken);
    assertAlsoMovingMatch(seen.spoken, seen.ideas[0].snapshot);
  });

  it("boards lists names and what is stuck, without slug or gate", () => {
    const seen = applySpokenPayloadLead({
      ok: true,
      company: { slug: "alpha", label: "alpha" },
      ideas: [
        {
          slug: "bootstrap-os",
          name: "Bootstrap OS",
          clocks: { journeyPhase: 1, loopStage: 1, currentGate: "hold" },
          constraintThisWeek: "need a second person to finish signup",
          scoreboard: {
            schema_version: 1,
            constraint_this_week: "need a second person to finish signup",
          },
        },
        {
          slug: "intensive",
          name: "Intensive",
          killed: true,
          killedCard: "Killed — no paid deposits",
          clocks: { journeyPhase: 1, loopStage: 1, currentGate: "kill" },
          scoreboard: { schema_version: 1 },
        },
      ],
    });
    assert.equal(Object.keys(seen)[1], "spoken");
    assert.match(seen.boards, /Bootstrap OS\nWhat's stuck: need a second person to finish signup/);
    assert.doesNotMatch(seen.boards, /Intensive/);
    assert.doesNotMatch(seen.boards, /Stopped/);
    assert.ok(seen.ideas.some((idea) => idea.name === "Intensive" && idea.killed === true));
    assert.doesNotMatch(seen.boards, /bootstrap-os/);
    assert.doesNotMatch(seen.boards, /\bgate\b/i);
    assert.doesNotMatch(seen.boards, /\bhold\b/i);
  });

  it("a stopped-only read still says why it stopped", () => {
    const seen = applySpokenPayloadLead({
      ok: true,
      company: { slug: "alpha", label: "alpha" },
      ideas: [
        {
          slug: "intensive",
          name: "Intensive",
          killed: true,
          killedCard: "Killed — no paid deposits",
          clocks: { journeyPhase: 1, loopStage: 1, currentGate: "kill" },
          scoreboard: { schema_version: 1 },
        },
      ],
    });
    assert.match(seen.boards, /Stopped\nIntensive — no paid deposits/);
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
    assertFounderCard(seen.spoken);
    assertFounderCard(seen.ideas[0].snapshot);
  });
});

describe("spoken-card plain words", () => {
  it("introduces a bare name once, says what done looks like, and bans jargon", () => {
    const card = cardFromScoreboard({
      slug: "alpha",
      label: "alpha",
      journeyPhase: 1,
      gate: "hold",
      scoreboard: {
        initiatives: [
          ALPHA_CHECK,
          {
            ...ALPHA_ENG,
            id: "alpha-eng-charlie",
            premise: "charlie",
            last: "no reply",
            next: "founder@example.test calls",
          },
        ],
      },
    });
    const spoken = formatSpokenCard({ label: "alpha", card });
    assertFounderCard(spoken);
    assert.equal(spoken.split("charlie, a company we're talking with").length - 1, 1);
    assert.match(spoken, /· · 🏢 charlie, a company we're talking with/);
    assert.match(spoken, /founder@example\.test, the founder, calls/);
    assert.equal(spoken.split("the founder").length - 1, 1);
    assert.match(spoken, /The goal is one paid weekly report used in their shop/);
    assert.match(spoken, /^\| 🎯 /m);
    assert.equal(card.customerChecks[0].engagements[0].kind, "engagement");
  });

  it("glosses any email once and leaves founder shorthand as written", () => {
    const examples = ["GC/PM", "MLS", "foreign-entity filing", "Apollo", "tenancy", "award portal"];
    const card = cardFromScoreboard({
      slug: "alpha",
      label: "alpha",
      journeyPhase: 1,
      gate: "hold",
      scoreboard: {
        initiatives: [
          {
            ...ALPHA_CHECK,
            premise: "alpha sells dispatch help to plants",
            measure: "one plant paying",
            next: "charlie@example.test and founder@example.test call GC/PM about MLS and a foreign-entity filing",
          },
        ],
      },
    });
    const spoken = formatSpokenCard({ label: "alpha", card });
    assertFounderCard(spoken);
    assert.match(spoken, /charlie@example\.test, the founder,/);
    assert.match(spoken, /founder@example\.test, the founder,/);
    assert.equal(spoken.split("the founder").length - 1, 2);
    assert.match(spoken, /GC\/PM/);
    assert.match(spoken, /\bMLS\b/);
    assert.match(spoken, /foreign-entity/);
    assert.doesNotMatch(spoken, /the short name/);
    assert.match(spoken, /\| Work \| State \| When \| Who \|/);
    assert.match(spoken, /^\| 🎯 /m);
    const shipped = [
      fs.readFileSync(path.join(REPO_ROOT, "mcp/src/initiative-card.ts"), "utf8"),
      fs.readFileSync(path.join(REPO_ROOT, "templates/company/state/where-are-we.py"), "utf8"),
    ].join("\n");
    const bannedInShip = [
      "founder@example.test",
      "the short name",
      ...examples,
      "people running building projects",
      "a list of people to call",
      "a listing of jobs",
      "use on their product",
      "registering to do business",
      "the place that lists public jobs",
    ];
    for (const word of bannedInShip) {
      assert.equal(shipped.includes(word), false, word);
    }
  });

  it("leaves SMS and MCP on the spoken board and still hides desk jargon", async () => {
    const phrases = ["AI phone and SMS receptionist", "run local MCP"];
    const store = alphaStore({
      ...defaultScoreboard(),
      initiatives: [
        {
          ...ALPHA_CHECK,
          premise: phrases[0],
          measure: "one plant paying",
          last: phrases[1],
          next: `${phrases[1]} after the FAST and a SOPA`,
        },
      ],
    });
    const seen = await store.getJourney(bearer("founder@example.test"), { companySlug: "alpha" });
    assert.equal(seen.ok, true);
    for (const phrase of phrases) {
      assert.match(seen.spoken, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(seen.ideas[0].snapshot, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    assert.doesNotMatch(seen.spoken, /the short name/);
    assert.doesNotMatch(seen.ideas[0].snapshot, /the short name/);
    assert.match(seen.spoken, /advisor agreement/);
    assert.match(seen.spoken, /stock option paperwork/);
    assert.doesNotMatch(seen.spoken, /\bFAST\b|\bSOPA\b|\bP0\b/);
    assertNoClockDump(seen.spoken);
    assertNoClockDump(seen.ideas[0].snapshot);
    assertFounderCard(seen.spoken);
    assertFounderCard(seen.ideas[0].snapshot);
  });

  it("existing fixture spoken and snapshot text never contains the placeholder", () => {
    const dir = path.join(REPO_ROOT, "mcp/test/fixtures");
    const names = fs.readdirSync(dir).filter((name) => name.endsWith(".json"));
    assert.ok(names.length > 0);
    for (const name of names) {
      const fixture = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
      const scoreboard = fixture.scoreboard ?? fixture;
      const card = cardFromScoreboard({
        slug: "alpha",
        label: "alpha",
        journeyPhase: Number(fixture.journeyPhase) || 1,
        gate: fixture.currentGate || "hold",
        scoreboard,
      });
      const spoken = formatSpokenCard({
        label: "alpha",
        card,
        constraintThisWeek:
          typeof scoreboard.constraint_this_week === "string" ? scoreboard.constraint_this_week : undefined,
      });
      const snapshot = formatInitiativeCard(card).join("\n");
      assert.doesNotMatch(spoken, /the short name/, name);
      assert.doesNotMatch(snapshot, /the short name/, name);
      assertNoClockDump(spoken);
    }
  });
});

describe("spoken-card rejects the old shape", () => {
  it("fails the old headline, old columns, a missing Next line, a bad section, a missing target, and a banned word", () => {
    const good = [
      "**alpha**: alpha sells dispatch help to plants. The goal is one plant paying.",
      "",
      "| Work | State | When | Who |",
      "|---|---|---|---|",
      "| **Bet** | | | |",
      "| 🎯 🤝 **Get one plant to pay** | 🟢 No plant has paid yet | Talk this week | — |",
      "",
      "*🎯 the one thing that matters most · 🟢 working on it · 🟡 waiting · 🔴 dropped · ⚪ closed*",
      "**Next:** founder@example.test talks this week.",
    ].join("\n");
    assert.doesNotThrow(() => assertFounderCard(good));
    assert.throws(() => assertFounderCard(good.replace("**alpha**:", "**alpha's biggest problem right now:")));
    assert.throws(() =>
      assertFounderCard(good.replace("| Work | State | When | Who |", "| What we're working on | Where it stands | What happens next | Who |")),
    );
    assert.throws(() => assertFounderCard(good.replace(/\n\*\*Next:\*\*.*$/, "")));
    assert.throws(() => assertFounderCard(good.replace("| **Bet** |", "| **Main bet** |")));
    assert.throws(() => assertFounderCard(good.replace("🎯 ", "")));
    assert.throws(() => assertFounderCard(`${good}\nP0 still here`));
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
      /Eval is CI\. Title names what it sells and the goal\. One table\. Sections in order\. Target mark on the top bet\. Legend, then a Next line\. Background rows stay when supporting or footer rows exist\. Snapshot matches the spoken bottleneck line\. Killed cards are killed\./,
    );
    assert.match(os, /Work \| State \| When \| Who/);
    assert.doesNotMatch(os, /biggest problem right now/);
    assert.match(os, /\| 2\.8\.22 \|/);
    const ciSh = fs.readFileSync(path.join(REPO_ROOT, "scripts/ci.sh"), "utf8");
    assert.match(ciSh, /spoken-card-eval\.test\.mjs/);
  });
});

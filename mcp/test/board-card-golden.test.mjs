/**
 * Canonical board card. Fixtures are alpha / bravo / charlie only.
 * The markdown field is what a client prints. Do not rebuild it.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MemoryJourneyStore, defaultScoreboard } from "../dist/journey.js";
import {
  cardFromScoreboard,
  formatSpokenCard,
  normalizeInitiatives,
  redactConfidentiality,
} from "../dist/initiative-card.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN = path.join(HERE, "fixtures", "board-cards");

const BANNED = [
  /\bP0\b/,
  /\bFAST\b/,
  /\bSOPA\b/i,
  /\bSAFE\b/,
  new RegExp("\\b" + "GC" + "/" + "PM" + "\\b"),
  new RegExp("\\b" + "Apollo" + "\\b"),
  new RegExp("\\b" + "MLS" + "\\b"),
  /\bengagements?\b/i,
  /\bcustomer bets?\b/i,
  new RegExp("\\b" + "tenancy" + "\\b", "i"),
  /\bcustomer_check\b/,
  /\bNDAs?\b/i,
  /NDA is not Try/i,
  /\bjourney phase \d/i,
  /\bloop stage\b/i,
  /\bosVersion\b/,
  /\bwipLimit\b/,
  /\bmermaid\b/i,
  /\bAsk \/ Do\b/,
  /paper cannot promote/i,
  /\bdefault\b/,
];

function lintBoardCard(markdown) {
  const hits = [];
  const text = String(markdown ?? "");
  for (const rule of BANNED) {
    const hit = text.match(rule);
    if (hit) hits.push(hit[0]);
  }
  const rows = text
    .split("\n")
    .filter((line) => line.startsWith("|") && !line.startsWith("|---") && !line.startsWith("| Work |"));
  const data = rows.filter((line) => !/^\| \*\*/.test(line));
  const topGreens = data.filter((line) => {
    const cells = line.split("|").map((cell) => cell.trim());
    const work = cells[1] ?? "";
    const state = cells[2] ?? "";
    return state.startsWith("🟢") && !work.startsWith("·");
  });
  if (topGreens.length > 1) hits.push("second in-play row");
  const whoCells = data.map((line) => (line.split("|").map((cell) => cell.trim())[4] ?? ""));
  if (whoCells.length && whoCells.every((cell) => cell === "—")) hits.push("who column blank");
  return hits;
}

function row(partial) {
  return {
    measure: "someone pays or uses it",
    killLine: "stop if nobody pays",
    status: "active",
    last: "Not started",
    next: "Name the next step",
    outcome: "none",
    impact: "none",
    evidence: "stated",
    ...partial,
  };
}

const ALPHA = {
  label: "alpha",
  sells: "dispatch help for plant operators",
  constraint: "one operator at bravo plant pays for a weekly report",
  initiatives: [
    row({
      id: "alpha-check",
      kind: "customer_check",
      premise: "dispatch help for plant operators",
      measure: "one paid weekly report used in their shop",
      last: "Two shops looked, none has paid (Oct 1)",
      next: "Send the price list this week",
      clock: "2026-10-03",
    }),
    row({
      id: "alpha-eng",
      kind: "engagement",
      premise: "the NDA for bravo plant was sent",
      measure: "signed paper is not a try",
      killLine: "NDA is not Try",
      status: "waiting",
      last: "Asked Sep 30",
      next: "Wait for a paid week",
      parentId: "alpha-check",
    }),
    row({
      id: "alpha-other",
      kind: "customer_check",
      premise: "sell bottles in grocery stores",
      status: "waiting",
      last: "Parked until one shop pays",
      next: "Revisit in December",
    }),
    row({
      id: "alpha-past",
      kind: "customer_check",
      premise: "sell online direct to home buyers",
      status: "closed",
      outcome: "killed",
      last: "Shipping cost too high",
      killLine: "shipping cost too high",
      clock: "2026-09-01/2026-09-10",
      next: "—",
    }),
    row({
      id: "alpha-money",
      kind: "capital",
      premise: "investment from an angel",
      status: "waiting",
      last: "Not signed yet",
      next: "—",
    }),
  ],
};

const BRAVO = {
  label: "bravo",
  sells: "a weekly shop report for one cafe",
  constraint: "Corner Cafe has not paid",
  initiatives: [
    row({
      id: "bravo-check",
      kind: "customer_check",
      premise: "a weekly shop report for one cafe",
      measure: "one cafe pays for a month",
      last: "Menu tasted, no order yet",
      next: "Ask for the first order",
    }),
  ],
};

const CHARLIE = {
  label: "charlie",
  sells: "nothing is on sale yet",
  constraint: "no buyer has been named",
  initiatives: [
    row({
      id: "charlie-check",
      kind: "customer_check",
      premise: "nothing is on sale yet",
      status: "proposed",
      last: "No buyer named",
      next: "Name one buyer",
    }),
    row({
      id: "charlie-past",
      kind: "customer_check",
      premise: "a booth at the town fair",
      status: "closed",
      outcome: "learned",
      last: "The fair ended with no orders",
      killLine: "the fair ended with no orders",
      clock: "2026-08-01 — 2026-08-03",
      next: "—",
    }),
  ],
};

function withOwner(spec) {
  return new MemoryJourneyStore(
    [{ id: `co-${spec.label}`, slug: spec.label, label: spec.label }],
    [
      {
        companyId: `co-${spec.label}`,
        principal: "sam@example.test",
        principalKind: "email",
        role: "founder",
      },
    ],
    [
      {
        id: `idea-${spec.label}`,
        companyId: `co-${spec.label}`,
        slug: "default",
        name: spec.label,
        journeyPhase: 1,
        loopStage: 1,
        currentGate: "hold",
        scoreboard: {
          ...defaultScoreboard(),
          constraint_this_week: spec.constraint,
          initiatives: spec.initiatives,
        },
      },
    ],
    [],
    [],
  );
}

describe("canonical board card", () => {
  it("redacts NDA without garbling the sentence", () => {
    assert.equal(redactConfidentiality("the NDA was sent"), "the confidentiality promise was sent");
    assert.equal(redactConfidentiality("an NDA sits in the file"), "a confidentiality promise sits in the file");
    assert.equal(redactConfidentiality("bravo plant NDA"), "bravo plant confidentiality promise");
    assert.doesNotMatch(redactConfidentiality("the NDA was sent"), /the, a confidentiality/);
    assert.doesNotMatch(redactConfidentiality("signed the NDA today"), /\bNDA\b/);
  });

  it("a second in-play bet does not blank the card and stays a single top green", () => {
    const first = ALPHA.initiatives[0];
    const second = {
      ...first,
      id: "alpha-check-2",
      premise: "a second shop pays this month",
      clock: "2026-10-10",
    };
    const rejected = normalizeInitiatives([first, second]);
    assert.equal(rejected.ok, false);
    const card = cardFromScoreboard({
      slug: "alpha",
      label: "alpha",
      journeyPhase: 1,
      gate: "hold",
      scoreboard: { initiatives: [first, second] },
    });
    const spoken = formatSpokenCard({
      label: "alpha",
      card,
      who: ["sam"],
      constraintThisWeek: ALPHA.constraint,
    });
    assert.match(spoken, /🎯/);
    assert.match(spoken, /a second shop pays this month/);
    assert.deepEqual(lintBoardCard(spoken), []);
    const topGreens = spoken.split("\n").filter((line) => {
      if (!line.startsWith("|") || line.startsWith("| **") || line.startsWith("|---") || line.startsWith("| Work")) {
        return false;
      }
      const cells = line.split("|").map((cell) => cell.trim());
      return (cells[2] ?? "").startsWith("🟢") && !(cells[1] ?? "").startsWith("·");
    });
    assert.equal(topGreens.length, 1);
  });

  it("a founder_authorized board still names Who", async () => {
    const store = new MemoryJourneyStore(
      [{ id: "co-alpha", slug: "alpha", label: "alpha" }],
      [
        {
          companyId: "co-alpha",
          principal: "sam@example.test",
          principalKind: "email",
          role: "founder_authorized",
        },
        {
          companyId: "co-alpha",
          principal: "sub-only-alpha",
          principalKind: "sub",
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
          scoreboard: {
            ...defaultScoreboard(),
            constraint_this_week: BRAVO.constraint,
            initiatives: BRAVO.initiatives,
          },
        },
      ],
      [],
      [],
    );
    const seen = await store.getJourney(
      { authenticated: true, email: "sam@example.test", principal: "sam@example.test", identityStore: "memory" },
      { companySlug: "alpha" },
    );
    assert.equal(seen.ok, true);
    assert.match(seen.markdown, /\| sam \|/);
    assert.doesNotMatch(seen.markdown, /sub-only-alpha/);
    assert.doesNotMatch(seen.markdown, /\| — \|/);
  });

  for (const spec of [ALPHA, BRAVO, CHARLIE]) {
    it(`${spec.label} matches the golden card and keeps structured fields`, async () => {
      const seen = await withOwner(spec).getJourney(
        { authenticated: true, email: "sam@example.test", principal: "sam@example.test", identityStore: "memory" },
        { companySlug: spec.label },
      );
      assert.equal(seen.ok, true);
      assert.equal(seen.markdown, seen.spoken);
      assert.equal(seen.spokenLead, seen.markdown.split("\n")[0]);
      assert.match(seen.spokenLead, new RegExp(`^\\*\\*${spec.label}\\*\\*: `));
      assert.match(seen.spokenLead, /The goal is/);
      assert.match(seen.markdown, /\| Work \| State \| When \| Who \|/);
      assert.match(seen.markdown, /\| \*\*Bet\*\* \| \| \| \|/);
      assert.match(seen.markdown, /\| \*\*Past bets\*\* \| \| \| \|/);
      assert.match(seen.markdown, /\*🎯 the one thing that matters most/);
      assert.match(seen.markdown, /^\*\*Next:\*\* /m);
      assert.match(seen.markdown, /\| sam \|/);
      assert.equal(seen.card.company.slug, spec.label);
      assert.ok(seen.ideas[0].scoreboard.initiatives.length > 0);
      assert.deepEqual(lintBoardCard(seen.markdown), []);
      const golden = fs.readFileSync(path.join(GOLDEN, `${spec.label}.md`), "utf8");
      assert.equal(seen.markdown.trim() + "\n", golden.endsWith("\n") ? golden : golden + "\n");
    });
  }
});

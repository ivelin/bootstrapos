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
import { applyPlainWords, cardPersonName, PLAIN_WORD_REWRITES } from "../dist/board-plain-words.js";
import {
  applySpokenPayloadLead,
  buyerText,
  cardFromScoreboard,
  formatSpokenCard,
  founderCardBannedHit,
  founderLineName,
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
  buyer: "plant operators who already pay for dispatch help",
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
  pnl: {
    days: 30,
    revenue: 0,
    costs: 4,
    costsUnknown: true,
    asOf: "2026-10-02",
  },
};

const BRAVO = {
  label: "bravo",
  sells: "a weekly shop report for one cafe",
  buyer: "one cafe owner",
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
  buyer: "town fair visitors",
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
        displayName: "Sam",
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
          hypothesis: spec.buyer,
          buyer: spec.buyer,
          initiatives: spec.initiatives,
          ...(spec.pnl ? { pnl: spec.pnl } : {}),
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
    for (const raw of ["nda", "Nda", "NDA", "ndas", "Ndas", "NDAs"]) {
      assert.doesNotMatch(redactConfidentiality(`signed the ${raw} today`), /\bnda\b/i, raw);
    }
    assert.equal(redactConfidentiality("the ndas were filed"), "the confidentiality promises were filed");
    assert.equal(redactConfidentiality("plant NDAs"), "plant confidentiality promises");
    assert.equal(redactConfidentiality("an Ndas draft"), "a confidentiality promise draft");
  });

  it("redacts NDA in structured fields for the bravo fixture", () => {
    const seen = applySpokenPayloadLead({
      ok: true,
      company: { slug: "bravo", label: "bravo" },
      ideas: [
        {
          slug: "default",
          name: "bravo",
          constraintThisWeek: "the NDA is unsigned",
          scoreboard: {
            schema_version: 1,
            constraint_this_week: "the nda is unsigned",
            initiatives: [
              {
                ...BRAVO.initiatives[0],
                premise: "bravo plant NDA",
                last: "NDAs sent",
                killLine: "NDA is not Try",
              },
            ],
          },
        },
      ],
    });
    const structured = JSON.stringify({
      card: seen.card,
      ideas: seen.ideas,
      boards: seen.boards,
    });
    assert.equal(seen.markdown, seen.spoken);
    assert.doesNotMatch(seen.markdown, /\bnda\b/i);
    assert.doesNotMatch(structured, /\bnda\b/i);
    assert.match(structured, /bravo plant confidentiality promise/);
    assert.match(structured, /confidentiality promises sent/);
    assert.match(seen.ideas[0].scoreboard.initiatives[0].premise, /confidentiality promise/);
    assert.match(seen.card.bottleneck.premise, /confidentiality promise/);
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
    assert.equal(normalizeInitiatives(["nope"]).ok, false);
    assert.equal(normalizeInitiatives([{ journeyPhase: 1 }]).ok, false);
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
      who: ["Sam"],
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
          displayName: "Sam",
        },
        {
          companyId: "co-alpha",
          principal: "tester1@example.test",
          principalKind: "email",
          role: "founder",
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
    assert.match(seen.markdown, /\| Sam \|/);
    assert.match(seen.markdown, /^Founder: not named yet$/m);
    assert.doesNotMatch(seen.markdown, /^Founder: Sam$/m);
    assert.doesNotMatch(seen.markdown, /tester1/);
    assert.doesNotMatch(seen.markdown, /sub-only-alpha/);
    assert.doesNotMatch(seen.markdown, /\| sam \|/);
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
      assert.match(seen.spokenLead, /^\*\*The #1 bottleneck is .+\.\*\*$/);
      assert.match(seen.markdown, /^Founder: Sam$/m);
      assert.doesNotMatch(seen.markdown, /@/);
      assert.doesNotMatch(seen.spoken, /@/);
      assert.match(JSON.stringify(seen.owners), /sam@example\.test/);
      assert.match(seen.markdown, new RegExp(`${spec.label} sells to ${spec.buyer}`));
      const greens = seen.markdown.split("\n").filter((line) => line.startsWith("|") && line.includes("🟢"));
      assert.equal(greens.length, 1);
      assert.match(greens[0], /🎯/);
      if (spec.pnl) {
        const bg = seen.markdown.indexOf("| **Background** |");
        const moneyAt = seen.markdown.indexOf("\n| Money |");
        assert.ok(bg >= 0 && moneyAt > bg);
      } else {
        assert.doesNotMatch(seen.markdown, /\| Money \|/);
      }
      assert.doesNotMatch(seen.markdown, /The goal is/);
      assert.doesNotMatch(seen.markdown, /The problem is/);
      assert.doesNotMatch(seen.markdown, /Ask why it ended/);
      assert.doesNotMatch(seen.markdown, /Name who does the next step/);
      assert.match(seen.markdown, /\| Work \| State \| When \| Who \|/);
      assert.match(seen.markdown, /\| \*\*Bet\*\* \| \| \| \|/);
      if (spec.label !== "bravo") assert.match(seen.markdown, /\| \*\*Past bets\*\* \| \| \| \|/);
      else assert.doesNotMatch(seen.markdown, /Past bets/);
      assert.match(seen.markdown, /\*🎯 the one thing that matters most/);
      assert.match(seen.markdown, /^\*\*Next:\*\* /m);
      assert.match(seen.markdown, /\| Sam \|/);
      assert.equal(seen.card.company.slug, spec.label);
      assert.ok(seen.ideas[0].scoreboard.initiatives.length > 0);
      assert.deepEqual(lintBoardCard(seen.markdown), []);
      const golden = fs.readFileSync(path.join(GOLDEN, `${spec.label}.md`), "utf8");
      assert.equal(seen.markdown.trim() + "\n", golden.endsWith("\n") ? golden : golden + "\n");
    });
  }

  it("lifts the live bet when the default board is empty and files killed boards under past bets", () => {
    const seen = applySpokenPayloadLead({
      ok: true,
      company: { slug: "alpha", label: "alpha" },
      owners: [{ principal: "sam@example.test", role: "founder", displayName: "Sam" }],
      ideas: [
        { slug: "default", name: "default", scoreboard: { schema_version: 1, initiatives: [] } },
        {
          slug: "shop",
          name: "shop report",
          constraintThisWeek: "Corner Cafe has not paid",
          scoreboard: {
            schema_version: 1,
            hypothesis: BRAVO.buyer,
            buyer: BRAVO.buyer,
            initiatives: [BRAVO.initiatives[0]],
          },
        },
        {
          slug: "fair",
          name: "a booth at the town fair",
          killed: true,
          killPostmortem: { why: "the fair ended with no orders", lessonsLearned: "Do not invent a bet" },
          killedDecision: { who: "Sam", at: "2026-08-01/2026-08-03", why: "the fair ended with no orders" },
          scoreboard: { schema_version: 1 },
        },
        {
          slug: "scratch",
          name: "scratch",
          killed: true,
          killPostmortem: { why: "Do not invent a bet", lessonsLearned: "Do not invent a bet" },
          scoreboard: { schema_version: 1 },
        },
      ],
    });
    const golden = fs.readFileSync(path.join(GOLDEN, "alpha-multi.md"), "utf8");
    assert.equal(seen.markdown.trim() + "\n", golden.endsWith("\n") ? golden : golden + "\n");
    assert.doesNotMatch(seen.markdown, /Nothing on the board yet/);
    assert.doesNotMatch(seen.markdown, /Do not invent a bet/);
    assert.doesNotMatch(seen.markdown, /Ask why it ended/);
    assert.match(seen.spokenLead, /^\*\*The #1 bottleneck is .+\.\*\*$/);
    assert.match(seen.markdown, /2026-08-01 to 2026-08-03: the fair ended with no orders/);
  });

  it("puts a killed company's bet under past bets", () => {
    const seen = applySpokenPayloadLead({
      ok: true,
      company: { slug: "charlie", label: "charlie" },
      owners: [{ principal: "sam@example.test", role: "founder", displayName: "Sam" }],
      ideas: [
        {
          slug: "default",
          name: "charlie",
          killed: true,
          killedCard: "☠ Killed — the booth made no sales",
          killPostmortem: { why: "the booth made no sales", lessonsLearned: "buyers walked past" },
          scoreboard: {
            schema_version: 1,
            initiatives: [
              row({
                id: "charlie-killed",
                kind: "customer_check",
                premise: "a booth at the town fair",
                measure: "one sale",
                killLine: "stop if nobody pays",
                status: "active",
                last: "the booth made no sales",
                next: "—",
                clock: "2026-08-01/2026-08-03",
              }),
            ],
          },
        },
      ],
    });
    assert.match(seen.markdown, /\| \*\*Past bets\*\* \|/);
    assert.match(seen.markdown, /a booth at the town fair/);
    assert.match(seen.markdown, /2026-08-01 to 2026-08-03: the booth made no sales/);
    assert.match(seen.markdown, /🎯 🤝 \*\*Nothing is in play yet\*\*/);
    assert.match(seen.markdown, /⚪ Name the next bet/);
    assert.match(seen.markdown, /Leave this stopped/);
    const killedGreens = seen.markdown.split("\n").filter((line) => line.startsWith("|") && line.includes("🟢"));
    assert.equal(killedGreens.length, 0);
    assert.doesNotMatch(seen.markdown, /stop if nobody pays/);
    assert.doesNotMatch(seen.markdown, /The goal is/);
  });

  it("keeps a single green row and leaves sub-items and background yellow or closed", () => {
    const spoken = formatSpokenCard({
      label: "alpha",
      who: ["Sam"],
      card: cardFromScoreboard({
        slug: "alpha",
        label: "alpha",
        journeyPhase: 1,
        gate: "hold",
        scoreboard: {
          initiatives: [
            ALPHA.initiatives[0],
            {
              ...ALPHA.initiatives[1],
              status: "active",
              last: "Paper is in",
            },
            {
              ...ALPHA.initiatives[4],
              status: "active",
              last: "Term sheet drafted",
            },
          ],
        },
      }),
    });
    const greens = spoken.split("\n").filter((line) => line.startsWith("|") && line.includes("🟢"));
    assert.equal(greens.length, 1);
    assert.match(greens[0], /🎯/);
    assert.match(spoken, /\| · · 🏢 the confidentiality promise for bravo plant was sent \| 🟡 /);
    assert.match(spoken, /\| 💵 investment from an angel \| 🟡 /);
  });

  it("rewrites the banned word list in the markdown", () => {
    const spoken = formatSpokenCard({
      label: "alpha",
      who: ["Sam"],
      card: cardFromScoreboard({
        slug: "alpha",
        label: "alpha",
        journeyPhase: 1,
        gate: "hold",
        scoreboard: {
          initiatives: [
            row({
              id: "alpha-jargon",
              kind: "customer_check",
              premise: "Sam hosts a dinner for FI/Mo and sells one SKU under tenancy with FI",
              last: "sent an SMS about the MVP via Docusign",
              next: "Clear the gate in this Phase on the Host holdout with Cos. A host at the fence during this phase stays.",
            }),
          ],
        },
      }),
    });
    assert.equal(founderCardBannedHit(spoken), null);
    assert.match(spoken, /hosts a dinner/);
    assert.match(spoken, /FI\/Mo/);
    assert.match(spoken, /A host at the fence during this phase/);
    assert.doesNotMatch(spoken, /services a dinner/);
    assert.match(spoken, /product/);
    assert.match(spoken, /the paid plan/);
    assert.match(spoken, /the founder program/);
    assert.match(spoken, /a text message/);
    assert.match(spoken, /a first version/);
    assert.match(spoken, /the signature page/);
    assert.match(spoken, /decision/);
    assert.match(spoken, /stage/);
    assert.match(spoken, /service/);
    assert.match(spoken, /a group left out/);
    assert.match(spoken, /the helper/);
    assert.doesNotMatch(spoken, /\bSKU\b|\btenancy\b|\bSMS\b|\bMVP\b|\bCos\b|Docusign|\bthe gate\b|\bholdout\b/i);
    assert.doesNotMatch(spoken, /(?<![\w/])FI(?![\w/])|\bPhase\b|\bHost\b/);
  });

  it("shows a past date range and the reason it ended, and omits an empty past section", () => {
    const spoken = formatSpokenCard({
      label: "alpha",
      who: ["Sam"],
      card: cardFromScoreboard({
        slug: "alpha",
        label: "alpha",
        journeyPhase: 1,
        gate: "hold",
        scoreboard: {
          initiatives: [
            ALPHA.initiatives[0],
            row({
              id: "alpha-ended",
              kind: "customer_check",
              premise: "sell online direct to home buyers",
              status: "closed",
              outcome: "killed",
              last: "Shipping cost too high",
              killLine: "stop if nobody pays",
              clock: "2026-09-01/2026-09-10",
              next: "—",
            }),
            row({
              id: "alpha-note",
              kind: "customer_check",
              premise: "Do not invent a bet",
              status: "closed",
              outcome: "killed",
              last: "Do not invent a bet",
              killLine: "stop if nobody pays",
              next: "—",
            }),
          ],
        },
      }),
    });
    assert.match(spoken, /2026-09-01 to 2026-09-10: Shipping cost too high/);
    const undated = formatSpokenCard({
      label: "charlie",
      who: ["Sam"],
      card: cardFromScoreboard({
        slug: "charlie",
        label: "charlie",
        journeyPhase: 1,
        gate: "hold",
        scoreboard: {
          initiatives: [
            ALPHA.initiatives[0],
            row({
              id: "charlie-undated",
              kind: "customer_check",
              premise: "a booth with no written dates",
              status: "closed",
              outcome: "killed",
              last: "buyers walked past",
              next: "—",
            }),
          ],
        },
      }),
    });
    assert.match(undated, /start not recorded to end not recorded: buyers walked past/);
    assert.doesNotMatch(spoken, /stop if nobody pays/);
    assert.doesNotMatch(spoken, /Ask why it ended/);
    assert.doesNotMatch(spoken, /Do not invent a bet/);
    assert.doesNotMatch(spoken, /No past bets recorded/);
    const empty = formatSpokenCard({
      label: "bravo",
      who: ["Sam"],
      card: cardFromScoreboard({
        slug: "bravo",
        label: "bravo",
        journeyPhase: 1,
        gate: "hold",
        scoreboard: { initiatives: BRAVO.initiatives },
      }),
    });
    assert.doesNotMatch(empty, /Past bets/);
  });

  it("prints a founder line from the email local part when no name is stored", () => {
    const seen = applySpokenPayloadLead({
      ok: true,
      company: { slug: "bravo", label: "bravo" },
      owners: [{ principal: "founder@example.test", role: "founder" }],
      ideas: [
        {
          slug: "default",
          name: "bravo",
          scoreboard: { schema_version: 1, initiatives: [] },
        },
      ],
    });
    assert.match(seen.spoken, /^\*\*The #1 bottleneck is nothing is stuck yet\.\*\*$/m);
    assert.match(seen.markdown, /^Founder: founder$/m);
    assert.match(seen.markdown, /🎯 🤝 \*\*Nothing is in play yet\*\*/);
    assert.equal(seen.markdown.split("\n").filter((line) => line.startsWith("|") && line.includes("🟢")).length, 1);
    assert.match(seen.markdown, /\| founder \|/);
    assert.doesNotMatch(seen.markdown, /@/);
    assert.doesNotMatch(seen.spoken, /@/);
    assert.equal(seen.owners[0].principal, "founder@example.test");
  });

  it("names a person from a plain string, a login, or an email local part", () => {
    assert.equal(cardPersonName("Zoë Ångström"), "Zoë");
    assert.equal(cardPersonName("sam"), "sam");
    assert.equal(cardPersonName("tester1@example.test"), null);
    assert.equal(cardPersonName("a@b.test"), "a");
    assert.equal(cardPersonName({ display_name: "Ada Lovelace" }), "Ada");
    assert.equal(cardPersonName({ email: "ada@example.test" }), "ada");
    assert.equal(cardPersonName({ principal: "Ada Lovelace" }), "Ada");
    assert.equal(cardPersonName({ principal: "tester1" }), null);
    assert.equal(cardPersonName(1), null);
  });

  it("prints Founder: not named yet when who is empty, and keeps a short name", () => {
    const card = cardFromScoreboard({
      slug: "bravo",
      label: "bravo",
      journeyPhase: 1,
      gate: "hold",
      scoreboard: { initiatives: BRAVO.initiatives },
    });
    const empty = formatSpokenCard({ label: "bravo", who: [], card });
    assert.match(empty, /^Founder: not named yet$/m);
    assert.doesNotMatch(empty, /\| \*\*Background\*\* \|/);
    const login = formatSpokenCard({ label: "bravo", who: ["sam"], card });
    assert.match(login, /^Founder: sam$/m);
    assert.match(login, /\| sam \|/);
    const named = formatSpokenCard({ label: "bravo", who: ["Zoë Ångström"], card });
    assert.match(named, /^Founder: Zoë$/m);
    assert.match(named, /\| Zoë \|/);
  });

  it("prints display names, founder first, and never a login or the next-step placeholder", () => {
    const seen = applySpokenPayloadLead({
      ok: true,
      company: { slug: "alpha", label: "alpha" },
      owners: [
        { principal: "tester2@example.test", role: "founder", displayName: "tester2" },
        { principal: "ada@example.test", role: "founder_authorized", displayName: "Ada Lovelace" },
        { principal: "sam@example.test", role: "founder", displayName: "Sam" },
      ],
      acl: [
        { principal: "lee@example.test", role: "founder_authorized" },
        { principal: "Sam Rivera", role: "founder_authorized" },
        { principal: "sam@example.test", role: "founder", displayName: "Sam" },
      ],
      ideas: [
        {
          slug: "default",
          name: "alpha",
          scoreboard: {
            schema_version: 1,
            initiatives: [{ ...BRAVO.initiatives[0], next: "" }],
          },
        },
      ],
    });
    assert.match(seen.markdown, /^Founder: Sam$/m);
    assert.match(seen.markdown, /\| Sam, Ada, lee \|/);
    assert.doesNotMatch(seen.markdown, /@|tester2|Ada Lovelace|Sam Rivera|Name who does the next step/);
    assert.equal(seen.owners[1].principal, "ada@example.test");
    assert.equal(seen.acl[0].principal, "lee@example.test");
    assert.match(seen.markdown, /\*\*Next:\*\* Sam — No step is written down yet\./);
  });

  it("redacts confidentiality in markdown and in JSON fields such as audit why", () => {
    const seen = applySpokenPayloadLead({
      ok: true,
      company: { slug: "bravo", label: "bravo" },
      owners: [{ principal: "sam@example.test", role: "founder", displayName: "Sam" }],
      audit: [{ why: "signed the NDA", whatChanged: { founderWrittenDecision: "the NDA stays in the file" } }],
      ideas: [
        {
          slug: "default",
          name: "bravo",
          scoreboard: {
            schema_version: 1,
            constraint_this_week: "the NDA is unsigned",
            initiatives: [
              {
                ...BRAVO.initiatives[0],
                premise: "bravo plant NDA",
                last: "NDAs sent",
              },
            ],
            engagements: [{ account: "bravo", kind: "nda", state: "the NDA was sent" }],
          },
        },
      ],
    });
    assert.equal(seen.markdown, seen.spoken);
    assert.doesNotMatch(seen.markdown, /\bnda\b/i);
    assert.doesNotMatch(seen.audit[0].why, /\bnda\b/i);
    assert.doesNotMatch(seen.audit[0].whatChanged.founderWrittenDecision, /\bnda\b/i);
    assert.match(seen.audit[0].why, /confidentiality promise/);
    assert.equal(seen.ideas[0].scoreboard.engagements[0].kind, "nda");
    assert.match(seen.ideas[0].scoreboard.engagements[0].state, /confidentiality promise/);
  });

  it("drops unknown keys at every depth and rewrites SAFE in markdown and JSON", () => {
    const seen = applySpokenPayloadLead({
      ok: true,
      founder_email: "secret@example.test",
      company: { slug: "alpha", label: "alpha" },
      owners: [
        {
          principal: "SAFE holder sam@example.test",
          role: "founder",
          displayName: "Sam",
          email: "sam@example.test",
        },
      ],
      audit: [
        {
          why: "signed the NDA",
          who: "the NDA clerk",
          phone: "555-0100",
          secret: { api_key: "sk_live_secret" },
          whatChanged: { founderWrittenDecision: "close the SAFE" },
        },
      ],
      ideas: [
        {
          slug: "default",
          name: "alpha",
          founder_email: "hidden@example.test",
          scoreboard: {
            schema_version: 1,
            initiatives: [
              {
                ...BRAVO.initiatives[0],
                premise: "close the SAFE",
                internal_token: "tok_secret",
              },
            ],
          },
        },
      ],
    });
    const packed = JSON.stringify(seen);
    assert.equal(seen.founder_email, undefined);
    assert.equal(seen.ideas[0].founder_email, undefined);
    assert.equal(seen.audit[0].phone, undefined);
    assert.equal(seen.audit[0].secret, undefined);
    assert.equal(seen.ideas[0].scoreboard.initiatives[0].internal_token, undefined);
    assert.doesNotMatch(packed, /secret@example\.test|hidden@example\.test|555-0100|sk_live_secret|tok_secret|api_key/);
    assert.match(seen.markdown, /investment/);
    assert.doesNotMatch(seen.markdown, /\bSAFE\b/);
    assert.match(seen.ideas[0].scoreboard.initiatives[0].premise, /investment/);
    assert.doesNotMatch(seen.ideas[0].scoreboard.initiatives[0].premise, /\bSAFE\b/);
    assert.match(seen.audit[0].whatChanged.founderWrittenDecision, /investment/);
    assert.equal(seen.owners[0].principal, "investment holder sam@example.test");
    assert.equal(seen.owners[0].email, "sam@example.test");
    assert.match(seen.audit[0].who, /confidentiality promise/);
    assert.match(seen.spokenLead, /^\*\*The #1 bottleneck is nothing is stuck yet\.\*\*$/);
  });

  it("files a killed lead and a second check with a nested conversation under past bets", () => {
    const spoken = formatSpokenCard({
      label: "charlie",
      killed: true,
      who: ["Sam"],
      card: {
        company: { slug: "charlie", label: "charlie", bottleneckId: "lead" },
        killed: true,
        bottleneck: row({
          id: "lead",
          kind: "customer_check",
          premise: "a booth at the town fair",
          status: "closed",
          outcome: "killed",
          last: "the fair ended with no orders",
          next: "—",
        }),
        customerChecks: [
          {
            ...row({
              id: "second",
              kind: "customer_check",
              premise: "a second stall on the side street",
              status: "active",
              last: "nobody stopped",
              next: "—",
            }),
            engagements: [
              row({
                id: "nested",
                kind: "engagement",
                premise: "a conversation with the cafe owner",
                status: "waiting",
                last: "left a note",
                next: "—",
                parentId: "second",
              }),
            ],
          },
        ],
        footer: [],
      },
    });
    assert.match(spoken, /\| \*\*Bet\*\* \|/);
    assert.match(spoken, /🎯 🤝 \*\*Nothing is in play yet\*\*/);
    assert.match(spoken, /⚪ Name the next bet/);
    assert.equal(spoken.split("\n").filter((line) => line.startsWith("|") && line.includes("🟢")).length, 0);
    assert.doesNotMatch(spoken, /\| \*\*Other paths/);
    const past = spoken.split("**Past bets**")[1].split("**Background**")[0];
    assert.match(past, /a booth at the town fair/);
    assert.match(past, /a second stall on the side street/);
    assert.match(past, /· · .*a conversation with the cafe owner/);
  });

  it("reads stored start and end on a past bet", () => {
    const spoken = formatSpokenCard({
      label: "alpha",
      who: ["Sam"],
      card: cardFromScoreboard({
        slug: "alpha",
        label: "alpha",
        journeyPhase: 1,
        gate: "hold",
        scoreboard: {
          initiatives: [
            ALPHA.initiatives[0],
            row({
              id: "alpha-stored-dates",
              kind: "customer_check",
              premise: "a booth with stored dates",
              status: "closed",
              outcome: "killed",
              last: "buyers walked past",
              next: "—",
              start: "2026-04-01T15:00:00Z",
              end: "2026-06-15",
            }),
          ],
        },
      }),
    });
    assert.match(spoken, /2026-04-01 to 2026-06-15: buyers walked past/);
    assert.doesNotMatch(spoken, /a booth with stored dates[\s\S]*start not recorded to end not recorded/);
  });

  it("prints the company founder and otherwise says not named yet", () => {
    const named = applySpokenPayloadLead({
      ok: true,
      company: { slug: "alpha", label: "alpha", founder: "Nina Alvarez" },
      owners: [{ principal: "admin@example.test", role: "founder_authorized", displayName: "Ada Admin" }],
      ideas: [
        {
          slug: "default",
          name: "alpha",
          scoreboard: { schema_version: 1, initiatives: BRAVO.initiatives },
        },
      ],
    });
    assert.match(named.markdown, /^Founder: Nina$/m);
    assert.match(named.markdown, /\| Ada \|/);
    assert.doesNotMatch(named.markdown, /^Founder: Ada$/m);
    const adminOnly = applySpokenPayloadLead({
      ok: true,
      company: { slug: "bravo", label: "bravo" },
      owners: [{ principal: "admin@example.test", role: "founder_authorized", displayName: "Ada Admin" }],
      ideas: [
        {
          slug: "default",
          name: "bravo",
          scoreboard: { schema_version: 1, initiatives: BRAVO.initiatives },
        },
      ],
    });
    assert.match(adminOnly.markdown, /^Founder: not named yet$/m);
    assert.doesNotMatch(adminOnly.markdown, /^Founder: Ada$/m);
  });

  it("says buyer not named yet when the only stored text is the bet", () => {
    const betText = "Predictive notes copy a loop onto alpha without a login";
    const seen = applySpokenPayloadLead({
      ok: true,
      company: { slug: "alpha", label: "alpha" },
      owners: [{ principal: "sam@example.test", role: "founder", displayName: "Sam" }],
      ideas: [
        {
          slug: "default",
          name: "alpha",
          scoreboard: {
            schema_version: 1,
            hypothesis: betText,
            initiatives: [BRAVO.initiatives[0]],
          },
        },
      ],
    });
    assert.match(seen.markdown, /alpha sells to buyer not named yet\./);
    assert.doesNotMatch(seen.markdown, /Predictive notes/);
    const named = applySpokenPayloadLead({
      ok: true,
      company: { slug: "charlie", label: "charlie" },
      owners: [{ principal: "sam@example.test", role: "founder", displayName: "Sam" }],
      ideas: [
        {
          slug: "default",
          name: "charlie",
          scoreboard: {
            schema_version: 1,
            hypothesis: betText,
            buyer: "cafe owners",
            initiatives: [BRAVO.initiatives[0]],
          },
        },
      ],
    });
    assert.match(named.markdown, /charlie sells to cafe owners\./);
    assert.doesNotMatch(named.markdown, /Predictive notes/);
  });

  it("substitutes a whole term once and does not nest the replacement", () => {
    const once = applyPlainWords("paid tenancy on one product");
    assert.equal(once, "the paid plan on one product");
    assert.equal(applyPlainWords(once), once);
    assert.equal(
      applyPlainWords("plants pay for conversion/tenancy on one SKU"),
      "plants pay for conversion/the paid plan on one product",
    );
    assert.equal(applyPlainWords("conversion/tenancy"), "conversion/the paid plan");
    assert.notEqual(applyPlainWords("conversion/tenancy"), "conversion");
    assert.equal(
      applyPlainWords("see `SAFE` at https://x.test/SAFE?q=NDA"),
      "see `SAFE` at https://x.test/SAFE?q=NDA",
    );
    assert.equal(
      applyPlainWords("see ```SAFE``` at https://x.test/SAFE?q=NDA"),
      "see ```SAFE``` at https://x.test/SAFE?q=NDA",
    );
    assert.doesNotMatch(applyPlainWords("paid tenancy"), /paid the paid plan/);
    assert.equal(applyPlainWords("payment default risk"), "payment default risk");
    assert.equal(applyPlainWords("on default plan"), "on default plan");
    assert.equal(
      applyPlainWords("A comment on default is not a row."),
      "A comment on default is not a row.",
    );
    assert.equal(applyPlainWords("default"), "");
    assert.equal(applyPlainWords("Filed on default!"), "Filed!");
    for (const [, gloss] of PLAIN_WORD_REWRITES) {
      if (gloss.includes("$")) continue;
      assert.equal(applyPlainWords(gloss), gloss);
      assert.equal(applyPlainWords(applyPlainWords(gloss)), gloss);
    }
  });

  it("does not print the internal label default", () => {
    const spoken = formatSpokenCard({
      label: "alpha",
      who: ["Sam"],
      card: cardFromScoreboard({
        slug: "alpha",
        label: "alpha",
        journeyPhase: 1,
        gate: "hold",
        scoreboard: {
          initiatives: [
            ALPHA.initiatives[0],
            row({
              id: "alpha-internal",
              kind: "customer_check",
              premise: "a parked try",
              status: "closed",
              outcome: "killed",
              last: "A comment on default.",
              next: "—",
            }),
          ],
        },
      }),
    });
    assert.match(spoken, /A comment\./);
    assert.doesNotMatch(spoken, /\bdefault\b/);
  });

  it("renders a money row for a non-numeric pnl and prefixes the next line", () => {
    const card = cardFromScoreboard({
      slug: "alpha",
      label: "alpha",
      journeyPhase: 1,
      gate: "hold",
      scoreboard: {
        initiatives: [
          row({
            id: "alpha-check",
            kind: "customer_check",
            premise: "a weekly shop report for one cafe",
            last: "Menu tasted",
            next: "Sam sends the price list",
          }),
        ],
      },
    });
    const spoken = formatSpokenCard({
      label: "alpha",
      who: ["Sam"],
      pnl: { asOf: "2026-10-19T07:11:45-05:00", revenue: {}, costs: [{ line: "hosting" }] },
      card,
    });
    assert.match(spoken, /\| \*\*Background\*\* \|/);
    assert.match(spoken, /\| Money \|/);
    assert.match(spoken, /last 30 days: revenue not recorded; measured costs unknown \(Oct 19\)/);
    assert.match(spoken, /\*\*Next:\*\* Sam — Sam sends the price list\./);
  });

  it("renders money stored on another idea when the lead bet has none", () => {
    const seen = applySpokenPayloadLead({
      ok: true,
      company: { slug: "alpha", label: "alpha", founder: "Sam" },
      owners: [{ principal: "sam@example.test", role: "founder", displayName: "Sam" }],
      ideas: [
        {
          slug: "default",
          name: "alpha",
          scoreboard: {
            schema_version: 1,
            initiatives: [],
            pnl: { asOf: "2026-10-02", revenue: {}, costs: [{ line: "hosting" }] },
          },
        },
        {
          slug: "shop",
          name: "shop report",
          scoreboard: {
            schema_version: 1,
            buyer: "one cafe owner",
            initiatives: [BRAVO.initiatives[0]],
          },
        },
      ],
    });
    assert.match(seen.markdown, /\| Money \|/);
    assert.match(seen.markdown, /revenue not recorded/);
    assert.match(seen.markdown, /shop report|a weekly shop report/);
  });

  it("filters a banned term unless it sits inside an https url", () => {
    assert.equal(founderCardBannedHit("sign the SAFE.now/please"), "SAFE");
    assert.equal(founderCardBannedHit("www.SAFE"), "SAFE");
    assert.equal(founderCardBannedHit("FAST.track/now"), "FAST");
    assert.equal(founderCardBannedHit("the P0.fix/it now"), "P0");
    assert.equal(founderCardBannedHit("engagement.team/now"), "engagement");
    assert.equal(founderCardBannedHit("advisor agreement offered 7 May (fi.co/FAST)"), "FAST");
    assert.equal(founderCardBannedHit("[sign the SAFE](https://x.test/ok)"), "SAFE");
    assert.equal(founderCardBannedHit("send the FAST draft"), "FAST");
    assert.equal(founderCardBannedHit("advisor agreement offered 7 May (https://fi.co/fast)"), null);
    assert.equal(founderCardBannedHit("see https://x.test/SAFE?q=NDA"), null);
    const spoken = formatSpokenCard({
      label: "alpha",
      who: ["Sam"],
      card: cardFromScoreboard({
        slug: "alpha",
        label: "alpha",
        journeyPhase: 1,
        gate: "hold",
        scoreboard: {
          initiatives: [
            row({
              id: "alpha-link",
              kind: "customer_check",
              premise: "a weekly shop report",
              last: "agreement offered 7 May (fi.co/FAST) and see `SAFE` at https://x.test/SAFE?q=NDA",
              next: "Send the note",
            }),
          ],
        },
      }),
    });
    assert.match(spoken, /fi\.co\/advisor agreement/);
    assert.doesNotMatch(spoken, /fi\.co\/FAST/);
    assert.match(spoken, /`SAFE`/);
    assert.match(spoken, /https:\/\/x\.test\/SAFE\?q=NDA/);
    assert.doesNotMatch(spoken, /confidentiality/);
    assert.doesNotMatch(spoken, /investment/);
    const seen = applySpokenPayloadLead({
      ok: true,
      company: { slug: "alpha", label: "alpha", founder: "Sam" },
      owners: [{ principal: "sam@example.test", role: "founder", displayName: "Sam" }],
      ideas: [
        {
          slug: "shop",
          name: "shop report",
          scoreboard: {
            schema_version: 1,
            buyer: "one cafe owner",
            initiatives: [
              row({
                id: "alpha-link",
                kind: "customer_check",
                premise: "a weekly shop report",
                last: "see `SAFE` at https://x.test/SAFE?q=NDA",
                next: "Send the note",
              }),
            ],
          },
        },
      ],
    });
    assert.match(seen.ideas[0].scoreboard.initiatives[0].last, /`SAFE`/);
    assert.match(seen.ideas[0].scoreboard.initiatives[0].last, /https:\/\/x\.test\/SAFE\?q=NDA/);
    assert.doesNotMatch(seen.ideas[0].scoreboard.initiatives[0].last, /confidentiality/);
    assert.doesNotMatch(seen.markdown, /confidentiality/);
  });

  it("keeps a stored span, a named buyer, and a money row on the odd paths", () => {
    const stored = normalizeInitiatives([
      row({ id: "alpha-blank", kind: "customer_check", premise: "blank dates", start: 1, end: "" }),
      row({
        id: "alpha-dash",
        kind: "customer_check",
        premise: "dash dates",
        status: "closed",
        start: "—",
        end: "-",
      }),
      row({
        id: "alpha-text",
        kind: "customer_check",
        premise: "text dates",
        status: "closed",
        start: "spring",
        end: "x".repeat(80),
      }),
    ]);
    assert.equal(stored.ok, true);
    assert.equal(stored.value[0].start, undefined);
    assert.equal(stored.value[1].end, undefined);
    assert.equal(stored.value[2].start, "spring");
    assert.equal(stored.value[2].end.length, 64);

    const card = cardFromScoreboard({
      slug: "alpha",
      label: "alpha",
      journeyPhase: 1,
      gate: "hold",
      scoreboard: {
        initiatives: [
          row({
            id: "alpha-open",
            kind: "customer_check",
            premise: "a weekly shop report",
            next: "Sam — Ask for the order",
          }),
          row({
            id: "alpha-start",
            kind: "customer_check",
            premise: "a start with no end",
            status: "closed",
            outcome: "killed",
            last: "—",
            killLine: "stop if nobody pays",
            start: "2026-05-01",
          }),
          row({
            id: "alpha-end",
            kind: "customer_check",
            premise: "an end with no start",
            status: "closed",
            outcome: "learned",
            last: "the fair ended",
            end: "2026-07-01",
          }),
          row({
            id: "alpha-words",
            kind: "customer_check",
            premise: "a written span",
            status: "closed",
            outcome: "learned",
            last: "buyers walked past",
            start: "spring",
          }),
        ],
      },
    });
    const spoken = formatSpokenCard({
      label: "alpha",
      who: ["Sam"],
      buyer: "alpha sells widgets",
      card,
      pnl: { days: 0, revenue: 12.5, costs: 3, costsUnknown: false, asOf: "not-a-date" },
    });
    assert.match(spoken, /alpha sells widgets\./);
    assert.match(spoken, /2026-05-01 to end not recorded: reason not recorded/);
    assert.match(spoken, /start not recorded to 2026-07-01: the fair ended/);
    assert.match(spoken, /spring to end not recorded: buyers walked past/);
    assert.match(spoken, /last 30 days: \$12\.50 revenue; about \$3 measured costs \(not-a-date\)/);
    assert.match(spoken, /\*\*Next:\*\* Sam — Ask for the order\./);
    assert.doesNotMatch(spoken, /Sam — Sam —/);

    const costsOnly = formatSpokenCard({
      label: "alpha",
      who: ["Sam"],
      card,
      pnl: { costs: 8 },
    });
    assert.match(costsOnly, /last 30 days: \$0 revenue; about \$8 measured costs/);
    assert.doesNotMatch(costsOnly, /some unknown|revenue not recorded/);
    const missingCosts = formatSpokenCard({
      label: "alpha",
      who: ["Sam"],
      card,
      pnl: { revenue: {}, costs: null, asOf: "2026-13-01" },
    });
    assert.match(missingCosts, /\$0 revenue; measured costs unknown \(2026-13-01\)/);
    const quiet = formatSpokenCard({
      label: "alpha",
      who: ["Sam"],
      card,
      pnl: { revenue: Number.NaN, costs: Number.NaN },
    });
    assert.doesNotMatch(quiet, /\| Money \|/);
    const listed = formatSpokenCard({ label: "alpha", who: ["Sam"], card, pnl: [] });
    assert.doesNotMatch(listed, /\| Money \|/);

    assert.equal(buyerText({ buyer: "none yet" }), "");
    assert.equal(buyerText({ buyer: "a weekly shop report" }, card), "");
    assert.equal(buyerText({ buyer: "same bet", constraint_this_week: "same bet" }), "");
    assert.equal(
      buyerText({ constraintThisWeek: "cafe owners", scoreboard: { buyer: "cafe owners" } }, card),
      "",
    );
    assert.equal(buyerText(null), "");
    assert.equal(founderLineName({ company: "alpha", idea: { founder: "Nina Alvarez" } }), "Nina");
    assert.equal(
      founderLineName({ idea: { scoreboard: { founder: "Lee Chen" } } }),
      "Lee",
    );
    assert.equal(
      founderLineName({
        owners: [{ role: "founder_authorized", displayName: "Ada Admin" }],
        acl: [{ role: "founder", displayName: "Jo Park" }],
      }),
      "Jo",
    );
    assert.equal(founderLineName({ owners: "nope", acl: null }), "");

    const ownMoney = applySpokenPayloadLead({
      ok: true,
      company: { slug: "alpha", label: "alpha" },
      owners: [{ principal: "sam@example.test", role: "founder", displayName: "Sam" }],
      ideas: [
        {
          slug: "shop",
          name: "shop report",
          founder: "Nina Alvarez",
          scoreboard: {
            schema_version: 1,
            buyer: "one cafe owner",
            initiatives: [BRAVO.initiatives[0]],
            pnl: { days: 14, revenue: 5, costs: 1, asOf: "2026-10-02" },
          },
        },
        {
          slug: "default",
          name: "alpha",
          scoreboard: {
            schema_version: 1,
            initiatives: [],
            pnl: { asOf: "2026-10-19", revenue: {}, costs: [{ line: "hosting" }] },
          },
        },
      ],
    });
    assert.match(ownMoney.markdown, /^Founder: Nina$/m);
    assert.match(ownMoney.markdown, /last 14 days: \$5 revenue; about \$1 measured costs \(Oct 2\)/);
    assert.doesNotMatch(ownMoney.markdown, /revenue not recorded/);

    assert.equal(applyPlainWords("P0"), "");
    assert.equal(applyPlainWords("pre-tenancy"), "pre-the paid plan");
    assert.equal(applyPlainWords("file.SKU"), "file.product");
    assert.equal(applyPlainWords("/tenancy left"), "/the paid plan left");
  });

  it("masks an email stored on the founder key", () => {
    const seen = applySpokenPayloadLead({
      ok: true,
      company: { slug: "alpha", label: "alpha", founder: "nina@example.test" },
      owners: [{ principal: "ada@example.test", role: "founder_authorized", displayName: "Ada Admin" }],
      ideas: [
        {
          slug: "shop",
          name: "shop report",
          founder: "lee@example.test",
          scoreboard: {
            schema_version: 1,
            buyer: "one cafe owner",
            initiatives: [BRAVO.initiatives[0]],
          },
        },
      ],
    });
    assert.equal(seen.company.founder, "nina");
    assert.equal(seen.ideas[0].founder, "lee");
    assert.doesNotMatch(String(seen.company.founder), /@/);
    assert.doesNotMatch(String(seen.ideas[0].founder), /@/);
    assert.match(seen.markdown, /^Founder: nina$/m);
    assert.doesNotMatch(seen.markdown, /@example\.test/);
  });

  it("documents a signed-in user with no invite as 200 no_membership", () => {
    const doc = fs.readFileSync(path.join(HERE, "../docs/HOSTED_IDENTITY.md"), "utf8");
    assert.match(doc, /signed-in with no invite → 200 `no_membership`/);
    assert.doesNotMatch(doc, /uninvited → `not_invited`/);
  });
});

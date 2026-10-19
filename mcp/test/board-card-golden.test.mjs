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
  applySpokenPayloadLead,
  cardFromScoreboard,
  formatSpokenCard,
  founderCardBannedHit,
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
    assert.match(seen.markdown, /^Founder: Sam$/m);
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
      assert.equal(seen.spokenLead, `**${spec.label}**`);
      assert.match(seen.markdown, /^Founder: Sam$/m);
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
    assert.equal(seen.spokenLead, "**alpha**");
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
    assert.match(seen.markdown, /2026-08-01\/2026-08-03: the booth made no sales/);
    assert.doesNotMatch(seen.markdown, /Nothing on the board yet/);
    assert.doesNotMatch(seen.markdown, /Not started/);
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
              premise: "Sell one SKU under tenancy after the 83(b) with FI and fi.co/fast",
              last: "SOSV and IABC sent an SMS about the MVP via Docusign",
              next: "Clear the gate in this Phase on the Host holdout with Cos",
            }),
          ],
        },
      }),
    });
    assert.equal(founderCardBannedHit(spoken), null);
    assert.match(spoken, /product/);
    assert.match(spoken, /the paid plan/);
    assert.match(spoken, /the tax filing/);
    assert.match(spoken, /the founder program/);
    assert.match(spoken, /advisor agreement/);
    assert.match(spoken, /an investor/);
    assert.match(spoken, /a trade group/);
    assert.match(spoken, /a text message/);
    assert.match(spoken, /a first version/);
    assert.match(spoken, /the signature page/);
    assert.match(spoken, /decision/);
    assert.match(spoken, /stage/);
    assert.match(spoken, /service/);
    assert.match(spoken, /a group left out/);
    assert.match(spoken, /the helper/);
    assert.doesNotMatch(spoken, /\bSKU\b|\btenancy\b|\bSMS\b|\bMVP\b|\bCos\b|Docusign|83\(b\)|\bFI\b|fi\.co\/fast|\bSOSV\b|\bIABC\b|\bgate\b|\bPhase\b|\bHost\b|\bholdout\b/i);
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
    assert.match(spoken, /2026-09-01\/2026-09-10: Shipping cost too high/);
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
    assert.match(seen.markdown, /\| Sam, Ada Lovelace, Sam Rivera \|/);
    assert.doesNotMatch(seen.markdown, /tester2|lee@example|\\blee\\b|Name who does the next step/);
    assert.match(seen.markdown, /\*\*Next:\*\* Sam — No step is written down yet\./);
  });

  it("redacts confidentiality in markdown and in JSON fields such as audit why", () => {
    const seen = applySpokenPayloadLead({
      ok: true,
      company: { slug: "bravo", label: "bravo" },
      owners: [{ principal: "sam@example.test", role: "founder", displayName: "Sam" }],
      audit: [{ why: "signed the NDA", whatChanged: { aside: "the NDA stays in the file" } }],
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
    assert.doesNotMatch(seen.audit[0].whatChanged.aside, /\bnda\b/i);
    assert.match(seen.audit[0].why, /confidentiality promise/);
    assert.equal(seen.ideas[0].scoreboard.engagements[0].kind, "nda");
    assert.match(seen.ideas[0].scoreboard.engagements[0].state, /confidentiality promise/);
  });

  it("documents a signed-in user with no invite as 200 no_membership", () => {
    const doc = fs.readFileSync(path.join(HERE, "../docs/HOSTED_IDENTITY.md"), "utf8");
    assert.match(doc, /signed-in with no invite → 200 `no_membership`/);
    assert.doesNotMatch(doc, /uninvited → `not_invited`/);
  });
});

/**
 * Every banned term stays visible through URL, slash, hyphen, punctuation, and case.
 * A dotted https URL stays held. fi.co and www.fi.co are the only bare hosts whose
 * path, query, and fragment are removed before the scan.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BANNED_ON_CARD, bannedCardHit } from "../dist/board-plain-words.js";

const EXEMPLARS = [
  "P0",
  "FAST",
  "SOPA",
  "SAFE",
  "engagement",
  "customer bet",
  "customer_check",
  "NDA",
  "journey phase 3",
  "loop stage",
  "wipLimit",
  "mermaid",
  "SKU",
  "tenancy",
  "FI",
  "SMS",
  "MVP",
  "docusign",
  "the gate",
  "journey phases",
  "Phase",
  "Host",
  "holdout",
  "Cos",
  "Bottleneck #1",
];

function ruleHits(rule, text) {
  const flags = rule.flags.includes("g") ? rule.flags : `${rule.flags}g`;
  return new RegExp(rule.source, flags).test(text);
}

function wrappers(term, rule) {
  const rows = [
    `http://${term}.example/x`,
    `http://x.test/${term}`,
    `http://x.test/x?q=${term}`,
    `http://x.test/x#${term}`,
    `/${term}`,
    `${term}/`,
    `a/${term}`,
    `${term}/b`,
    `pre-${term}`,
    `${term}-next`,
    `(${term})`,
    `${term}.`,
  ];
  if (rule.flags.includes("i")) {
    const lower = term.toLowerCase();
    const upper = term.toUpperCase();
    if (lower !== term) rows.push(lower, `/${lower}`);
    if (upper !== term) rows.push(upper, `http://x.test/${upper}`);
  }
  return rows;
}

describe("banned term variants", () => {
  it("catches every banned term in url, slash, hyphen, punctuation, and case wrappers", () => {
    assert.equal(EXEMPLARS.length, BANNED_ON_CARD.length);
    const missed = [];
    let checked = 0;
    EXEMPLARS.forEach((term, index) => {
      const rule = BANNED_ON_CARD[index];
      assert.equal(ruleHits(rule, term), true, term);
      for (const text of [term, ...wrappers(term, rule)]) {
        if (!ruleHits(rule, text)) continue;
        checked += 1;
        if (!bannedCardHit(text)) missed.push(text);
      }
    });
    assert.ok(checked > EXEMPLARS.length, `variant count ${checked}`);
    assert.deepEqual(missed, []);
    console.log(`banned-card variants checked ${checked}`);
  });
});

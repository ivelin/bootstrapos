/**
 * Named visitor matrix for the 0-1 journey PR (CoS smell-test).
 * File lock + what a cold agent would say. No human Ivelin session claimed.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  emptyContextMayInventStage,
  spokenYesIsGtm,
  spokenYesMayPromote,
} from "../dist/house-rules.js";
import {
  agentMayRubberStampConstraint,
  commentsMayMutateGate,
  digestMayAdvanceGate,
  digestMayInventStage,
  preferenceMayNameConstraint,
  preferWebhookOverPoll,
  portfolioScoreMayPromote,
  scoreboardMayCarryOwner,
} from "../dist/journey.js";
import { HOSTED_GATED_JOURNEY_TOOL_NAMES } from "../dist/constants.js";
import { REPO_ROOT } from "./helpers.mjs";

const PLUGIN = path.join(REPO_ROOT, "plugin");
const HOSTED = "https://mcp.bootstrap.pirin.ai/mcp";
const PUBLIC_SURFACES = [
  path.join(REPO_ROOT, "README.md"),
  path.join(REPO_ROOT, "company-os", "first-hour.md"),
  path.join(PLUGIN, "README.md"),
  path.join(PLUGIN, "COVERAGE.md"),
  path.join(PLUGIN, "skills", "when-to-write", "SKILL.md"),
  path.join(PLUGIN, "skills", "first-hour", "SKILL.md"),
  path.join(PLUGIN, "skills", "query-os-first", "SKILL.md"),
];

function skill(name) {
  return fs.readFileSync(path.join(PLUGIN, "skills", name, "SKILL.md"), "utf8");
}

describe("0-1 journey visitor matrix (CoS smell-test)", () => {
  it("names the seven cases; plugin stays judge-only; no tool/SQL menu", () => {
    const write = skill("when-to-write");
    const coverage = fs.readFileSync(path.join(PLUGIN, "COVERAGE.md"), "utf8");
    const readme = fs.readFileSync(path.join(PLUGIN, "README.md"), "utf8");
    for (const body of [coverage, readme]) {
      assert.match(body, /Installing founder/);
      assert.match(body, /0-1/);
      assert.match(body, /GTM/);
      assert.match(body, /install-first/i);
      assert.match(body, /do not invent their stage/i);
      assert.match(body, /spoken yes/i);
    }
    assert.match(write, /founder yes/);
    assert.match(write, /Not a form/);
    assert.match(write, /Comments never mutate/);
    assert.match(write, /judge-only/);
    assert.match(write, /do not invent their stage/);
    assert.match(write, /Spoken yes cannot promote/);
    assert.doesNotMatch(write, /get_journey|put_journey|post_comment|subscribe_board|unsubscribe_board|list_subscribers|enable_board_watch|list_provenance|put_portfolio_score/);
    assert.doesNotMatch(write, /bootstrap_os\.|SELECT |PGlite/);
    assert.ok(write.length < 2000);
    assert.ok(write.includes(HOSTED));
  });

  it("H1 + A1 install-first still public OS / no login on the production pin", () => {
    const first = skill("first-hour");
    assert.match(first, /No auth/);
    assert.match(first, /No database/);
    assert.ok(first.includes(HOSTED));
    const write = skill("when-to-write");
    assert.match(write, /Gated journey write is not that pin/);
    assert.match(write, /HOSTED_IDENTITY\.md/);
    assert.match(write, /from the ACL/);
    assert.match(write, /notify over polling/);
    assert.match(write, /do not invent stage or Advance/i);
  });

  it("H2 + A2 mentee CoS on 0-1: query OS first; company vs idea", () => {
    const standing = skill("query-os-first");
    const write = skill("when-to-write");
    assert.match(standing, /the-5-journey-rungs-simple-view/);
    assert.match(write, /Company and idea are separate/);
    assert.match(write, /One board per idea/);
    assert.match(write, /honest biggest bottleneck/);
    assert.match(write, /house-rule-do-not-automate-a-step-that-should-not-exist/);
    assert.doesNotMatch(write, /weakest link|slowest soldier/);
    assert.doesNotMatch(write, /Goldratt|Eliyahu|Drucker|Grove|Heraclitus/i);
    assert.match(write, /Not a fun side quest/);
    assert.match(write, /Preference/);
    assert.match(write, /new landing page/);
    assert.match(write, /written override/);
    assert.match(write, /do not rubber-stamp/i);
    assert.equal(preferenceMayNameConstraint(), false);
    assert.equal(agentMayRubberStampConstraint(), false);
  });

  it("H3 + A4 specialist GTM-or-not / spoken-yes refuse", () => {
    const standing = skill("query-os-first");
    assert.match(standing, /is not GTM/);
    assert.equal(spokenYesMayPromote(), false);
    assert.equal(spokenYesIsGtm(), false);
  });

  it("A3 empty-context cold agent would not invent their stage", () => {
    const standing = skill("query-os-first");
    const write = skill("when-to-write");
    assert.match(standing, /unknown \/ none yet/);
    assert.match(write, /unknown \/ none yet/);
    assert.equal(emptyContextMayInventStage(), false);
    assert.equal(commentsMayMutateGate(), false);
    assert.equal(digestMayInventStage(), false);
    assert.equal(digestMayAdvanceGate(), false);
    assert.equal(scoreboardMayCarryOwner(), false);
    assert.equal(portfolioScoreMayPromote(), false);
    assert.equal(preferWebhookOverPoll(), true);
    assert.equal(preferenceMayNameConstraint(), false);
    assert.equal(agentMayRubberStampConstraint(), false);
  });

  it("A5 cold agent refuses “new landing page” as the weekly constraint", () => {
    const write = skill("when-to-write");
    const coverage = fs.readFileSync(path.join(PLUGIN, "COVERAGE.md"), "utf8");
    const readme = fs.readFileSync(path.join(PLUGIN, "README.md"), "utf8");
    for (const body of [write, coverage, readme]) {
      assert.match(body, /new landing page/i);
      assert.match(body, /override/i);
    }
    assert.match(write, /no one has talked to customers/);
    assert.match(coverage, /mayWriteConstraintThisWeek/);
    assert.doesNotMatch(write, /get_journey|put_journey|post_comment|subscribe_board|unsubscribe_board|list_subscribers|enable_board_watch|list_provenance|put_portfolio_score/);
  });

  it("no FAST mentee names or emails in public markdown; no Ivelin session claimed", () => {
    for (const file of PUBLIC_SURFACES) {
      const body = fs.readFileSync(file, "utf8");
      assert.doesNotMatch(body, /@example\.test/);
      assert.doesNotMatch(body, /founder-dye|founder-core|advisor-cos/);
      assert.doesNotMatch(body, /DyeConverter|CoreHaul/);
      assert.doesNotMatch(body, /I ran a human Ivelin session/i);
      assert.doesNotMatch(body, /Grok Bot template|Bootstrap OS Bot Client/i);
    }
    const coverage = fs.readFileSync(path.join(PLUGIN, "COVERAGE.md"), "utf8");
    assert.match(coverage, /No human Ivelin session claimed/);
    assert.deepEqual([...HOSTED_GATED_JOURNEY_TOOL_NAMES], [
      "get_journey",
      "bootstrap_where_are_we",
      "create_idea",
      "put_journey",
      "post_comment",
      "subscribe_board",
      "unsubscribe_board",
      "list_subscribers",
      "enable_board_watch",
      "list_provenance",
      "put_portfolio_score",
    ]);
    const journeyDoc = fs.readFileSync(path.join(REPO_ROOT, "mcp", "docs", "JOURNEY.md"), "utf8");
    assert.match(journeyDoc, /Hard rule — invite-only company boards/);
    assert.match(journeyDoc, /cross-tenant-leak\.test\.mjs/);
    assert.match(journeyDoc, /never another company's rows/i);
    assert.match(journeyDoc, /bootstrap_os_held_label|bootstrap_company_labels/);
  });
});

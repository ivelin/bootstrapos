/**
 * Merge-gate visitor matrix (CoS smell-test).
 * Seven cases the package must support. File locks only.
 * File locks only. PR CI does not live-probe the production pin.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  emptyContextMayInventStage,
  spokenYesIsGtm,
  spokenYesMayPromote,
  handfulSurveyMaySetOptimalPrice,
  ltvModelMayPromoteAtZeroToOne,
  emptyContextMayInventPriceOrLtv,
  playbookMayBeAutomatedWithoutNamedOwner,
  agentTeamMaySkipUnownedStep,
  newLandingPageMayBeBottleneckWhenNoOneHasTalkedToCustomers,
} from "../dist/house-rules.js";
import {
  afterProofEfficiencyPageMayOpen,
  emptyContextMayInventEfficiencyMetrics,
  path1MayCiteEfficiencyNumbers,
} from "../dist/after-proof-efficiency.js";
import { HOSTED_MCP_RESOURCE, HOSTED_MCP_RESOURCE_ALIAS } from "../dist/oauth.js";
import { REPO_ROOT } from "./helpers.mjs";

const PLUGIN = path.join(REPO_ROOT, "plugin");
const COVERAGE = path.join(PLUGIN, "COVERAGE.md");
const README = path.join(PLUGIN, "README.md");
const MARKET = path.join(REPO_ROOT, ".cursor-plugin", "marketplace.json");
const HOSTED = HOSTED_MCP_RESOURCE;
const PATH1 = HOSTED_MCP_RESOURCE_ALIAS;

function skill(name) {
  return fs.readFileSync(path.join(PLUGIN, "skills", name, "SKILL.md"), "utf8");
}

describe("merge-gate visitor matrix (CoS smell-test)", () => {
  it("names the seven cases and stays on the one connector", () => {
    const coverage = fs.readFileSync(COVERAGE, "utf8");
    const readme = fs.readFileSync(README, "utf8");
    for (const body of [coverage, readme]) {
      assert.match(body, /Installing founder/);
      assert.match(body, /0-1/);
      assert.match(body, /GTM/);
      assert.match(body, /Install-first|install-first/);
      assert.match(body, /do not invent their stage/);
      assert.match(body, /Spoken yes|spoken yes/);
    }
    assert.match(coverage, /emptyContextMayInventStage/);
    assert.match(coverage, /spokenYesMayPromote/);
    assert.match(coverage, /Optional identity visitor matrix/);
    assert.match(coverage, /alpha.*bravo.*charlie|founder fixture/i);
    assert.match(coverage, /one mentee cannot read another|Cannot see Ivelin labels/i);
    assert.match(coverage, /I5/);
    assert.match(coverage, /not_invited/);
    assert.match(coverage, /Valid JWT, no mentee row/);
    const mcpRaw = fs.readFileSync(path.join(PLUGIN, "mcp.json"), "utf8");
    assert.doesNotMatch(mcpRaw, /mcp\.pirin\.ai/);
    assert.doesNotMatch(mcpRaw, /gmail/i);
    assert.doesNotMatch(mcpRaw, /stripe/i);
    const identity = fs.readFileSync(path.join(REPO_ROOT, "mcp", "docs", "HOSTED_IDENTITY.md"), "utf8");
    const mcpReadme = fs.readFileSync(path.join(REPO_ROOT, "mcp", "README.md"), "utf8");
    assert.match(identity, /WWW-Authenticate/);
    assert.match(
      identity,
      /Bearer realm="bootstrap-os-mcp", resource_metadata="https:\/\/mcp\.bootstrap\.pirin\.ai\/\.well-known\/oauth-protected-resource", resource="https:\/\/mcp\.bootstrap\.pirin\.ai\/mcp", scope="bootstrap-os"/,
    );
    assert.match(identity, /PGlite/);
    assert.match(identity, /Authorization: Bearer/);
    assert.match(identity, /Founder lock/);
    assert.match(identity, /\/bootstrap-os\/login/);
    assert.match(identity, /authorization code \+ PKCE/i);
    assert.match(identity, /Do \*\*not\*\* add a login UI/);
    assert.match(identity, /First user \(rebuild from GitHub\)/);
    assert.match(identity, /bootstrap_mcp_mentees/);
    assert.match(identity, /not_invited/);
    assert.match(identity, /lower\('founder@example.com'\)/);
    assert.match(identity, /Invite-from-existing-user/);
    assert.match(identity, /BOOTSTRAP_OAUTH_RESOURCE_METADATA/);
    assert.match(
      identity,
      /resource_metadata="https:\/\/bootstrap-os-mcp-git-cursor-ho-16df4d-ivelins-projects-9f9b7132\.vercel\.app\/\.well-known\/oauth-protected-resource"/,
    );
    assert.doesNotMatch(identity, /v0-pirin-ai-founder-studio-git-be053a/);
    assert.doesNotMatch(identity, /bos_/);
    assert.doesNotMatch(identity, /mint a token/i);
    assert.match(
      identity,
      /resource="https:\/\/bootstrap-os-mcp-git-cursor-ho-16df4d-ivelins-projects-9f9b7132\.vercel\.app\/mcp"/,
    );
    assert.match(
      identity,
      /bootstrap-os-mcp-git-cursor-ho-16df4d-ivelins-projects-9f9b7132\.vercel\.app\/mcp/,
    );
    assert.match(identity, /"authorization_servers": \["https:\/\/www\.pirin\.ai\/bootstrap-os\/login"\]/);
    assert.doesNotMatch(identity, /"authorization_servers": \["https:\/\/pirin\.ai"\]/);
    assert.match(identity, /"issuer": "https:\/\/www\.pirin\.ai\/bootstrap-os\/login"/);
    assert.match(identity, /"token_endpoint": "https:\/\/www\.pirin\.ai\/oauth\/token"/);
    assert.match(identity, /"registration_endpoint": "https:\/\/www\.pirin\.ai\/oauth\/register"/);
    assert.match(identity, /oauth-authorization-server/);
    assert.match(identity, /does \*\*not\*\* serve `\/oauth\/token`/);
    assert.match(identity, /Hold preview/);
    assert.match(identity, /cookie-less `initialize`/);
    assert.match(identity, /GET SSE/);
    assert.match(identity, /tools\/list` return \*\*HTTP 401\*\*/);
    assert.match(identity, /Collab \/ Grok \/ whoami/);
    assert.match(identity, /undeclared deploy-only/);
    assert.match(identity, /E2E_ROLEPLAY\.md/);
    assert.match(identity, /Hard rule — invite-only company boards/);
    assert.match(identity, /cross-tenant-leak\.test\.mjs/);
    assert.match(identity, /never another company's rows/i);
    const e2e = fs.readFileSync(path.join(REPO_ROOT, "mcp", "docs", "E2E_ROLEPLAY.md"), "utf8");
    assert.match(e2e, /invite_member/);
    assert.match(e2e, /accept_invite/);
    assert.match(e2e, /Invitee login-URL accept/);
    assert.match(e2e, /INVITE\.md/);
    const inviteDoc = fs.readFileSync(path.join(REPO_ROOT, "mcp", "docs", "INVITE.md"), "utf8");
    assert.match(inviteDoc, /DraftExternalMessage/);
    assert.match(inviteDoc, /Bill/);
    assert.match(e2e, /Draft prod synthetic SRE/);
    assert.match(e2e, /GET \/health/);
    assert.match(coverage, /I6/);
    assert.doesNotMatch(identity, /Path 1 \/ first-hour \/ apply OS with no account/);
    assert.ok(identity.includes(PATH1));
    assert.match(identity, /Vercel Authentication is \*\*off\*\*/);
    assert.doesNotMatch(readme, /SSO-gated/);
    assert.equal(fs.existsSync(path.join(REPO_ROOT, "mcp", "api", "login.ts")), false);
    assert.equal(fs.existsSync(path.join(REPO_ROOT, "plugin", "login.html")), false);
    assert.match(mcpReadme, /First-user fixture/);
    assert.match(mcpReadme, /alpha.*bravo.*charlie/s);
    assert.match(mcpReadme, /Replaces Path 1\?/);
  });

  it("H1 + A1 install-first: plugin + connector only", () => {
    const first = skill("first-hour");
    assert.ok(first.length < 1800);
    assert.match(first, /install-first|Install-first/i);
    assert.ok(first.includes(HOSTED));
    assert.ok(!first.includes(PATH1));
    assert.match(first, /No auth/);
    assert.match(first, /No database/);
    assert.match(first, /No other connectors/);
    assert.match(first, /https:\/\/github.com\/ivelin\/bootstrap/);
    const readme = fs.readFileSync(README, "utf8");
    assert.ok(readme.includes(HOSTED));
    assert.match(readme, /Import from Repo/);
    assert.match(readme, /plugin \+ MCP connector/);
    assert.match(readme, /## Feedback/);
    assert.match(readme, /escalation to Ivelin/i);
    assert.match(readme, /not a public suggestion box/);
    assert.match(readme, /ivelin@pirin\.ai/);
    assert.match(readme, /public GitHub issue on ivelin\/bootstrap/);
    assert.match(readme, /Either path is fine/);
    assert.match(readme, /No mentee names/);
    assert.match(readme, /no secret sauce/);
    assert.match(readme, /Cos brings it to him/);
    assert.match(readme, /Feedback does not auto-change house rules/);
    assert.doesNotMatch(readme, /GitHub issue is not the escalate path/);
    assert.equal((readme.match(/ivelin@pirin\.ai/g) || []).length, 1);
  });

  it("H2 + A2 query-OS-first on a 0-1 placement ask", () => {
    const standing = skill("query-os-first");
    assert.ok(standing.length < 2400);
    assert.match(standing, /0-1/);
    assert.match(standing, /the-5-journey-rungs-simple-view/);
    assert.match(standing, /Call this plugin first/);
    assert.match(standing, /Do not speak as Ivelin/);
    assert.match(standing, /plugin\/README\.md#feedback/);
    assert.match(standing, /Escalation to Ivelin/);
    assert.match(standing, /no PII/);
    assert.doesNotMatch(standing, /ivelin@pirin\.ai/);
    const fm = standing.match(/^description:\s*(.+)$/m);
    assert.ok(fm, "query-os-first needs a description trigger");
    assert.match(fm[1], /0-1/);
  });

  it("H3 + A4 spoken-yes / conversation is not GTM — refuse and cite OS", () => {
    const standing = skill("query-os-first");
    const pins = skill("house-rule-pins");
    for (const body of [standing, pins]) {
      assert.match(body, /GTM/);
      assert.match(body, /spoken yes/i);
      assert.match(body, /how-to-do-honest-research/);
    }
    assert.match(standing, /verbal maybe/);
    assert.match(standing, /is not GTM/);
    assert.match(pins, /Refuse/);
    assert.equal(spokenYesMayPromote(), false);
    assert.equal(spokenYesIsGtm(), false);
  });

  it("A3 empty-context must not invent their stage", () => {
    const standing = skill("query-os-first");
    assert.match(standing, /Empty context/);
    assert.match(standing, /no founder update/);
    assert.match(standing, /do not invent their stage/);
    assert.match(standing, /unknown \/ none yet/);
    assert.match(standing, /first-hour.md/);
    assert.equal(emptyContextMayInventStage(), false);
  });

  it("price / handful WTP / LTV at 0-1 — refuse and cite OS; empty context invents no price", () => {
    const standing = skill("query-os-first");
    const pins = skill("house-rule-pins");
    for (const body of [standing, pins]) {
      assert.match(body, /optimal price/i);
      assert.match(body, /house-rule-there-is-no-optimal-price-until-people-have-paid-and-stayed/);
    }
    assert.match(standing, /handful WTP/i);
    assert.match(standing, /LTV/);
    assert.match(standing, /old SaaS playbook/);
    assert.match(pins, /old SaaS playbook/);
    assert.match(standing, /do not invent their stage, a price, or an LTV number/);
    assert.match(pins, /Refuse/);
    assert.equal(handfulSurveyMaySetOptimalPrice(), false);
    assert.equal(ltvModelMayPromoteAtZeroToOne(), false);
    assert.equal(emptyContextMayInventPriceOrLtv(), false);
  });

  it("Day 0 lifestyle or fences is a Path 1 pin, not a house-rule essay", () => {
    const first = skill("first-hour");
    const path1 = skill("path-1-default");
    for (const body of [first, path1]) {
      assert.match(body, /lifestyle or swinging for the fences/i);
      assert.match(body, /day-0-lifestyle-or-swinging-for-the-fences/);
      assert.match(body, /not a house rule/);
      assert.doesNotMatch(body, /Watch three numbers/);
      assert.doesNotMatch(body, /day 31/);
      assert.doesNotMatch(body, /popcorn stand/);
    }
  });

  it("after-proof efficiency: fences+proof+ask opens; lifestyle / 0-1 / empty do not", () => {
    const gate = skill("after-proof-efficiency");
    const standing = skill("query-os-first");
    const pins = skill("house-rule-pins");
    const first = skill("first-hour");
    const path1 = skill("path-1-default");
    assert.match(gate, /ALL of|ALL three/);
    assert.match(gate, /after-proof-efficiency\.md/);
    assert.match(standing, /Exit without fences\+proof/);
    assert.match(pins, /LTV:CAC 3x \/ T2D3 stale/);
    assert.doesNotMatch(first, /CAC payback|NRR|magic number|0\.75 stop-spend/);
    assert.doesNotMatch(path1, /CAC payback|NRR|magic number|0\.75 stop-spend/);
    assert.equal(
      afterProofEfficiencyPageMayOpen({
        choseFences: true,
        hasProof: true,
        askedEfficiencyOrExit: true,
      }),
      true,
    );
    assert.equal(
      afterProofEfficiencyPageMayOpen({
        choseFences: false,
        hasProof: true,
        askedEfficiencyOrExit: true,
      }),
      false,
    );
    assert.equal(emptyContextMayInventEfficiencyMetrics(), false);
    assert.equal(path1MayCiteEfficiencyNumbers(), false);
  });

  it("After First Hour: query MCP; refuse upload to Ivelin's GitHub; Path 1 stays the front door", () => {
    const firstHourOs = fs.readFileSync(
      path.join(REPO_ROOT, "company-os", "first-hour.md"),
      "utf8",
    );
    const after = firstHourOs.match(/## After this hour[\s\S]*$/);
    assert.ok(after, "After this hour section missing");
    assert.match(after[0], /### Standing rules/);
    assert.ok(after[0].includes(HOSTED));
    assert.ok(!after[0].includes(PATH1));
    assert.match(after[0], /Do \*\*not\*\* upload mentee work to Ivelin.s GitHub/);
    assert.ok(after[0].includes("https://github.com/ivelin/bootstrap"));
    assert.match(after[0], /\*\*Not\*\* a public catalog submit/);
    assert.match(after[0], /\*\*Not\*\* a Grok Bot marketplace bot/);
    assert.match(after[0], /Not another Day 0 checkbox/);

    const doneWhen = firstHourOs.match(/## Done when[\s\S]*?(?=\n## After this hour)/);
    assert.ok(doneWhen, "Done when section missing");
    assert.doesNotMatch(doneWhen[0], /bootstrap-os-mcp\.vercel\.app/);
    assert.doesNotMatch(doneWhen[0], /mcp\.bootstrap\.pirin\.ai/);
    assert.doesNotMatch(doneWhen[0], /upload mentee work/);

    const first = skill("first-hour");
    const path1 = skill("path-1-default");
    const standing = skill("query-os-first");
    for (const body of [first, path1]) {
      assert.match(body, /Do not upload mentee work to Ivelin.s GitHub/);
      assert.match(body, /first-hour\.md#standing-rules/);
      assert.ok(body.includes(HOSTED) || body.includes("https://github.com/ivelin/bootstrap"));
      assert.doesNotMatch(body, /Grok Bot marketplace bot/);
    }
    assert.ok(first.includes(HOSTED));
    assert.match(path1, /https:\/\/github.com\/ivelin\/bootstrap/);
    assert.match(standing, /Upload mentee work to Ivelin.s GitHub — refuse/);
    assert.match(standing, /first-hour\.md#standing-rules/);

    const readme = fs.readFileSync(README, "utf8");
    const coverage = fs.readFileSync(COVERAGE, "utf8");
    for (const body of [readme, coverage]) {
      assert.match(body, /After First Hour visitor matrix/);
      assert.match(body, /push mentee files to ivelin\/bootstrap/);
      assert.ok(body.includes(HOSTED));
      assert.match(body, /https:\/\/github.com\/ivelin\/bootstrap/);
    }
    assert.match(readme, /Do not upload mentee work to Ivelin.s GitHub/);
    assert.match(readme, /first-hour\.md#standing-rules/);
  });

  it("do not automate: installing founder; mentee playbook; specialist agent team", () => {
    const standing = skill("query-os-first");
    const pins = skill("house-rule-pins");
    const first = skill("first-hour");
    const firstHourOs = fs.readFileSync(
      path.join(REPO_ROOT, "company-os", "first-hour.md"),
      "utf8",
    );
    const os = fs.readFileSync(
      path.join(REPO_ROOT, "company-os", "operating-system.md"),
      "utf8",
    );
    const readme = fs.readFileSync(README, "utf8");
    const coverage = fs.readFileSync(COVERAGE, "utf8");

    assert.match(os, /### House rule: do not automate a step that should not exist/);
    assert.match(os, /house-rule-do-not-automate-a-step-that-should-not-exist/);
    assert.match(os, /Every requirement has a person's name/);
    assert.match(os, /Delete the step before you simplify it/);
    assert.match(os, /Automate last/);
    assert.match(os, /An agent team is automation/);
    assert.match(os, /Name the one bottleneck this week and work that/);
    assert.match(os, /Several ideas may attack that same bottleneck/);
    assert.match(os, /A second ritual, channel, or agent team that does not attack it is busywork/);
    assert.match(os, /fun side quest dressed as the bottleneck/);
    assert.match(os, /the agent does not rubber-stamp/);
    assert.match(os, /weakest link/);
    assert.match(os, /slowest soldier/);
    assert.match(os, /not extra law/);
    assert.doesNotMatch(os, /Name the one constraint this week and work that/);
    assert.doesNotMatch(os, /Do not open a second idea, ritual, or agent team to walk around it/);
    assert.doesNotMatch(os, /\bElon\b|\bMusk\b|five-step algorithm/i);
    assert.doesNotMatch(os, /constraint_this_week/);

    const doneWhen = firstHourOs.match(/## Done when[\s\S]*?(?=\n## After this hour)/);
    assert.ok(doneWhen, "Done when section missing");
    assert.doesNotMatch(doneWhen[0], /automate a step that should not exist/);
    assert.doesNotMatch(doneWhen[0], /automate the playbook/);
    assert.doesNotMatch(doneWhen[0], /agent team/);
    assert.match(first, /first-hour\.md#standing-rules/);
    assert.doesNotMatch(first, /busy-looking machinery/);

    for (const body of [standing, pins]) {
      assert.match(body, /automate the playbook/);
      assert.match(body, /house-rule-do-not-automate-a-step-that-should-not-exist/);
    }
    assert.match(standing, /Name the person or delete the step first/);
    assert.match(pins, /agent team to skip a step with no named owner/);
    assert.match(firstHourOs, /house-rule-do-not-automate-a-step-that-should-not-exist/);
    assert.match(firstHourOs, /Name the one bottleneck this week and work that/);
    assert.match(firstHourOs, /Several ideas may attack that same bottleneck/);
    assert.match(firstHourOs, /new landing page/);
    assert.doesNotMatch(firstHourOs, /busy-looking machinery/);
    assert.doesNotMatch(firstHourOs, /Factory speed is not 0→1/);
    assert.doesNotMatch(firstHourOs, /A second ritual, channel, or agent team that does not attack it is busywork/);
    assert.doesNotMatch(firstHourOs, /Do not open a second idea, ritual, or agent team to walk around it/);
    assert.doesNotMatch(firstHourOs, /weakest link/);
    assert.doesNotMatch(firstHourOs, /slowest soldier/);

    for (const body of [standing, pins]) {
      assert.match(body, /new landing page/);
    }
    assert.match(standing, /written founder override/);

    for (const body of [readme, coverage]) {
      assert.match(body, /Do not automate visitor matrix/);
      assert.match(body, /automate the playbook/);
      assert.match(body, /no named owner/);
      assert.match(body, /delete or name the person first/i);
      assert.match(body, /one bottleneck this week/);
      assert.match(body, /new landing page/);
    }
    assert.equal(playbookMayBeAutomatedWithoutNamedOwner(), false);
    assert.equal(agentTeamMaySkipUnownedStep(), false);
    assert.equal(newLandingPageMayBeBottleneckWhenNoOneHasTalkedToCustomers(), false);
    assert.equal(newLandingPageMayBeBottleneckWhenNoOneHasTalkedToCustomers(true), true);
  });

  it("install-reader and team listing still lock the pin", () => {
    const body = fs.readFileSync(README, "utf8");
    assert.match(body, /~\/\.cursor\/plugins\/local\/bootstrap-os/);
    assert.match(body, /\/add-plugin/);
    assert.match(body, /[Ww]e have not submitted/);
    const market = JSON.parse(fs.readFileSync(MARKET, "utf8"));
    assert.equal(market.plugins.length, 1);
    assert.equal(market.plugins[0].source, "plugin");
    const mcp = JSON.parse(fs.readFileSync(path.join(PLUGIN, "mcp.json"), "utf8"));
    assert.deepEqual(Object.keys(mcp.mcpServers), ["bootstrap-os"]);
    assert.equal(mcp.mcpServers["bootstrap-os"].url, HOSTED);
  });
});

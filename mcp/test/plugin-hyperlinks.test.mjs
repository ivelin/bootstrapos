import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { HOSTED_MCP_RESOURCE } from "../dist/oauth.js";
import { REPO_ROOT } from "./helpers.mjs";

const PLUGIN = path.join(REPO_ROOT, "plugin");
const HOSTED_MCP_URL = HOSTED_MCP_RESOURCE;
const ESSAY_FORBIDDEN = [
  "Text eight people",
  "waitlist of 400",
  "does not mean get a crowd looking",
  "Dense leftover text is good",
  "### House rule:",
  "Watch three numbers",
  "still paying on day 90",
  "long LTV model is fiction",
  "grind three years on a popcorn stand",
  "Do not guide to where the puck has been",
  "dated current-year AI sources",
  "busy-looking machinery",
  "Factory speed is not 0→1",
  "A second ritual, channel, or agent team that does not attack it is busywork",
  "Do not open a second idea, ritual, or agent team to walk around it",
  "weakest link",
  "slowest soldier",
];

function skillFiles() {
  const skillsDir = path.join(PLUGIN, "skills");
  return fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(skillsDir, d.name, "SKILL.md"));
}

describe("preview plugin (hyperlink only)", () => {
  it("has portable Agent Plugins manifests and a team Import from Repo listing", () => {
    const pluginJson = JSON.parse(fs.readFileSync(path.join(PLUGIN, "plugin.json"), "utf8"));
    assert.equal(pluginJson.$schema, "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
    assert.equal(pluginJson.name, "bootstrap-os");
    assert.equal(pluginJson.version, "0.1.1");

    const cursorPlugin = JSON.parse(
      fs.readFileSync(path.join(PLUGIN, ".cursor-plugin", "plugin.json"), "utf8"),
    );
    assert.equal(cursorPlugin.version, "0.1.1");
    assert.equal(
      cursorPlugin.variables.properties.BOOTSTRAP_MCP_URL.default,
      HOSTED_MCP_URL,
    );

    const mcpJson = JSON.parse(fs.readFileSync(path.join(PLUGIN, "mcp.json"), "utf8"));
    assert.equal(mcpJson.$schema, "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json");
    assert.deepEqual(Object.keys(mcpJson.mcpServers), ["bootstrap-os"]);
    const server = mcpJson.mcpServers["bootstrap-os"];
    assert.equal(server.type, "streamable-http");
    assert.equal(server.url, HOSTED_MCP_URL);
    assert.doesNotMatch(server.url, /https:\/\/mcp\.pirin\.ai\b/);
    assert.ok(!("command" in server));
    const mcpRaw = JSON.stringify(mcpJson);
    assert.doesNotMatch(mcpRaw, /mcp\.pirin\.ai/);
    assert.doesNotMatch(mcpRaw, /\bnpx\b/);
    assert.doesNotMatch(mcpRaw, /gmail/i);
    assert.doesNotMatch(mcpRaw, /stripe/i);

    assert.ok(fs.existsSync(path.join(PLUGIN, ".cursor-plugin", "plugin.json")));
    assert.ok(!fs.existsSync(path.join(PLUGIN, "marketplace.json")));
    const market = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, ".cursor-plugin", "marketplace.json"), "utf8"),
    );
    assert.equal(market.name, "bootstrap-os");
    assert.equal(market.plugins.length, 1);
    assert.equal(market.plugins[0].name, "bootstrap-os");
    assert.equal(market.plugins[0].source, "plugin");
    assert.ok(!fs.existsSync(path.join(PLUGIN, "operating-system.md")));
    assert.ok(fs.existsSync(path.join(REPO_ROOT, "mcp", "vercel.json")));
    assert.ok(fs.existsSync(path.join(REPO_ROOT, "mcp", "api", "mcp.ts")));
    assert.ok(fs.existsSync(path.join(REPO_ROOT, "mcp", "api", "health.ts")));
  });

  it("skills exist, stay thin, and only hyperlink the published OS", () => {
    const files = skillFiles();
    assert.ok(files.length >= 4, `expected thin skills, got ${files.length}`);
    const required = [
      "path-1-default",
      "house-rule-pins",
      "first-hour",
      "query-os-first",
      "after-proof-efficiency",
      "when-to-write",
    ];
    for (const name of required) {
      assert.ok(
        files.some((f) => f.endsWith(`${path.sep}${name}${path.sep}SKILL.md`)),
        `missing skill ${name}`,
      );
    }
    for (const file of files) {
      const body = fs.readFileSync(file, "utf8");
      const thin = file.includes(`${path.sep}house-rule-pins${path.sep}`) || file.includes(`${path.sep}query-os-first${path.sep}`);
      assert.ok(body.length < (thin ? 2400 : 1800), `${file} is too long — link, do not copy the OS`);
      assert.match(body, /https:\/\/github.com\/ivelin\/bootstrap/);
      for (const phrase of ESSAY_FORBIDDEN) {
        assert.ok(!body.includes(phrase), `${file} must not copy OS essay: ${phrase}`);
      }
    }
    const pins = fs.readFileSync(path.join(PLUGIN, "skills", "house-rule-pins", "SKILL.md"), "utf8");
    assert.match(pins, /house-rule-marketing-volume-cannot-promote/);
    assert.match(pins, /house-rule-a-security-program-cannot-promote/);
    assert.match(pins, /house-rule-there-is-no-optimal-price-until-people-have-paid-and-stayed/);
    assert.match(pins, /house-rule-do-not-automate-a-step-that-should-not-exist/);
    assert.match(pins, /house-rule-legal-paper-cannot-promote/);
    assert.match(pins, /house-rule-advisor-ride-along-is-assumed-not-observed/);
    assert.match(pins, /old SaaS playbook/);
    assert.match(pins, /automate the playbook/);
    assert.match(pins, /one bottleneck this week/);
    assert.match(pins, /new landing page/);
    const standing = fs.readFileSync(
      path.join(PLUGIN, "skills", "query-os-first", "SKILL.md"),
      "utf8",
    );
    assert.match(standing, /0-1/);
    assert.match(standing, /spoken yes/);
    assert.match(standing, /do not invent their stage/);
    assert.match(standing, /is not GTM/);
    assert.match(standing, /Do not speak as Ivelin/);
    assert.match(standing, /Do not host mentee/);
    assert.match(standing, /Path 1 stays the front door/);
    assert.match(standing, /plugin\/README\.md#feedback/);
    assert.match(standing, /is this price optimal/);
    assert.match(standing, /old SaaS playbook/);
    assert.match(standing, /house-rule-there-is-no-optimal-price-until-people-have-paid-and-stayed/);
    assert.match(standing, /house-rule-do-not-automate-a-step-that-should-not-exist/);
    assert.match(standing, /automate the playbook/);
    assert.match(standing, /new landing page/);
    assert.match(standing, /written founder override/);
    assert.match(standing, /do not invent their stage, a price, or an LTV number/);
    assert.doesNotMatch(standing, /ivelin@pirin\.ai/);
    const firstHour = fs.readFileSync(path.join(PLUGIN, "skills", "first-hour", "SKILL.md"), "utf8");
    assert.match(firstHour, /Install-first|install-first/);
    assert.match(firstHour, /mcp\.bootstrap\.pirin\.ai\/mcp/);
    assert.doesNotMatch(firstHour, /bootstrap-os-mcp\.vercel\.app\/mcp/);
    assert.match(firstHour, /lifestyle or swinging for the fences/i);
    assert.match(firstHour, /day-0-lifestyle-or-swinging-for-the-fences/);
    assert.match(firstHour, /Do not upload mentee work to Ivelin.s GitHub/);
    assert.match(firstHour, /first-hour\.md#standing-rules/);
    assert.doesNotMatch(firstHour, /Grok Bot marketplace bot/);
    const path1 = fs.readFileSync(path.join(PLUGIN, "skills", "path-1-default", "SKILL.md"), "utf8");
    assert.match(path1, /lifestyle or swinging for the fences/i);
    assert.match(path1, /day-0-lifestyle-or-swinging-for-the-fences/);
    assert.match(path1, /Do not upload mentee work to Ivelin.s GitHub/);
    assert.match(path1, /first-hour\.md#standing-rules/);
    assert.match(path1, /https:\/\/github.com\/ivelin\/bootstrap/);
    assert.doesNotMatch(path1, /Grok Bot marketplace bot/);
    assert.match(standing, /Upload mentee work to Ivelin.s GitHub — refuse/);
    assert.match(standing, /first-hour\.md#standing-rules/);
    assert.doesNotMatch(standing, /Grok Bot marketplace bot/);
    const efficiency = fs.readFileSync(
      path.join(PLUGIN, "skills", "after-proof-efficiency", "SKILL.md"),
      "utf8",
    );
    assert.match(efficiency, /ALL of|ALL three/);
    assert.match(efficiency, /after-proof-efficiency\.md/);
    assert.match(efficiency, /Two clocks/);
    assert.doesNotMatch(path1, /CAC payback|NRR|0\.75 stop-spend/);
    assert.doesNotMatch(firstHour, /CAC payback|NRR|0\.75 stop-spend/);
    assert.doesNotMatch(efficiency, /0\.75 stop-spend/);
    const when = fs.readFileSync(path.join(PLUGIN, "skills", "when-to-write", "SKILL.md"), "utf8");
    assert.match(when, /founder yes/);
    assert.match(when, /Comments never mutate/);
    assert.match(when, /judge-only/);
    assert.doesNotMatch(when, /get_journey|put_journey|post_comment|subscribe_board|enable_board_watch|list_provenance|put_portfolio_score/);
    assert.doesNotMatch(when, /Grok Bot template/);
  });
});

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const plugin = path.join(root, "plugin");
const url = "https://mcp.bootstrap.pirin.ai/mcp";

const pluginKeys = new Set([
  "$schema",
  "name",
  "version",
  "description",
  "author",
  "homepage",
  "repository",
  "license",
  "keywords",
  "extensions",
]);

function readJson(rel) {
  const file = path.join(plugin, rel);
  const text = fs.readFileSync(file, "utf8");
  const doc = JSON.parse(text);
  assert.equal(typeof doc, "object", rel);
  return doc;
}

const manifest = readJson("plugin.json");
for (const key of Object.keys(manifest)) {
  assert.ok(pluginKeys.has(key), `plugin.json rejects ${key}`);
}
assert.equal(manifest.name, "bootstrap-os");
assert.equal(manifest.$schema, "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");

const cursor = readJson(".cursor-plugin/plugin.json");
assert.equal(cursor.mcpServers, "./mcp.json");
assert.equal(cursor.name, "bootstrap-os");

const claude = readJson(".claude-plugin/plugin.json");
assert.equal(claude.mcpServers, "./.mcp.json");
assert.equal(claude.skills, "./skills/");

const codex = readJson(".codex-plugin/plugin.json");
assert.equal(codex.mcpServers, "./mcp.json");
assert.equal(codex.skills, "./skills/");

const mcp = readJson("mcp.json");
const dot = readJson(".mcp.json");
assert.deepEqual(dot, mcp);
const server = mcp.mcpServers["bootstrap-os"];
assert.equal(server.type, "streamable-http");
assert.equal(server.url, url);

const skillDir = path.join(plugin, "skills");
const skills = fs
  .readdirSync(skillDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
assert.ok(skills.includes("bet-start"));

const sopPhrases = [
  "Bars are frozen",
  "Relieves:",
  "barsFreeze",
  "killPostmortem",
  "Synthetic before real",
];

for (const name of skills) {
  const file = path.join(skillDir, name, "SKILL.md");
  const mirror = path.join(root, "skills", name, "SKILL.md");
  const body = fs.readFileSync(file, "utf8");
  assert.equal(fs.readFileSync(mirror, "utf8"), body, `${name} mirror`);
  for (const phrase of sopPhrases) {
    assert.equal(body.includes(phrase), false, `${name} copied SOP text: ${phrase}`);
  }
  assert.equal(/```[\s\S]{200,}```/.test(body), false, `${name} has a long fenced dump`);
}

const bet = fs.readFileSync(path.join(skillDir, "bet-start", "SKILL.md"), "utf8");
assert.match(bet, /min_connector_version: "0\.3\.5"/);
assert.match(bet, /min_sop_version: "1\.0\.0"/);
assert.match(bet, /bootstrap_get_sop/);
assert.equal(/\bp_version\b/.test(bet), false);
assert.equal(/["']version["']\s*:/.test(bet), false);
assert.match(bet, /update the connector/);
assert.match(bet, /update this plugin/);

console.log("plugin install check ok");

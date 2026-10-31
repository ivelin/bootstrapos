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
assert.deepEqual(dot.mcpServers, mcp.mcpServers);
const server = mcp.mcpServers["bootstrap-os"];
assert.equal(server.type, "streamable-http");
assert.equal(server.url, url);
assert.deepEqual(Object.keys(server).sort(), ["type", "url"]);

function walkJson(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkJson(full, out);
    else if (entry.name.endsWith(".json")) out.push(full);
  }
  return out;
}

const serverEntries = [];
const secretRe =
  /bearer\s+[a-z0-9._-]+|bos_[a-z0-9]|sk-[a-z0-9]|api[_-]?key|client_secret|private_key|password\s*[:=]/i;
for (const file of walkJson(plugin)) {
  const text = fs.readFileSync(file, "utf8");
  const doc = JSON.parse(text);
  assert.equal(secretRe.test(text), false, `secret in ${path.relative(plugin, file)}`);
  assert.equal(/authorization/i.test(text), false, `auth header in ${file}`);
  const found = [];
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (value.mcpServers && typeof value.mcpServers === "object" && !Array.isArray(value.mcpServers)) {
      for (const entry of Object.values(value.mcpServers)) {
        if (entry && typeof entry === "object") found.push(entry);
      }
    }
    for (const child of Object.values(value)) visit(child);
  };
  visit(doc);
  for (const entry of found) {
    assert.deepEqual(entry, server, path.relative(plugin, file));
    serverEntries.push(entry);
  }
}
assert.ok(serverEntries.length >= 2);

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
  assert.equal(/grokbot:\/\//i.test(body), false, `${name} has a Grok Bot URL`);
  assert.equal(/bot-template/i.test(body), false, `${name} has a bot-template link`);
  assert.equal(/x\.ai\/bot/i.test(body), false, `${name} has a bot template link`);
}

const bet = fs.readFileSync(path.join(skillDir, "bet-start", "SKILL.md"), "utf8");
assert.match(bet, /min_connector_version: "0\.3\.5"/);
assert.match(bet, /min_sop_version: "1\.0\.0"/);
assert.match(bet, /bootstrap_get_sop/);
assert.equal(/\bp_version\b/.test(bet), false);
assert.equal(/["']version["']\s*:/.test(bet), false);
assert.match(bet, /Upgrade required\. Update the Bootstrap OS connector before continuing\./);
assert.match(bet, /Upgrade required\. Update the Bootstrap OS plugin before continuing\./);
assert.match(bet, /no fallback/i);
assert.match(bet, /client/);
assert.match(bet, /`cursor`/);
assert.match(bet, /`claude`/);
assert.match(bet, /`codex`/);
assert.match(bet, /OAuth/);
assert.equal(/keep going|continue anyway|silently/i.test(bet) && !/Do not keep going/.test(bet), false);

console.log("plugin install check ok");

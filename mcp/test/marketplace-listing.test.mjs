/**
 * Catalog listing at the repo root, and the marketplace flag the doc still claims.
 * bootstrap_os_info stays marketplace:false while MARKETPLACE.md says not listed.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { handleHostedReadFetch } from "../dist/hosted-handler.js";
import { REPO_ROOT } from "./helpers.mjs";

const BOT_ADDRESS = /grokbot\.com|grokbot|x\.ai\/bot|@x\.ai\b/i;

async function hostedInfo() {
  const res = await handleHostedReadFetch(
    new Request("https://preview.example/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "bootstrap_os_info", arguments: {} },
      }),
    }),
  );
  const raw = await res.text();
  assert.equal(res.status, 200, raw);
  const body = JSON.parse(raw);
  const text = body.result.content.map((part) => part.text ?? "").join("\n");
  return JSON.parse(text);
}

describe("cursor catalog listing", () => {
  it("bootstrap_os_info returns marketplace false while the doc says not listed", async () => {
    const doc = fs.readFileSync(path.join(REPO_ROOT, "mcp", "docs", "MARKETPLACE.md"), "utf8");
    assert.match(doc, /not listed yet/);
    assert.match(doc, /marketplace: false/);
    const info = await hostedInfo();
    assert.equal(info.marketplace, false);
  });

  it("root plugin.json and mcp.json use Pirin.ai branding and the hosted pin", () => {
    const plugin = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "plugin.json"), "utf8"));
    assert.equal(plugin.$schema, "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
    assert.equal(plugin.name, "bootstrap-os");
    assert.equal(plugin.author.name, "Pirin.ai");
    assert.equal(plugin.author.email, "ivelin@pirin.ai");
    assert.equal(plugin.homepage, "https://pirin.ai/bootstrap-os");
    assert.equal(plugin.repository, "https://github.com/ivelin/bootstrapos");
    assert.doesNotMatch(JSON.stringify(plugin), BOT_ADDRESS);

    const mcp = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "mcp.json"), "utf8"));
    assert.equal(mcp.$schema, "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json");
    assert.equal(mcp.mcpServers["bootstrap-os"].type, "streamable-http");
    assert.equal(mcp.mcpServers["bootstrap-os"].url, "https://mcp.bootstrap.pirin.ai/mcp");
    assert.doesNotMatch(JSON.stringify(mcp), BOT_ADDRESS);

    const listing = fs.readFileSync(path.join(REPO_ROOT, "LISTING.md"), "utf8");
    assert.match(listing, /Pirin\.ai/);
    assert.match(listing, /ivelin@pirin\.ai/);
    assert.match(listing, /https:\/\/pirin\.ai\/bootstrap-os/);
    assert.match(listing, /https:\/\/mcp\.bootstrap\.pirin\.ai\/mcp/);
    assert.match(listing, /not listed/);
    assert.match(listing, /shown to every signed-in account/);
    assert.match(listing, /super admin/);
    assert.doesNotMatch(listing, BOT_ADDRESS);
    assert.doesNotMatch(listing, /bootstrap@pirin\.ai/);
    assert.equal(fs.existsSync(path.join(REPO_ROOT, "README.md")), true);
    const readme = fs.readFileSync(path.join(REPO_ROOT, "README.md"), "utf8");
    assert.match(readme, /How to use this \(pick one\)/);
    assert.doesNotMatch(readme, /ivelin@pirin\.ai/);
  });
});

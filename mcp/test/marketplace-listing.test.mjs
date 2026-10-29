import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { handleHostedReadFetch } from "../dist/hosted-handler.js";
import { createBootstrapServer } from "../dist/server.js";
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

async function localInfo() {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bootstrap-listing-"));
  const prev = {
    BOOTSTRAP_DATA_ROOT: process.env.BOOTSTRAP_DATA_ROOT,
    BOOTSTRAP_OS_ROOT: process.env.BOOTSTRAP_OS_ROOT,
    BOOTSTRAP_INSTANCE_ROOT: process.env.BOOTSTRAP_INSTANCE_ROOT,
  };
  process.env.BOOTSTRAP_DATA_ROOT = dataRoot;
  process.env.BOOTSTRAP_OS_ROOT = REPO_ROOT;
  delete process.env.BOOTSTRAP_INSTANCE_ROOT;
  const server = createBootstrapServer("full");
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "listing-stdio", version: "0.0.0" });
  try {
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    const result = await client.callTool({ name: "bootstrap_os_info", arguments: {} });
    assert.notEqual(result.isError, true);
    const text = result.content.map((part) => part.text ?? "").join("\n");
    return JSON.parse(text);
  } finally {
    await client.close().catch(() => {});
    await server.close().catch(() => {});
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(dataRoot, { recursive: true, force: true });
  }
}

describe("cursor catalog listing", () => {
  it("bootstrap_os_info returns marketplace true", async () => {
    const doc = fs.readFileSync(path.join(REPO_ROOT, "mcp", "docs", "MARKETPLACE.md"), "utf8");
    assert.doesNotMatch(doc, /not listed/i);
    assert.match(doc, /marketplace: true/);
    const hosted = await hostedInfo();
    assert.equal(hosted.surface, "hosted-read");
    assert.equal(hosted.marketplace, true);
    const local = await localInfo();
    assert.equal(local.surface, "full");
    assert.equal(local.marketplace, true);
    assert.equal(typeof local.paths, "object");
  });

  it("root plugin.json and mcp.json use Pirin.ai branding and the hosted pin", () => {
    const plugin = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "plugin.json"), "utf8"));
    assert.equal(plugin.$schema, "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
    assert.equal(plugin.name, "bootstrap-os");
    assert.equal(plugin.author.name, "Pirin.ai");
    assert.equal(plugin.author.email, "ivelin@pirin.ai");
    assert.equal(plugin.homepage, "https://pirin.ai/bootstrap-os");
    assert.equal(plugin.repository, "https://github.com/ivelin/bootstrapos");
    assert.equal(plugin.version, "0.1.1");
    const market = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, ".cursor-plugin", "marketplace.json"), "utf8"),
    );
    assert.equal(plugin.version, market.plugins[0].version);
    assert.equal("logo" in plugin, false);
    assert.doesNotMatch(JSON.stringify(plugin), BOT_ADDRESS);

    const logo = fs.readFileSync(path.join(REPO_ROOT, "logo.png"));
    assert.equal(logo.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(logo.subarray(12, 16).toString("ascii"), "IHDR");
    assert.equal(logo.readUInt32BE(16), 512);
    assert.equal(logo.readUInt32BE(20), 512);

    const doc = fs.readFileSync(path.join(REPO_ROOT, "mcp", "docs", "MARKETPLACE.md"), "utf8");
    assert.match(doc, /publish form uses `logo\.png`/);
    assert.match(doc, /no logo field/);

    const mcp = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "mcp.json"), "utf8"));
    assert.equal(mcp.$schema, "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json");
    assert.equal(mcp.mcpServers["bootstrap-os"].type, "streamable-http");
    assert.equal(mcp.mcpServers["bootstrap-os"].url, "https://mcp.bootstrap.pirin.ai/mcp");
    assert.doesNotMatch(JSON.stringify(mcp), BOT_ADDRESS);

    const listing = fs.readFileSync(path.join(REPO_ROOT, "LISTING.md"), "utf8");
    assert.match(listing, /Pirin\.ai/);
    assert.match(listing, /bootstrap@pirin\.ai/);
    assert.match(listing, /https:\/\/pirin\.ai\/bootstrap-os/);
    assert.match(listing, /https:\/\/pirin\.ai\/privacy/);
    assert.match(listing, /https:\/\/pirin\.ai\/terms/);
    assert.match(listing, /https:\/\/mcp\.bootstrap\.pirin\.ai\/mcp/);
    assert.doesNotMatch(listing, /not listed/i);
    assert.match(listing, /shown to every signed-in account/);
    assert.match(listing, /super admin/);
    assert.doesNotMatch(listing, BOT_ADDRESS);
    assert.equal(fs.existsSync(path.join(REPO_ROOT, "README.md")), true);
    const readme = fs.readFileSync(path.join(REPO_ROOT, "README.md"), "utf8");
    assert.match(readme, /Bootstrap OS by pirin\.ai/);
    assert.match(readme, /bootstrap@pirin\.ai/);
    assert.match(readme, /https:\/\/pirin\.ai\/privacy/);
    assert.match(readme, /https:\/\/pirin\.ai\/terms/);
    assert.doesNotMatch(readme, /ivelin@pirin\.ai/);
    assert.doesNotMatch(readme, /company board/i);
    assert.doesNotMatch(readme, /not listed/i);
    assert.doesNotMatch(readme, /not mentee-ready/i);
  });

  it("listing copy names stage approval and invited companies", () => {
    const listing = fs.readFileSync(path.join(REPO_ROOT, "LISTING.md"), "utf8");
    assert.match(listing, /Moving an idea to a new stage needs your approval\./);
    assert.doesNotMatch(listing, /clear yes before it changes your board/);
    assert.match(listing, /You can only see companies you were invited to/);
    assert.doesNotMatch(listing, /never sees another company's data/);
  });
});

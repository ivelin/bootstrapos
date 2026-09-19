import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { handleHostedReadFetch } from "../dist/hosted-handler.js"
import {
  BOOTSTRAP_BILL_URL,
  HOSTED_BILL_GROK_LINE,
  HOSTED_MCP_INSTRUCTIONS,
  detectGrokClient,
  hostedInstructionsForClient,
} from "../dist/hosted-copy.js"

const HERE = path.dirname(fileURLToPath(import.meta.url))

async function rpc(method, params, extraHeaders = {}, id = 1) {
  const res = await handleHostedReadFetch(
    new Request("https://preview.example/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...extraHeaders,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    }),
  )
  const text = await res.text()
  assert.ok(res.ok, `RPC ${method} failed ${res.status}: ${text}`)
  return JSON.parse(text)
}

describe("hosted Bill hint", () => {
  it("detects Grok-shaped client names and agents only", () => {
    assert.equal(detectGrokClient({ clientName: "Grok Bot" }), true)
    assert.equal(detectGrokClient({ userAgent: "xAI-Grok/1" }), true)
    assert.equal(detectGrokClient({ clientName: "claude-code" }), false)
    assert.equal(detectGrokClient({ clientName: "access-layer" }), false)
  })

  it("keeps Bill off the non-Grok instruction blob", () => {
    const other = hostedInstructionsForClient({ clientName: "access-layer" })
    assert.doesNotMatch(other, /x.ai\/bot/)
    assert.ok(!other.includes(HOSTED_BILL_GROK_LINE))
    const grok = hostedInstructionsForClient({ clientName: "grok-bot" })
    assert.equal(grok, HOSTED_MCP_INSTRUCTIONS)
    assert.match(grok, new RegExp(BOOTSTRAP_BILL_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  })

  it("initialize wires clientInfo + User-Agent into instructions (hint only)", async () => {
    const other = await rpc("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "access-layer", version: "0.0.0" },
    })
    assert.equal(
      other.result.instructions,
      hostedInstructionsForClient({ clientName: "access-layer" }),
    )
    assert.doesNotMatch(other.result.instructions ?? "", /x\.ai\/bot/)

    const grokName = await rpc("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "grok-bot", version: "0.0.0" },
    })
    assert.equal(grokName.result.instructions, HOSTED_MCP_INSTRUCTIONS)
    assert.match(grokName.result.instructions, /x\.ai\/bot/)

    const grokUa = await rpc(
      "initialize",
      {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "claude-code", version: "0.0.0" },
      },
      { "User-Agent": "xAI-Grok/1" },
    )
    assert.equal(
      grokUa.result.instructions,
      hostedInstructionsForClient({ clientName: "claude-code", userAgent: "xAI-Grok/1" }),
    )
    assert.match(grokUa.result.instructions, /x\.ai\/bot/)
  })

  it("Grok client hint does not change ACL", async () => {
    const grokList = await rpc(
      "tools/list",
      {},
      { "User-Agent": "xAI-Grok/1" },
      2,
    )
    const otherList = await rpc("tools/list", {}, {}, 3)
    assert.deepEqual(
      grokList.result.tools.map((t) => t.name).sort(),
      otherList.result.tools.map((t) => t.name).sort(),
    )

    const gated = await handleHostedReadFetch(
      new Request("https://preview.example/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "User-Agent": "xAI-Grok/1",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 4,
          method: "tools/call",
          params: { name: "get_journey", arguments: {} },
        }),
      }),
    )
    assert.equal(gated.status, 401)
    const body = JSON.parse(await gated.text())
    assert.equal(body.error, "invalid_token")
  })

  it("CI wires this hint test into test:unit", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(HERE, "..", "package.json"), "utf8"))
    assert.match(pkg.scripts["test:unit"], /hosted-bill-hint\.test\.mjs/)
  })
})

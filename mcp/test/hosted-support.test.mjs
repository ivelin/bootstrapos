/**
 * Hosted MCP support escape hatch (clients who cannot run Bill).
 * Same mailbox as Bill / invite From. Howto only — no outbound mail.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { handleHostedReadFetch } from "../dist/hosted-handler.js";
import { HOSTED_GATED_TOOL_NAMES, HOSTED_READ_TOOL_NAMES } from "../dist/constants.js";
import {
  HOSTED_MCP_INSTRUCTIONS,
  SUPPORT_EMAIL,
  SUPPORT_HOWTO,
  TOOL_SUPPORT,
} from "../dist/hosted-copy.js";
import { INVITE_MAIL_FROM } from "../dist/invite-mail.js";
import { REPO_ROOT } from "./helpers.mjs";

const BILL = path.join(REPO_ROOT, "docs", "install-bill.md");
const HOSTED_COPY = path.join(REPO_ROOT, "mcp", "src", "hosted-copy.ts");
const SERVER_SRC = path.join(REPO_ROOT, "mcp", "src", "server.ts");

async function rpc(method, params, id = 1) {
  const res = await handleHostedReadFetch(
    new Request("https://preview.example/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    }),
  );
  const text = await res.text();
  assert.ok(res.ok, `RPC ${method} failed ${res.status}: ${text}`);
  return JSON.parse(text);
}

function parseTool(result) {
  const text = result.result.content.map((c) => c.text ?? "").join("\n");
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function assertHowto(payload) {
  assert.equal(payload.email, "bootstrap@pirin.ai");
  assert.deepEqual(payload.include, ["company", "what you tried", "error text"]);
  assert.match(String(payload.routed), /human-routed/i);
  assert.match(String(payload.routed), /not auto-fix/i);
  assert.match(String(payload.note), /bootstrap@pirin\.ai/);
  assert.match(String(payload.note), /human reads it|human-routed/i);
  assert.match(String(payload.note), /not an auto-fix|not auto-fix/i);
  const blob = JSON.stringify(payload);
  assert.doesNotMatch(blob, /webhook|resend|smtp|nodemailer|sendgrid/i);
  assert.doesNotMatch(blob, /ivelin@|cos@/);
}

describe("hosted MCP support escape hatch", () => {
  it("locks bootstrap@pirin.ai in instructions, os_info copy, Bill docs, and the same mailbox as invite From", () => {
    assert.equal(SUPPORT_EMAIL, "bootstrap@pirin.ai");
    assert.equal(SUPPORT_EMAIL, INVITE_MAIL_FROM);
    assert.equal(SUPPORT_HOWTO.email, SUPPORT_EMAIL);
    assert.match(HOSTED_MCP_INSTRUCTIONS, /bootstrap@pirin\.ai/);
    assert.match(HOSTED_MCP_INSTRUCTIONS, /bootstrap_support/);
    assert.match(HOSTED_MCP_INSTRUCTIONS, /human reads it/i);
    assert.match(HOSTED_MCP_INSTRUCTIONS, /not an auto-fix/i);
    assert.doesNotMatch(HOSTED_MCP_INSTRUCTIONS, /webhook|resend/i);
    assert.match(HOSTED_MCP_INSTRUCTIONS, /Feedback and support[\s\S]*bootstrap@pirin\.ai/);
    assert.doesNotMatch(
      HOSTED_MCP_INSTRUCTIONS.match(/Feedback and support[\s\S]*?Call bootstrap_support[^\n]*/)?.[0] ?? "",
      /Bill/i,
    );
    assert.match(TOOL_SUPPORT, /bootstrap@pirin\.ai/);
    assert.match(TOOL_SUPPORT, /human-routed/i);

    const hostedCopy = fs.readFileSync(HOSTED_COPY, "utf8");
    const serverSrc = fs.readFileSync(SERVER_SRC, "utf8");
    const bill = fs.readFileSync(BILL, "utf8");
    assert.match(hostedCopy, /bootstrap@pirin\.ai/);
    assert.match(hostedCopy, /HOSTED_MCP_INSTRUCTIONS/);
    assert.match(serverSrc, /bootstrap_support/);
    assert.match(serverSrc, /SUPPORT_HOWTO/);
    assert.match(bill, /bootstrap@pirin\.ai/);
    assert.doesNotMatch(serverSrc, /from ["']resend["']|create.*webhook|sendEmail/i);
  });

  it("lists bootstrap_support as a public OS tool and never gates it", () => {
    assert.ok(HOSTED_READ_TOOL_NAMES.includes("bootstrap_support"));
    assert.ok(!HOSTED_GATED_TOOL_NAMES.includes("bootstrap_support"));
  });

  it("bootstrap_support is pointer-only — never send or enqueue mail", () => {
    const serverSrc = fs.readFileSync(SERVER_SRC, "utf8");
    const start = serverSrc.indexOf('server.tool("bootstrap_support"');
    assert.ok(start >= 0, "bootstrap_support must be registered");
    const end = serverSrc.indexOf("\n}", start);
    const handler = serverSrc.slice(start, end + 2);
    assert.match(handler, /text\(SUPPORT_HOWTO\)/);
    assert.doesNotMatch(
      handler,
      /deliverInviteMail|notifyPirin|enqueue|queuedMail|outbox|resend|smtp|sendEmail|mailFrom/i,
    );
    assert.deepEqual(Object.keys(SUPPORT_HOWTO).sort(), ["email", "include", "note", "routed"]);
    assert.equal(SUPPORT_HOWTO.email, "bootstrap@pirin.ai");
    assert.ok(!("from" in SUPPORT_HOWTO));
    assert.ok(!("mailFrom" in SUPPORT_HOWTO));
    assert.ok(!("queuedMail" in SUPPORT_HOWTO));
  });

  it("bootstrap_os_info and bootstrap_support return the address + what to include + human-routed", async () => {
    const listed = await rpc("tools/list", {}, 2);
    const names = listed.result.tools.map((t) => t.name);
    assert.ok(names.includes("bootstrap_support"));
    const supportTool = listed.result.tools.find((t) => t.name === "bootstrap_support");
    assert.match(String(supportTool.description ?? ""), /bootstrap@pirin\.ai/);
    assert.doesNotMatch(String(supportTool.description ?? ""), /webhook|resend|mentee/i);

    const info = parseTool(await rpc("tools/call", { name: "bootstrap_os_info", arguments: {} }, 3));
    assert.equal(info.surface, "hosted-read");
    assertHowto(info.support);

    const howto = parseTool(await rpc("tools/call", { name: "bootstrap_support", arguments: {} }, 4));
    assertHowto(howto);
    assert.deepEqual(howto, { ...SUPPORT_HOWTO });
  });

  it("public support howto stays open; gated whoami still 401 (fail-closed unchanged)", async () => {
    const open = await handleHostedReadFetch(
      new Request("https://preview.example/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 5,
          method: "tools/call",
          params: { name: "bootstrap_support", arguments: {} },
        }),
      }),
    );
    assert.equal(open.status, 200);
    const openBody = JSON.parse(await open.text());
    assertHowto(parseTool(openBody));

    const gated = await handleHostedReadFetch(
      new Request("https://preview.example/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 6,
          method: "tools/call",
          params: { name: "bootstrap_whoami", arguments: {} },
        }),
      }),
    );
    assert.equal(gated.status, 401);
    assert.match(gated.headers.get("www-authenticate") ?? "", /Bearer realm="bootstrap-os-mcp"/);
  });
});

/**
 * Optional maintainer check of the two production URLs. Not PR CI.
 * Cloud agents on PRs must not run this (it live-probes prod).
 *
 * Default: invite-only collab host handshake 401. Undeclared deploy alias
 * is the same 401 (not a Path 1 pin).
 * Override a single origin with BOOTSTRAP_MCP_ORIGIN.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { HOSTED_GATED_JOURNEY_TOOL_NAMES, HOSTED_READ_TOOL_NAMES } from "../dist/constants.js";
import {
  HOSTED_MCP_RESOURCE,
  HOSTED_MCP_RESOURCE_ALIAS,
  WWW_AUTHENTICATE_CHALLENGE,
} from "../dist/oauth.js";
import { REPO_ROOT } from "./helpers.mjs";

const COLLAB_ORIGIN = HOSTED_MCP_RESOURCE.replace(/\/mcp$/i, "");
const ALIAS_ORIGIN = HOSTED_MCP_RESOURCE_ALIAS.replace(/\/mcp$/i, "");
const ORIGIN_OVERRIDE = process.env.BOOTSTRAP_MCP_ORIGIN?.replace(/\/+$/, "");
const WRITE_TOOLS = [
  "bootstrap_init_company",
  "bootstrap_get_state",
  "bootstrap_update_state",
  "bootstrap_where_are_we",
  "bootstrap_log_decision",
];

async function fetchRetry(url, init = {}, attempts = 3) {
  let last;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fetch(url, { redirect: "manual", ...init });
    } catch (err) {
      last = err;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw last;
}

async function rpc(origin, method, params, id) {
  const res = await fetchRetry(`${origin}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  const text = await res.text();
  assert.equal(res.status, 200, `RPC ${method} ${res.status}: ${text}`);
  return JSON.parse(text);
}

function isCollabOrigin(origin) {
  return origin.replace(/\/+$/, "") === COLLAB_ORIGIN;
}

function parseTool(result) {
  const text = result.result.content.map((c) => c.text ?? "").join("\n");
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function assertHandshake401(origin) {
  const init = await fetchRetry(`${origin}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "bootstrap-os-preview-live", version: "0.0.0" },
      },
    }),
  });
  assert.equal(init.status, 401, `${origin} initialize ${init.status}`);
  assert.equal(init.headers.get("WWW-Authenticate"), WWW_AUTHENTICATE_CHALLENGE);
}

async function assertPublicPin(origin) {
  const root = await fetchRetry(`${origin}/`);
  assert.equal(root.status, 200, `GET / ${root.status}`);
  const rootText = await root.text();
  assert.match(rootText, /Not mentee-ready boards/);
  assert.match(rootText, /POST \/mcp/);
  assert.match(rootText, /GET \/health/);
  assert.doesNotMatch(rootText, /<html/i);
  assert.doesNotMatch(rootText, /sign in/i);
  assert.doesNotMatch(rootText, /company-state/i);

  const health = await fetchRetry(`${origin}/health`);
  assert.equal(health.status, 200, `GET /health ${health.status}`);
  assert.equal((await health.text()).trim(), "ok");

  const init = await rpc(
    origin,
    "initialize",
    {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "bootstrap-os-preview-live", version: "0.0.0" },
    },
    1,
  );
  assert.equal(init.result.serverInfo.name, "bootstrap-os");

  const listed = await rpc(origin, "tools/list", {}, 2);
  const names = listed.result.tools.map((t) => t.name).sort();
  for (const n of HOSTED_READ_TOOL_NAMES) {
    assert.ok(names.includes(n), `missing live tool ${n}`);
  }
  for (const n of WRITE_TOOLS) {
    assert.ok(!names.includes(n), `live pin must not expose ${n}`);
  }
  for (const n of HOSTED_GATED_JOURNEY_TOOL_NAMES) {
    assert.ok(!names.includes(n), `production pin must not expose gated ${n}`);
  }

  const infoRaw = await rpc(origin, "tools/call", { name: "bootstrap_os_info", arguments: {} }, 3);
  const info = parseTool(infoRaw);
  assert.equal(info.surface, "hosted-read");
  assert.equal(info.marketplace, false);
  assert.match(String(info.companyState), /board for each company|Not hosted/i);
  assert.match(String(info.founderVoice), /board for your company/);
  assert.match(JSON.stringify(info.adoptionOrder), /not mentee-ready boards/);
  assert.match(JSON.stringify(info.adoptionOrder), /Not pirin\.ai/);
  assert.ok(!info.paths?.statePath, "live pin must not expose founder state paths");

  const pinsRaw = await rpc(origin, "tools/call", { name: "bootstrap_house_rule_pins", arguments: {} }, 4);
  const pins = JSON.stringify(parseTool(pinsRaw));
  assert.match(pins, /github.com\/ivelin\/bootstrap/);
  assert.match(pins, /house-rule-marketing-volume-cannot-promote/);
  return names;
}

function isInviteOnlyOrigin(origin) {
  const trimmed = origin.replace(/\/+$/, "");
  return trimmed === COLLAB_ORIGIN || trimmed === ALIAS_ORIGIN;
}

async function main() {
  const origins = ORIGIN_OVERRIDE ? [ORIGIN_OVERRIDE] : [COLLAB_ORIGIN, ALIAS_ORIGIN];
  const namesByOrigin = {};
  for (const origin of origins) {
    if (isInviteOnlyOrigin(origin) || isCollabOrigin(origin)) {
      const root = await fetchRetry(`${origin}/`);
      assert.equal(root.status, 200, `GET / ${root.status}`);
      const health = await fetchRetry(`${origin}/health`);
      assert.equal(health.status, 200, `GET /health ${health.status}`);
      await assertHandshake401(origin);
      namesByOrigin[origin] = ["handshake-401"];
      continue;
    }
    namesByOrigin[origin] = await assertPublicPin(origin);
  }

  const skillsDir = path.join(REPO_ROOT, "plugin", "skills");
  const urls = new Set();
  for (const name of fs.readdirSync(skillsDir)) {
    const file = path.join(skillsDir, name, "SKILL.md");
    if (!fs.existsSync(file)) continue;
    const body = fs.readFileSync(file, "utf8");
    for (const m of body.matchAll(/https:\/\/github.com\/ivelin\/bootstrap[^\s)]+/g)) {
      urls.add(m[0]);
    }
  }
  assert.ok(urls.size >= 4, `expected OS links in skills, got ${urls.size}`);
  for (const url of urls) {
    const res = await fetchRetry(url, {
      redirect: "follow",
      headers: { "User-Agent": "bootstrap-os-preview-live" },
    });
    if (res.status === 200) continue;
    const rel = url.match(/github\.com\/ivelin\/bootstrap\/blob\/main\/([^#]+)/)?.[1];
    const local = rel ? path.join(REPO_ROOT, decodeURIComponent(rel)) : "";
    assert.ok(
      local && fs.existsSync(local),
      `skill link ${url} → ${res.status} and missing locally`,
    );
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        gate: "preview-live-public-pin",
        origins,
        tools: namesByOrigin,
        menteeVisible: true,
        gitPreviewSso: "not-claimed-as-mentee-surface",
        note: "Production pluginPreview version may lag this draft until merge + Vercel production.",
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error("preview-live FAILED");
  console.error(e);
  process.exitCode = 1;
});

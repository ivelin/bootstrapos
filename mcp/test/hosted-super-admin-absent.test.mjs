import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { handleHostedReadFetch } from "../dist/hosted-handler.js";
import { ivelinMemoryFixture, setIdentityStoreForTests } from "../dist/identity.js";
import { HOSTED_MCP_RESOURCE } from "../dist/oauth.js";

const PREVIEW = "https://preview.example/mcp";
const TOKEN = "bos_alpha_fixture_token";

async function post(url, method, params, authorization) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (authorization) headers.Authorization = authorization;
  const res = await handleHostedReadFetch(
    new Request(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
  );
  const text = await res.text();
  return {
    status: res.status,
    contentType: res.headers.get("content-type"),
    text,
  };
}

function assertNoGrantOrRevoke(names) {
  for (const name of names) {
    assert.equal(name.startsWith("grant_"), false, name);
    assert.equal(name.startsWith("revoke_"), false, name);
  }
  assert.ok(names.includes("create_company"));
}

async function listedNames(url, authorization) {
  const listed = await post(url, "tools/list", {}, authorization);
  assert.equal(listed.status, 200, listed.text);
  const body = JSON.parse(listed.text);
  return body.result.tools.map((tool) => tool.name);
}

async function call(name, authorization) {
  const res = await post(
    PREVIEW,
    "tools/call",
    { name, arguments: { email: "other@example.test" } },
    authorization,
  );
  return {
    status: res.status,
    contentType: res.contentType,
    body: JSON.parse(res.text),
  };
}

function withoutEchoedName(observed, name) {
  const text = JSON.stringify(observed);
  assert.match(text, new RegExp(`Tool ${name} not found`));
  return JSON.parse(text.replaceAll(name, "TOOL"));
}

describe("hosted super admin tools absent", () => {
  afterEach(() => {
    setIdentityStoreForTests(undefined);
  });

  it("hosted tools/list contains no grant_ or revoke_ tool", async () => {
    const init = await post(PREVIEW, "initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "hosted-super-admin-absent", version: "0.0.0" },
    });
    assert.equal(init.status, 200, init.text);

    assertNoGrantOrRevoke(await listedNames(PREVIEW));

    setIdentityStoreForTests(ivelinMemoryFixture(TOKEN));
    assertNoGrantOrRevoke(await listedNames(HOSTED_MCP_RESOURCE, `Bearer ${TOKEN}`));
  });

  it("grant_super_admin and revoke_super_admin match an unknown tool", async () => {
    const control = await call("not_a_connector_tool");
    assert.notEqual(control.status, 401);
    const controlShape = withoutEchoedName(control, "not_a_connector_tool");
    assert.deepEqual(withoutEchoedName(await call("grant_super_admin"), "grant_super_admin"), controlShape);
    assert.deepEqual(withoutEchoedName(await call("revoke_super_admin"), "revoke_super_admin"), controlShape);

    setIdentityStoreForTests(ivelinMemoryFixture(TOKEN));
    const authed = `Bearer ${TOKEN}`;
    const authedControl = await call("not_a_connector_tool", authed);
    assert.notEqual(authedControl.status, 401);
    const authedShape = withoutEchoedName(authedControl, "not_a_connector_tool");
    assert.deepEqual(withoutEchoedName(await call("grant_super_admin", authed), "grant_super_admin"), authedShape);
    assert.deepEqual(
      withoutEchoedName(await call("revoke_super_admin", authed), "revoke_super_admin"),
      authedShape,
    );
  });
});

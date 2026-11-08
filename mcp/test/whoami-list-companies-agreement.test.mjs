/**
 * whoami <-> list_companies agreement contract. Never prod.
 *
 * The two tools read the SAME resolved whoami labels. They agree exactly,
 * with ONE deliberate difference: list_companies hides the caller's own
 * private starter-board sandbox (it is not a company — no invites, no
 * promotion, not in the portfolio), while whoami lists every label the
 * login can open, sandbox included. This is the contract behind the live
 * 17-vs-16 report (connector review 2026-11-07): the "missing" company was
 * the caller's starter sandbox slug (sb + 8 hex), filtered by design.
 * Any OTHER divergence between the two sets is a regression this file catches.
 */
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleHostedReadFetch } from "../dist/hosted-handler.js";
import { setIdentityStoreForTests } from "../dist/identity.js";
import { syntheticAccessToken } from "../dist/journey-auth.js";
import { MemoryStarterStore, setStarterStoreForTests } from "../dist/starter-board.js";

const EMAIL = "founder@example.test";
const SANDBOX = "sb1234abcd";
const FOREIGN_SB = "sb9999ffff";

const state = { labels: [], membership: undefined };

function installStores({ withSandbox = false } = {}) {
  const starter = new MemoryStarterStore(undefined, () => SANDBOX);
  setStarterStoreForTests(starter);
  setIdentityStoreForTests({
    kind: "memory",
    async whoami() {
      return {
        authenticated: true,
        email: EMAIL,
        labels: [...state.labels],
        role: "member",
        ...(state.membership ? { membership: state.membership } : {}),
        identityStore: "memory",
      };
    },
  });
  return starter;
}

afterEach(() => {
  setIdentityStoreForTests(undefined);
  setStarterStoreForTests(undefined);
  state.labels = [];
  state.membership = undefined;
});

async function rpc(method, params, token) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await handleHostedReadFetch(
    new Request("https://preview.example/mcp", {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
  );
  return { status: res.status, body: JSON.parse(await res.text()) };
}

function toolJson(body) {
  const text = body.result.content.map((part) => part.text ?? "").join("\n");
  return JSON.parse(text);
}

async function bothTools(token) {
  const who = toolJson((await rpc("tools/call", { name: "bootstrap_whoami", arguments: {} }, token)).body);
  const list = toolJson(
    (await rpc("tools/call", { name: "bootstrap_list_companies", arguments: {} }, token)).body,
  );
  return { who, list };
}

const token = () =>
  syntheticAccessToken({
    email: EMAIL,
    sub: "auth-founder-agreement",
    extra: { exp: Math.floor(Date.now() / 1000) + 3600 },
  });

describe("whoami and list_companies agree on the company set", { concurrency: false }, () => {
  it("exact agreement when the caller has no starter sandbox", async () => {
    installStores();
    state.labels = ["bravo", "alpha"];
    const { who, list } = await bothTools(token());
    assert.deepEqual(who.companies, ["alpha", "bravo"]);
    assert.deepEqual(list.companies, ["alpha", "bravo"]);
    assert.deepEqual(list.companies, who.companies);
    assert.deepEqual(list.labels, who.labels);
  });

  it("the only allowed difference is the caller's own starter sandbox slug", async () => {
    const starter = installStores({ withSandbox: true });
    await starter.create(EMAIL); // registers SANDBOX as this caller's starter board
    state.labels = ["alpha", SANDBOX];
    const { who, list } = await bothTools(token());
    // whoami lists everything the login can open, sandbox included.
    assert.deepEqual(who.companies, ["alpha", SANDBOX]);
    // list_companies hides exactly the sandbox — nothing more, nothing less.
    assert.deepEqual(list.companies, ["alpha"]);
    assert.deepEqual(
      who.companies.filter((slug) => !list.companies.includes(slug)),
      [SANDBOX],
    );
    assert.deepEqual(list.labels, list.companies);
  });

  it("an sb-shaped label that is not the caller's starter board stays in both", async () => {
    const starter = installStores({ withSandbox: true });
    await starter.create(EMAIL);
    state.labels = ["alpha", FOREIGN_SB];
    const { who, list } = await bothTools(token());
    assert.deepEqual(who.companies, ["alpha", FOREIGN_SB]);
    assert.deepEqual(list.companies, ["alpha", FOREIGN_SB]);
  });

  it("whoami surfaces the caller's membership entitlement", async () => {
    installStores();
    state.labels = ["alpha"];
    state.membership = { level: "ground", status: "active" };
    const { who } = await bothTools(token());
    assert.deepEqual(who.membership, { level: "ground", status: "active" });
  });
});

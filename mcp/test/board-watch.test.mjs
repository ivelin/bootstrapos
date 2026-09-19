/**
 * enable_board_watch: Cos-set env, founder-facing tool, no secret leak.
 * Mocked store + env set/unset. Never live-probe prod.
 */
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleHostedReadFetch } from "../dist/hosted-handler.js";
import {
  BOARD_WATCH_PRINCIPAL_ENV,
  BOARD_WATCH_PRINCIPAL_KIND_ENV,
  BOARD_WATCH_UNSET,
  BOARD_WATCH_URL_ENV,
  enableBoardWatch,
  resolveBoardWatchConfig,
} from "../dist/board-watch.js";
import { TOOL_ENABLE_BOARD_WATCH } from "../dist/hosted-copy.js";
import { actorFromAuthorizationHeader, syntheticAccessToken } from "../dist/journey-auth.js";
import { fixtureJourneyStore, setJourneyStoreForTests } from "../dist/journey.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "..", "src", "board-watch.ts");
const SERVER = path.join(__dirname, "..", "src", "server.ts");
const WATCH_URL = "https://hooks.example.test/bill";
const WATCH_PRINCIPAL = "advisor-cos@example.test";

function clearWatchEnv() {
  delete process.env[BOARD_WATCH_URL_ENV];
  delete process.env[BOARD_WATCH_PRINCIPAL_ENV];
  delete process.env[BOARD_WATCH_PRINCIPAL_KIND_ENV];
}

function setWatchEnv(overrides = {}) {
  process.env[BOARD_WATCH_URL_ENV] = overrides.url ?? WATCH_URL;
  process.env[BOARD_WATCH_PRINCIPAL_ENV] = overrides.principal ?? WATCH_PRINCIPAL;
  if (overrides.kind !== undefined) {
    process.env[BOARD_WATCH_PRINCIPAL_KIND_ENV] = overrides.kind;
  } else {
    delete process.env[BOARD_WATCH_PRINCIPAL_KIND_ENV];
  }
}

function founder() {
  return actorFromAuthorizationHeader(
    `Bearer ${syntheticAccessToken({ email: "founder-core@example.test" })}`,
    "memory",
  );
}

function leak(blob, secret) {
  assert.doesNotMatch(String(blob), new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

afterEach(() => {
  clearWatchEnv();
  setJourneyStoreForTests(undefined);
});

describe("resolveBoardWatchConfig", () => {
  it("fails closed when URL or principal is unset", () => {
    assert.deepEqual(resolveBoardWatchConfig({}), { ok: false, error: BOARD_WATCH_UNSET });
    assert.deepEqual(
      resolveBoardWatchConfig({ [BOARD_WATCH_URL_ENV]: WATCH_URL }),
      { ok: false, error: BOARD_WATCH_UNSET },
    );
    assert.deepEqual(
      resolveBoardWatchConfig({ [BOARD_WATCH_PRINCIPAL_ENV]: WATCH_PRINCIPAL }),
      { ok: false, error: BOARD_WATCH_UNSET },
    );
  });

  it("fails closed on non-https URL without leaking the value", () => {
    const bad = "http://hooks.example.test/secret-path";
    const hit = resolveBoardWatchConfig({
      [BOARD_WATCH_URL_ENV]: bad,
      [BOARD_WATCH_PRINCIPAL_ENV]: WATCH_PRINCIPAL,
    });
    assert.deepEqual(hit, { ok: false, error: BOARD_WATCH_UNSET });
    leak(JSON.stringify(hit), "secret-path");
    leak(JSON.stringify(hit), bad);
  });

  it("reads https URL + principal; kind defaults to email", () => {
    const hit = resolveBoardWatchConfig({
      [BOARD_WATCH_URL_ENV]: ` ${WATCH_URL} `,
      [BOARD_WATCH_PRINCIPAL_ENV]: ` ${WATCH_PRINCIPAL} `,
    });
    assert.deepEqual(hit, {
      ok: true,
      config: { url: WATCH_URL, principal: WATCH_PRINCIPAL, principalKind: "email" },
    });
  });

  it("accepts principalKind sub; rejects other kinds without leaking", () => {
    const ok = resolveBoardWatchConfig({
      [BOARD_WATCH_URL_ENV]: WATCH_URL,
      [BOARD_WATCH_PRINCIPAL_ENV]: "sub-only-corehaul",
      [BOARD_WATCH_PRINCIPAL_KIND_ENV]: "sub",
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.config.principalKind, "sub");
    const bad = resolveBoardWatchConfig({
      [BOARD_WATCH_URL_ENV]: WATCH_URL,
      [BOARD_WATCH_PRINCIPAL_ENV]: WATCH_PRINCIPAL,
      [BOARD_WATCH_PRINCIPAL_KIND_ENV]: "phone",
    });
    assert.deepEqual(bad, { ok: false, error: BOARD_WATCH_UNSET });
  });
});

describe("enableBoardWatch (mocked store)", () => {
  it("does not call subscribeBoard when env is unset", async () => {
    const calls = [];
    const store = {
      async subscribeBoard(_actor, input) {
        calls.push(input);
        return { ok: true };
      },
    };
    const hit = await enableBoardWatch(store, founder(), { companySlug: "corehaul" }, {});
    assert.deepEqual(hit, { ok: false, error: BOARD_WATCH_UNSET });
    assert.equal(calls.length, 0);
  });

  it("calls subscribeBoard with Cos-set URL and principal", async () => {
    const calls = [];
    const store = {
      async subscribeBoard(actor, input) {
        calls.push({ actorEmail: actor.email, input });
        return { ok: true, subscriber: { principal: input.principal } };
      },
    };
    const env = {
      [BOARD_WATCH_URL_ENV]: WATCH_URL,
      [BOARD_WATCH_PRINCIPAL_ENV]: WATCH_PRINCIPAL,
    };
    const hit = await enableBoardWatch(store, founder(), { companySlug: "corehaul" }, env);
    assert.equal(hit.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].actorEmail, "founder-core@example.test");
    assert.deepEqual(calls[0].input, {
      companySlug: "corehaul",
      ideaSlug: undefined,
      principal: WATCH_PRINCIPAL,
      principalKind: "email",
      webhookUrl: WATCH_URL,
    });
  });

  it("passes optional idea through to subscribeBoard", async () => {
    const calls = [];
    const store = {
      async subscribeBoard(_actor, input) {
        calls.push(input);
        return { ok: true };
      },
    };
    const env = {
      [BOARD_WATCH_URL_ENV]: WATCH_URL,
      [BOARD_WATCH_PRINCIPAL_ENV]: WATCH_PRINCIPAL,
      [BOARD_WATCH_PRINCIPAL_KIND_ENV]: "email",
    };
    await enableBoardWatch(
      store,
      founder(),
      { companySlug: "corehaul", ideaSlug: "corehaul" },
      env,
    );
    assert.equal(calls[0].ideaSlug, "corehaul");
  });
});

describe("enable_board_watch hosted tool", () => {
  async function callWatch(args, token) {
    const res = await handleHostedReadFetch(
      new Request("https://preview.example/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 7,
          method: "tools/call",
          params: { name: "enable_board_watch", arguments: args },
        }),
      }),
    );
    const raw = await res.text();
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      body = raw;
    }
    return { res, raw, body };
  }

  function toolJson(body) {
    const text = body.result?.content?.map((c) => c.text ?? "").join("\n") ?? "";
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  it("cookie-less call is HTTP 401", async () => {
    setJourneyStoreForTests(fixtureJourneyStore());
    const hit = await callWatch({ company: "corehaul" });
    assert.equal(hit.res.status, 401);
  });

  it("returns board_watch_unset when Cos env is missing; no secret leak", async () => {
    setJourneyStoreForTests(fixtureJourneyStore());
    clearWatchEnv();
    const tok = syntheticAccessToken({ email: "founder-core@example.test" });
    const hit = await callWatch({ company: "corehaul" }, tok);
    assert.equal(hit.res.status, 200, hit.raw);
    const parsed = toolJson(hit.body);
    assert.deepEqual(parsed, { ok: false, error: BOARD_WATCH_UNSET });
    leak(hit.raw, "BOOTSTRAP_BOARD_WATCH_URL");
  });

  it("returns board_watch_unset for http URL without echoing it", async () => {
    setJourneyStoreForTests(fixtureJourneyStore());
    setWatchEnv({ url: "http://hooks.example.test/not-for-logs" });
    const tok = syntheticAccessToken({ email: "founder-core@example.test" });
    const hit = await callWatch({ company: "corehaul" }, tok);
    assert.equal(hit.res.status, 200, hit.raw);
    assert.deepEqual(toolJson(hit.body), { ok: false, error: BOARD_WATCH_UNSET });
    leak(hit.raw, "not-for-logs");
  });

  it("founder grant uses env URL/principal via subscribeBoard", async () => {
    const store = fixtureJourneyStore();
    setJourneyStoreForTests(store);
    setWatchEnv();
    const tok = syntheticAccessToken({ email: "founder-core@example.test" });
    const hit = await callWatch({ company: "corehaul" }, tok);
    assert.equal(hit.res.status, 200, hit.raw);
    const parsed = toolJson(hit.body);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.subscriber.principal, WATCH_PRINCIPAL);
    assert.equal(parsed.subscriber.webhookUrl, WATCH_URL);
    const listed = await store.listSubscribers(founder(), { companySlug: "corehaul" });
    assert.equal(listed.ok, true);
    assert.equal(listed.subscribers.some((s) => s.principal === WATCH_PRINCIPAL), true);
  });
});

describe("board-watch source hygiene", () => {
  it("tool blurb is founder English; source never logs env values", () => {
    assert.match(TOOL_ENABLE_BOARD_WATCH, /Turn on board updates for Bill/);
    assert.doesNotMatch(TOOL_ENABLE_BOARD_WATCH, /webhook|subscribe_board/i);
    const src = fs.readFileSync(SRC, "utf8");
    const server = fs.readFileSync(SERVER, "utf8");
    assert.match(src, /Do not log env values/);
    assert.doesNotMatch(src, /console\.(log|info|debug|error)/);
    assert.match(server, /enable_board_watch/);
    assert.match(server, /TOOL_ENABLE_BOARD_WATCH/);
  });
});

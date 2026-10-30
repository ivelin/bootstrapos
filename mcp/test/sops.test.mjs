import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleHostedReadFetch } from "../dist/hosted-handler.js";
import { HostedMembershipJourneyStore } from "../dist/hosted-journey-store.js";
import { ivelinMemoryFixture, setIdentityStoreForTests } from "../dist/identity.js";
import { setJourneyStoreForTests } from "../dist/journey.js";
import { SOP_FILES, compareSemver, getSop, listSops, sha256Hex, splitSopFile } from "../dist/sops.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const LEDGER = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "sop-immutability.json");
const TOKEN = "bos_ivelin_fixture_token_ok";

function parseToolText(raw) {
  const body = JSON.parse(raw);
  assert.notEqual(body.result?.isError, true);
  return JSON.parse(body.result.content[0].text);
}

function sopFilesOnDisk() {
  const root = path.join(REPO, "company-os", "sops");
  const found = [];
  for (const name of fs.readdirSync(root)) {
    const dir = path.join(root, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!/^v\d+\.\d+\.\d+\.md$/.test(file)) continue;
      found.push(`company-os/sops/${name}/${file}`);
    }
  }
  return found.sort();
}

async function callTool(name, args, { bearer = true } = {}) {
  process.env.BOOTSTRAP_OS_DOCS_SOURCE = "local";
  process.env.BOOTSTRAP_OS_ROOT = REPO;
  setIdentityStoreForTests(ivelinMemoryFixture(TOKEN));
  setJourneyStoreForTests(new HostedMembershipJourneyStore(() => ["alpha"]));
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (bearer) headers.Authorization = `Bearer ${TOKEN}`;
  const res = await handleHostedReadFetch(
    new Request("https://preview.example/mcp", {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    }),
  );
  const raw = await res.text();
  return { status: res.status, raw };
}

describe("published SOPs", () => {
  after(() => {
    setIdentityStoreForTests(undefined);
    setJourneyStoreForTests(undefined);
    delete process.env.BOOTSTRAP_OS_DOCS_SOURCE;
    delete process.env.BOOTSTRAP_OS_DOCS_BASE;
    delete process.env.BOOTSTRAP_OS_ROOT;
  });

  it("latest semver wins and a pinned version returns that file", () => {
    assert.ok(compareSemver("1.10.0", "1.9.0") > 0);
    assert.ok(compareSemver("1.0.0", "1.0.1") < 0);
    assert.equal(compareSemver("1.0.0", "1.0.0"), 0);
  });

  it("latest is 1.0.1 and pinned 1.0.0 returns the old body", async () => {
    process.env.BOOTSTRAP_OS_DOCS_SOURCE = "local";
    process.env.BOOTSTRAP_OS_ROOT = REPO;
    const list = await listSops();
    const row = list.find((item) => item.name === "bet-loop");
    assert.ok(row);
    assert.equal(row.version, "1.0.1");
    assert.equal(row.published_at, "2026-10-30T13:21:00.000Z");
    assert.deepEqual(
      row.versions.map((item) => item.version),
      ["1.0.0", "1.0.1"],
    );
    const latest = await getSop("bet-loop");
    const pinned = await getSop("bet-loop", "1.0.0");
    const oldBody = splitSopFile(
      fs.readFileSync(path.join(REPO, "company-os/sops/bet-loop/v1.0.0.md"), "utf8"),
    ).body;
    assert.equal(latest.version, "1.0.1");
    assert.equal(pinned.version, "1.0.0");
    assert.equal(pinned.body, oldBody);
    assert.notEqual(latest.body, pinned.body);
    assert.match(latest.body, /it is flagged and you decide whether to stop or extend it/);
    assert.match(pinned.body, /unless you choose to extend it/);
    assert.match(latest.body, /naming rule \*\*TBD\*\*/);
    assert.equal(latest.sha256, sha256Hex(latest.body));
    assert.equal(row.sha256, latest.sha256);
  });

  it("unknown name and unknown version name the valid set", async () => {
    process.env.BOOTSTRAP_OS_DOCS_SOURCE = "local";
    process.env.BOOTSTRAP_OS_ROOT = REPO;
    await assert.rejects(() => getSop("missing-sop"), /Unknown SOP "missing-sop". Valid names: bet-loop\./);
    await assert.rejects(
      () => getSop("bet-loop", "9.9.9"),
      /Unknown version "9.9.9" for SOP "bet-loop". Valid versions: 1\.0\.0, 1\.0\.1\./,
    );
  });

  it("recorded sha256 matches the file bytes", () => {
    const ledger = JSON.parse(fs.readFileSync(LEDGER, "utf8"));
    const found = sopFilesOnDisk();
    assert.deepEqual(found, [...SOP_FILES].sort());
    assert.deepEqual(found, Object.keys(ledger).sort());
    for (const rel of found) {
      const raw = fs.readFileSync(path.join(REPO, rel));
      const digest = crypto.createHash("sha256").update(raw).digest("hex");
      assert.equal(ledger[rel], digest, `${rel} changed after its sha was recorded`);
      const text = raw.toString("utf8");
      const { fields, body } = splitSopFile(text);
      assert.equal(fields.sha256, sha256Hex(body));
    }
  });

  it("ledger keys that exist on origin/main keep the same sha", (t) => {
    let raw;
    try {
      raw = execFileSync(
        "git",
        ["show", "origin/main:mcp/test/fixtures/sop-immutability.json"],
        { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
    } catch (error) {
      const stderr = String(error.stderr ?? error.message ?? "");
      if (stderr.includes("exists on disk") || stderr.includes("does not exist") || stderr.includes("not in")) {
        t.skip("sop-immutability.json is absent on origin/main");
        return;
      }
      throw error;
    }
    const previous = JSON.parse(raw);
    const ledger = JSON.parse(fs.readFileSync(LEDGER, "utf8"));
    for (const key of Object.keys(previous)) {
      assert.equal(ledger[key], previous[key], `${key} sha differs from origin/main`);
    }
  });

  it("rejects path traversal in name and version", async () => {
    process.env.BOOTSTRAP_OS_DOCS_SOURCE = "local";
    process.env.BOOTSTRAP_OS_ROOT = REPO;
    const names = ["../../../etc/passwd", "/etc/passwd", "..%2f..%2fetc", "bet-loop/../bet-loop"];
    for (const name of names) {
      await assert.rejects(() => getSop(name), /Unknown SOP/);
      const { status, raw } = await callTool("bootstrap_get_sop", { name }, { bearer: false });
      assert.equal(status, 200, raw);
      const body = JSON.parse(raw);
      assert.equal(body.result.isError, true);
      assert.match(body.result.content[0].text, /Unknown SOP/);
      assert.doesNotMatch(body.result.content[0].text, /root:|\/bin\/bash/);
    }
    const versions = ["../../README", "1.0.0/../../x"];
    for (const version of versions) {
      await assert.rejects(() => getSop("bet-loop", version), /Unknown version/);
      const { status, raw } = await callTool(
        "bootstrap_get_sop",
        { name: "bet-loop", version },
        { bearer: false },
      );
      assert.equal(status, 200, raw);
      const body = JSON.parse(raw);
      assert.equal(body.result.isError, true);
      assert.match(body.result.content[0].text, /Unknown version/);
      assert.doesNotMatch(body.result.content[0].text, /^# Bootstrap OS/m);
    }
  });

  it("get_sop, list_sops, and get_doc succeed with no bearer", async () => {
    const calls = [
      ["bootstrap_get_sop", { name: "bet-loop" }],
      ["bootstrap_list_sops", {}],
      ["bootstrap_get_doc", { doc: "operating-system" }],
    ];
    const statuses = [];
    for (const [name, args] of calls) {
      const { status, raw } = await callTool(name, args, { bearer: false });
      statuses.push(status);
      const body = JSON.parse(raw);
      assert.equal(status, 200, raw);
      assert.notEqual(body.result?.isError, true, raw);
      assert.ok(body.result.content[0].text.length > 20);
    }
    assert.deepEqual(statuses, [200, 200, 200]);
  });

  it("published source fetches the SOP from the docs base", async () => {
    const files = {
      "company-os/sops/bet-loop/v1.0.0.md": fs.readFileSync(
        path.join(REPO, "company-os/sops/bet-loop/v1.0.0.md"),
        "utf8",
      ),
      "company-os/sops/bet-loop/v1.0.1.md": fs.readFileSync(
        path.join(REPO, "company-os/sops/bet-loop/v1.0.1.md"),
        "utf8",
      ),
    };
    const server = await new Promise((resolve, reject) => {
      const http = createServer((req, res) => {
        const hit = Object.entries(files).find(([rel]) => req.url?.endsWith(rel));
        if (hit) {
          res.writeHead(200, { "Content-Type": "text/markdown" });
          res.end(hit[1]);
          return;
        }
        res.writeHead(404);
        res.end();
      });
      http.listen(0, "127.0.0.1", () => resolve(http));
      http.once("error", reject);
    });
    const addr = server.address();
    process.env.BOOTSTRAP_OS_DOCS_SOURCE = "published";
    process.env.BOOTSTRAP_OS_DOCS_BASE = `http://127.0.0.1:${addr.port}`;
    process.env.BOOTSTRAP_OS_ROOT = path.join(REPO, "missing-os-root");
    try {
      const sop = await getSop("bet-loop");
      assert.equal(sop.version, "1.0.1");
      assert.match(sop.body, /# Bet loop SOP v1.0.1/);
      const pinned = await getSop("bet-loop", "1.0.0");
      assert.match(pinned.body, /# Bet loop SOP v1.0.0/);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("hosted tools return the SOP and the same errors", async () => {
    const listed = JSON.parse((await callTool("bootstrap_list_sops", {})).raw);
    const row = listed.result.content[0];
    const list = JSON.parse(row.text);
    assert.equal(list[0].name, "bet-loop");
    assert.equal(list[0].version, "1.0.1");
    const got = parseToolText((await callTool("bootstrap_get_sop", { name: "bet-loop" })).raw);
    assert.equal(got.version, "1.0.1");
    assert.equal(got.sha256, sha256Hex(got.body));
    const pinned = parseToolText(
      (await callTool("bootstrap_get_sop", { name: "bet-loop", version: "1.0.0" })).raw,
    );
    assert.match(pinned.body, /unless you choose to extend it/);
    assert.notEqual(pinned.body, got.body);
    const missing = JSON.parse((await callTool("bootstrap_get_sop", { name: "nope" })).raw);
    assert.equal(missing.result.isError, true);
    assert.match(missing.result.content[0].text, /Valid names: bet-loop/);
    const badVersion = JSON.parse(
      (await callTool("bootstrap_get_sop", { name: "bet-loop", version: "0.1.0" })).raw,
    );
    assert.equal(badVersion.result.isError, true);
    assert.match(badVersion.result.content[0].text, /Valid versions: 1\.0\.0, 1\.0\.1/);
  });
});

import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { handleHostedReadFetch } from "../dist/hosted-handler.js";
import { HostedMembershipJourneyStore } from "../dist/hosted-journey-store.js";
import { ivelinMemoryFixture, setIdentityStoreForTests } from "../dist/identity.js";
import { setJourneyStoreForTests } from "../dist/journey.js";
import { getSop, listSops, setSopRpcForTests } from "../dist/sops.js";

const TOKEN = "bos_ivelin_fixture_token_ok";
const HIGH = {
  name: "alpha-sop",
  version: "1.10.0",
  published_at: "2026-10-30T00:00:00.000Z",
  sha256: "b".repeat(64),
  body: "fixture body ten",
};
const LOW = {
  name: "alpha-sop",
  version: "1.9.0",
  published_at: "2026-10-29T00:00:00.000Z",
  sha256: "a".repeat(64),
  body: "fixture body nine",
};

function catalog() {
  return {
    list: [
      {
        name: "alpha-sop",
        version: HIGH.version,
        published_at: HIGH.published_at,
        sha256: HIGH.sha256,
        versions: [
          { version: LOW.version, published_at: LOW.published_at, sha256: LOW.sha256 },
          { version: HIGH.version, published_at: HIGH.published_at, sha256: HIGH.sha256 },
        ],
      },
    ],
  };
}

function installRpc() {
  setSopRpcForTests(async (name, args) => {
    if (name === "bootstrap_os_list_sops") return catalog().list;
    if (name !== "bootstrap_os_get_sop") throw new Error(`unexpected rpc ${name}`);
    const sopName = String(args.p_name);
    if (sopName !== "alpha-sop") {
      return { error: "unknown_name", valid_names: ["alpha-sop"] };
    }
    if (args.p_version == null) return HIGH;
    if (args.p_version === "1.9.0") return LOW;
    if (args.p_version === "1.10.0") return HIGH;
    return { error: "unknown_version", valid_versions: ["1.9.0", "1.10.0"] };
  });
}

async function callTool(name, args, { bearer = false } = {}) {
  process.env.BOOTSTRAP_OS_DOCS_SOURCE = "local";
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (bearer) headers.Authorization = `Bearer ${TOKEN}`;
  setIdentityStoreForTests(ivelinMemoryFixture(TOKEN));
  setJourneyStoreForTests(new HostedMembershipJourneyStore(() => ["alpha"]));
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

describe("SOP tools", () => {
  after(() => {
    setSopRpcForTests(undefined);
    setIdentityStoreForTests(undefined);
    setJourneyStoreForTests(undefined);
    delete process.env.BOOTSTRAP_OS_DOCS_SOURCE;
    delete process.env.BOOTSTRAP_SUPABASE_URL;
    delete process.env.BOOTSTRAP_SUPABASE_ANON_KEY;
  });

  it("latest is the higher semver and a pin returns that body", async () => {
    installRpc();
    const list = await listSops();
    assert.equal(list[0].version, "1.10.0");
    assert.deepEqual(
      list[0].versions.map((row) => row.version),
      ["1.9.0", "1.10.0"],
    );
    const latest = await getSop("alpha-sop");
    const pinned = await getSop("alpha-sop", "1.9.0");
    assert.equal(latest.body, "fixture body ten");
    assert.equal(pinned.body, "fixture body nine");
    assert.equal(latest.sha256, HIGH.sha256);
  });

  it("unknown name and version list the valid set", async () => {
    installRpc();
    await assert.rejects(() => getSop("missing-sop"), /Unknown SOP "missing-sop". Valid names: alpha-sop\./);
    await assert.rejects(
      () => getSop("alpha-sop", "9.9.9"),
      /Unknown version "9.9.9" for SOP "alpha-sop". Valid versions: 1\.9\.0, 1\.10\.0\./,
    );
  });

  it("rejects traversal names through the same error", async () => {
    installRpc();
    const names = ["../../../etc/passwd", "/etc/passwd", "..%2f..%2fetc", "alpha-sop/../alpha-sop"];
    for (const name of names) {
      await assert.rejects(() => getSop(name), /Unknown SOP/);
      const { status, raw } = await callTool("bootstrap_get_sop", { name });
      assert.equal(status, 200, raw);
      const body = JSON.parse(raw);
      assert.equal(body.result.isError, true);
      assert.match(body.result.content[0].text, /Valid names: alpha-sop/);
      assert.doesNotMatch(body.result.content[0].text, /root:/);
    }
  });

  it("get_sop, list_sops, and get_doc succeed with no bearer", async () => {
    installRpc();
    const calls = [
      ["bootstrap_get_sop", { name: "alpha-sop" }],
      ["bootstrap_list_sops", {}],
      ["bootstrap_get_doc", { doc: "operating-system" }],
    ];
    for (const [name, args] of calls) {
      const { status, raw } = await callTool(name, args, { bearer: false });
      const body = JSON.parse(raw);
      assert.equal(status, 200, raw);
      assert.notEqual(body.result?.isError, true, raw);
    }
  });

  it("reads through the anon REST RPC when no test double is installed", async () => {
    setSopRpcForTests(undefined);
    const server = await new Promise((resolve, reject) => {
      const http = createServer((req, res) => {
        assert.equal(req.headers.authorization, "Bearer anon-key-fixture");
        let data = "";
        req.on("data", (chunk) => {
          data += chunk;
        });
        req.on("end", () => {
          const args = JSON.parse(data || "{}");
          res.writeHead(200, { "Content-Type": "application/json" });
          if (req.url.endsWith("/bootstrap_os_get_sop")) {
            if (args.p_name !== "alpha-sop") {
              res.end(JSON.stringify({ error: "unknown_name", valid_names: ["alpha-sop"] }));
              return;
            }
            res.end(JSON.stringify(HIGH));
            return;
          }
          res.end(JSON.stringify(catalog().list));
        });
      });
      http.listen(0, "127.0.0.1", () => resolve(http));
      http.once("error", reject);
    });
    const addr = server.address();
    process.env.BOOTSTRAP_SUPABASE_URL = `http://127.0.0.1:${addr.port}`;
    process.env.BOOTSTRAP_SUPABASE_ANON_KEY = "anon-key-fixture";
    try {
      const latest = await getSop("alpha-sop");
      assert.equal(latest.version, "1.10.0");
      const list = await listSops();
      assert.equal(list[0].name, "alpha-sop");
    } finally {
      await new Promise((resolve) => server.close(resolve));
      delete process.env.BOOTSTRAP_SUPABASE_URL;
      delete process.env.BOOTSTRAP_SUPABASE_ANON_KEY;
    }
  });

  it("publish-sop inserts the hash and refuses a duplicate without printing the key", async () => {
    const file = path.join(os.tmpdir(), `sop-fixture-${process.pid}.txt`);
    fs.writeFileSync(file, "fixture body alpha\n");
    const digest = crypto.createHash("sha256").update("fixture body alpha\n", "utf8").digest("hex");
    const secret = "service-role-secret-value";
    let posts = 0;
    const server = await new Promise((resolve, reject) => {
      const http = createServer((req, res) => {
        let data = "";
        req.on("data", (chunk) => {
          data += chunk;
        });
        req.on("end", () => {
          const auth = req.headers.authorization || "";
          assert.equal(auth, `Bearer ${secret}`);
          posts += 1;
          if (posts > 1) {
            res.writeHead(409, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ code: "23505", message: "duplicate key" }));
            return;
          }
          const row = JSON.parse(data);
          assert.equal(row.sha256, digest);
          assert.equal(row.name, "alpha-sop");
          res.writeHead(201, { "Content-Type": "application/json" });
          res.end(JSON.stringify([{ id: "11111111-1111-1111-1111-111111111111", sha256: digest }]));
        });
      });
      http.listen(0, "127.0.0.1", () => resolve(http));
      http.once("error", reject);
    });
    const addr = server.address();
    const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "scripts", "publish-sop.mjs");
    const run = (extra = []) =>
      new Promise((resolve) => {
        const child = spawn(process.execPath, [script, "alpha-sop", "1.0.0", file, ...extra], {
          env: {
            ...process.env,
            BOOTSTRAP_SUPABASE_URL: `http://127.0.0.1:${addr.port}`,
            BOOTSTRAP_SUPABASE_SERVICE_ROLE_KEY: secret,
          },
        });
        let out = "";
        let err = "";
        child.stdout.on("data", (chunk) => {
          out += chunk;
        });
        child.stderr.on("data", (chunk) => {
          err += chunk;
        });
        child.on("close", (code) => resolve({ code, out, err }));
      });
    try {
      const first = await run();
      assert.equal(first.code, 0, first.err);
      assert.match(first.out, /id 11111111-1111-1111-1111-111111111111/);
      assert.match(first.out, new RegExp(`sha256 ${digest}`));
      assert.doesNotMatch(`${first.out}\n${first.err}`, new RegExp(secret));
      const second = await run();
      assert.notEqual(second.code, 0);
      assert.match(second.err, /Refusing existing alpha-sop 1\.0\.0/);
      assert.doesNotMatch(`${second.out}\n${second.err}`, new RegExp(secret));
    } finally {
      fs.rmSync(file, { force: true });
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

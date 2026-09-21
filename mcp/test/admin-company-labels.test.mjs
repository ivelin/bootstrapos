/**
 * Admin company labels: Cos is not a blocker.
 * Missing label → create_idea fails closed; after label exists → create_idea works.
 * Fictional alpha / bravo only. Never supabase-pirin-ai. Never prod.
 */
import { after, afterEach, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { createJourneyStore, HostedMembershipJourneyStore } from "../dist/hosted-journey-store.js";
import { setJourneyStoreForTests } from "../dist/journey.js";
import { REPO_ROOT } from "./helpers.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOSTED_DOC = path.join(REPO_ROOT, "mcp", "docs", "HOSTED_IDENTITY.md");
const JOURNEY_DOC = path.join(REPO_ROOT, "mcp", "docs", "JOURNEY.md");
const QA_DOC = path.join(REPO_ROOT, "mcp", "QA.md");
const IDENTITY_SCHEMA = path.join(__dirname, "pglite", "identity-schema.sql");
const EMAIL = "founder@example.test";
const A_EMAIL = "mentee-a@example.test";
const A_UID = "11111111-1111-1111-1111-111111111111";

afterEach(() => {
  setJourneyStoreForTests(undefined);
  delete process.env.VERCEL_ENV;
  delete process.env.BOOTSTRAP_SUPABASE_URL;
  delete process.env.BOOTSTRAP_SUPABASE_ANON_KEY;
});

function actor(email) {
  return { authenticated: true, email, principal: email, identityStore: "memory" };
}

describe("admin company labels (docs + fail-closed create_idea)", () => {
  it("docs: admin may insert labels; Cos is not a required gate; PR agents do not touch prod", () => {
    const hosted = fs.readFileSync(HOSTED_DOC, "utf8");
    const journey = fs.readFileSync(JOURNEY_DOC, "utf8");
    const qa = fs.readFileSync(QA_DOC, "utf8");
    for (const body of [hosted, journey, qa]) {
      assert.match(body, /Admin \(or Cos on admin instruction\)/);
      assert.match(body, /Cos is not a required gate/);
      assert.doesNotMatch(body, /Cos must approve every (company create|label)/i);
    }
    assert.match(hosted, /## Admin company labels/);
    assert.match(hosted, /INSERT INTO public\.bootstrap_company_labels/);
    assert.match(hosted, /VALUES \('bravo'\)/);
    assert.match(hosted, /PR \/ cloud agents must \*\*not\*\* migrate, seed, or live-probe/);
    assert.match(hosted, /admin-company-labels\.test\.mjs/);
    assert.match(journey, /create_idea requires an \*\*existing\*\* company label/);
    assert.match(journey, /HOSTED_IDENTITY\.md#admin-company-labels/);
    assert.match(journey, /PR \/ cloud agents must \*\*not\*\* migrate, seed, or live-probe/);
    assert.match(qa, /admin-company-labels\.test\.mjs/);
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "mcp", "package.json"), "utf8"));
    assert.match(pkg.scripts["test:unit"], /test\/admin-company-labels\.test\.mjs/);
  });

  it("create_idea: missing label fails closed; after label exists it works (alpha/bravo)", async () => {
    const held = new Set(["alpha"]);
    const store = new HostedMembershipJourneyStore((a) =>
      a.email === EMAIL ? [...held] : [],
    );
    const founder = actor(EMAIL);

    const missing = await store.createIdea(founder, {
      companySlug: "bravo",
      ideaSlug: "second-bet",
      founderYes: true,
      why: "new 0-1 board after the label exists",
    });
    assert.equal(missing.ok, false);
    assert.match(String(missing.error), /company not visible/);

    held.add("bravo");
    const created = await store.createIdea(founder, {
      companySlug: "bravo",
      ideaSlug: "second-bet",
      founderYes: true,
      why: "new 0-1 board after the label exists",
    });
    assert.equal(created.ok, true, JSON.stringify(created));
    assert.equal(created.ideas[0].slug, "second-bet");
    assert.equal(created.company.slug, "bravo");
    assert.equal(created.ideas[0].clocks.currentGate, "hold");
  });

  it("hosted RPC: missing company is 400-class fail-closed (journey_rpc_failed:400)", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.BOOTSTRAP_SUPABASE_URL = "https://example.supabase.co";
    process.env.BOOTSTRAP_SUPABASE_ANON_KEY = "anon-key";
    const store = createJourneyStore("bearer-token-16xxxx");
    assert.equal(store?.kind, "supabase");
    const orig = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({ message: "company not visible" }), { status: 400 });
    try {
      const got = await store.createIdea(actor(EMAIL), {
        companySlug: "bravo",
        ideaSlug: "second-bet",
        founderYes: true,
      });
      assert.equal(got.ok, false);
      assert.equal(got.error, "journey_rpc_failed:400");
    } finally {
      globalThis.fetch = orig;
    }
  });
});

describe("admin company labels (PGlite held_label insert; never prod)", { concurrency: false }, () => {
  let db;

  before(async () => {
    db = new PGlite();
    await db.exec(fs.readFileSync(IDENTITY_SCHEMA, "utf8"));
  });

  after(async () => {
    await db?.close();
  });

  async function held(company) {
    await db.exec("RESET ROLE");
    await db.query("SELECT set_config('app.auth_uid', $1, false)", [A_UID]);
    await db.query("SELECT set_config('app.auth_email', $1, false)", [A_EMAIL]);
    const rows = await db.query("SELECT bootstrap_os_held_label($1) AS held", [company]);
    return rows.rows[0].held;
  }

  it("missing label is not held; admin insert of bootstrap_company_labels opens create_idea", async () => {
    assert.equal(await held("alpha"), true);
    assert.equal(await held("bravo"), false);

    await db.exec("RESET ROLE");
    await db.query(
      `INSERT INTO bootstrap_company_labels (id, mentee_id, label)
       SELECT $1, m.id, $2
       FROM bootstrap_mcp_mentees m
       WHERE m.email = $3`,
      ["la-bravo", "bravo", A_EMAIL],
    );

    assert.equal(await held("bravo"), true);
  });
});

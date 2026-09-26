/**
 * Isolated Postgres (PGlite). Never supabase-pirin-ai. Never prod.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA = path.join(__dirname, "pglite", "identity-schema.sql");

let db;

async function asReader(authUserId, sql) {
  await db.exec("RESET ROLE");
  await db.exec(`SELECT set_config('app.auth_uid', '${authUserId}', false)`);
  await db.exec("SET ROLE mentee_reader");
  const rows = await db.query(sql);
  await db.exec("RESET ROLE");
  return rows.rows;
}

async function labelsFor(authUserId) {
  const rows = await asReader(
    authUserId,
    "SELECT label FROM bootstrap_company_labels ORDER BY label",
  );
  return rows.map((r) => r.label);
}

async function menteeEmailsFor(authUserId) {
  const rows = await asReader(
    authUserId,
    "SELECT email FROM bootstrap_mcp_mentees ORDER BY email",
  );
  return rows.map((r) => r.email);
}

describe("PGlite identity RLS (isolated, never prod)", () => {
  before(async () => {
    db = new PGlite();
    await db.exec(fs.readFileSync(SCHEMA, "utf8"));
  });

  after(async () => {
    await db?.close();
  });

  it("fixture never names a hosted Supabase URL", () => {
    const schema = fs.readFileSync(SCHEMA, "utf8");
    assert.match(schema, /NEVER apply this to supabase-pirin-ai/);
    assert.doesNotMatch(schema, /supabase\.co/);
    assert.doesNotMatch(schema, /BOOTSTRAP_SUPABASE_/);
  });

  it("FORCE RLS: A sees alpha only; B sees bravo only; empty uid sees none", async () => {
    assert.deepEqual(await menteeEmailsFor("11111111-1111-1111-1111-111111111111"), [
      "mentee-a@example.test",
    ]);
    assert.deepEqual(await labelsFor("11111111-1111-1111-1111-111111111111"), ["alpha"]);
    assert.deepEqual(await labelsFor("22222222-2222-2222-2222-222222222222"), ["bravo"]);
    assert.deepEqual(await menteeEmailsFor(""), []);
    assert.deepEqual(await labelsFor(""), []);
    const ivelin = await labelsFor("33333333-3333-3333-3333-333333333333");
    assert.deepEqual(ivelin, ["alpha", "bravo", "charlie"]);
  });

  it("fail-closed labels RPC: invited JWT shape authenticates; uninvited does not", async () => {
    await db.exec("RESET ROLE");
    await db.exec("SELECT set_config('app.auth_uid', '33333333-3333-3333-3333-333333333333', false)");
    await db.exec("SELECT set_config('app.auth_email', 'founder@example.test', false)");
    const invited = (await db.query("SELECT bootstrap_mcp_my_labels() AS body")).rows[0].body;
    assert.equal(invited.authenticated, true);
    assert.equal(invited.email, "founder@example.test");
    assert.deepEqual(invited.labels, ["alpha", "bravo", "charlie"]);

    await db.exec("SELECT set_config('app.auth_uid', '99999999-9999-9999-9999-999999999999', false)");
    await db.exec("SELECT set_config('app.auth_email', 'stranger@example.test', false)");
    const uninvited = (await db.query("SELECT bootstrap_mcp_my_labels() AS body")).rows[0].body;
    assert.equal(uninvited.authenticated, false);
    assert.equal(uninvited.reason, "not_invited");
    assert.deepEqual(uninvited.labels, []);
    assert.ok(!JSON.stringify(uninvited).includes("charlie"));
  });

  it("email-only first-user SQL insert then OAuth binds auth_user_id", async () => {
    await db.exec("RESET ROLE");
    await db.exec("SELECT set_config('app.auth_uid', '44444444-4444-4444-4444-444444444444', false)");
    await db.exec("SELECT set_config('app.auth_email', 'first@example.test', false)");
    const first = (await db.query("SELECT bootstrap_mcp_my_labels() AS body")).rows[0].body;
    assert.equal(first.authenticated, true);
    assert.equal(first.email, "first@example.test");
    assert.deepEqual(first.labels, ["beachhead"]);
    const bound = (
      await db.query("SELECT auth_user_id FROM bootstrap_mcp_mentees WHERE email = 'first@example.test'")
    ).rows[0];
    assert.equal(bound.auth_user_id, "44444444-4444-4444-4444-444444444444");
  });

  it("invite_member SQL RPC: unqualified label is 42702; qualified label invites alpha", async () => {
    await db.exec("RESET ROLE");
    await db.exec(`
CREATE OR REPLACE FUNCTION bootstrap_mcp_invite_member_ambiguous(p_email text, p_company_label text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  inviter_id text;
  label text;
BEGIN
  SELECT id INTO inviter_id FROM bootstrap_mcp_mentees WHERE email = 'founder@example.test';
  label := lower(p_company_label);
  IF NOT EXISTS (
    SELECT 1 FROM bootstrap_company_labels
    WHERE mentee_id = inviter_id AND label = label
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'label_not_held');
  END IF;
  RETURN jsonb_build_object('ok', true, 'email', p_email);
END;
$$;
`);
    try {
      await db.query("SELECT bootstrap_mcp_invite_member_ambiguous($1, $2) AS body", [
        "member@example.test",
        "alpha",
      ]);
      assert.fail("ambiguous label = label must raise 42702");
    } catch (e) {
      assert.match(String(e.message), /column reference "label" is ambiguous/);
      assert.equal(e.code, "42702");
    }

    await db.exec("SELECT set_config('app.auth_uid', '33333333-3333-3333-3333-333333333333', false)");
    await db.exec("SELECT set_config('app.auth_email', 'founder@example.test', false)");
    const invited = (
      await db.query("SELECT bootstrap_mcp_invite_member($1, $2) AS body", [
        "member@example.test",
        "alpha",
      ])
    ).rows[0].body;
    assert.equal(invited.ok, true, JSON.stringify(invited));
    assert.equal(invited.card.card, "accept_invite");
    assert.equal(invited.card.companyWorkspace, "alpha");
    assert.equal(invited.card.to.email, "member@example.test");
    assert.equal(invited.authCard.card, "invite_signup");
    assert.equal(invited.queuedMail.from, "bootstrap@pirin.ai");
    assert.match(invited.card.inviteToken, /^inv_/);
    assert.equal(invited.card.inviteToken.length, 4 + 48);
    assert.doesNotMatch(JSON.stringify(invited), /42702|ambiguous|42883|gen_random_bytes/);

    await db.exec("SELECT set_config('app.auth_uid', '11111111-1111-1111-1111-111111111111', false)");
    await db.exec("SELECT set_config('app.auth_email', 'mentee-a@example.test', false)");
    const cross = (
      await db.query("SELECT bootstrap_mcp_invite_member($1, $2) AS body", [
        "other@example.test",
        "bravo",
      ])
    ).rows[0].body;
    assert.deepEqual(cross, { ok: false, reason: "label_not_held" });
  });

  it("invite_member token generation: public-only search_path is 42883; extensions path succeeds", async () => {
    const schema = fs.readFileSync(SCHEMA, "utf8");
    assert.match(schema, /CREATE SCHEMA IF NOT EXISTS extensions/);
    assert.match(schema, /CREATE OR REPLACE FUNCTION extensions\.gen_random_bytes/);
    assert.match(schema, /SET search_path = public, extensions/);
    assert.match(schema, /encode\(extensions\.gen_random_bytes\(24\), 'hex'\)/);
    assert.doesNotMatch(schema, /CREATE OR REPLACE FUNCTION (public\.)?gen_random_bytes/);

    await db.exec("RESET ROLE");
    await db.exec(`
CREATE OR REPLACE FUNCTION bootstrap_mcp_invite_member_public_only_bytes()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RETURN encode(gen_random_bytes(24), 'hex');
END;
$$;
`);
    try {
      await db.query("SELECT bootstrap_mcp_invite_member_public_only_bytes() AS token");
      assert.fail("public-only search_path must not see extensions.gen_random_bytes");
    } catch (e) {
      assert.match(String(e.message), /gen_random_bytes/);
      assert.equal(e.code, "42883");
    }

    const qualified = (
      await db.query("SELECT encode(extensions.gen_random_bytes(24), 'hex') AS token")
    ).rows[0].token;
    assert.equal(qualified.length, 48);

    await db.exec("SELECT set_config('app.auth_uid', '33333333-3333-3333-3333-333333333333', false)");
    await db.exec("SELECT set_config('app.auth_email', 'founder@example.test', false)");
    const invited = (
      await db.query("SELECT bootstrap_mcp_invite_member($1, $2) AS body", [
        "bill@example.test",
        "alpha",
      ])
    ).rows[0].body;
    assert.equal(invited.ok, true, JSON.stringify(invited));
    assert.match(invited.card.inviteToken, /^inv_/);
    assert.equal(invited.card.inviteToken.length, 4 + 48);
    assert.doesNotMatch(JSON.stringify(invited), /42883|gen_random_bytes does not exist/);
  });

  it("FORCE RLS: mentee_reader cannot see invite rows or outbox", async () => {
    await db.exec("RESET ROLE");
    await db.query(
      `INSERT INTO bootstrap_mcp_invites
        (id, invitee_email, company_label, invited_by_mentee_id, invited_by_email, token_hash, expires_at)
       VALUES ('inv-hidden', 'hidden-invitee@example.test', 'alpha', 'mentee-ivelin', 'founder@example.test', 'hash-hidden', now() + interval '1 day')`,
    );
    const hiddenInvites = await asReader(
      "33333333-3333-3333-3333-333333333333",
      "SELECT id FROM bootstrap_mcp_invites",
    );
    assert.deepEqual(hiddenInvites, []);
    const outbox = await asReader(
      "33333333-3333-3333-3333-333333333333",
      "SELECT id FROM bootstrap_mcp_invite_outbox",
    );
    assert.deepEqual(outbox, []);
  });

  it("verify_invite: pending ok; opaque fail; mentee_reader cannot execute", async () => {
    await db.exec("RESET ROLE");
    await db.exec("SELECT set_config('app.auth_uid', '33333333-3333-3333-3333-333333333333', false)");
    await db.exec("SELECT set_config('app.auth_email', 'founder@example.test', false)");
    const invited = (
      await db.query("SELECT bootstrap_mcp_invite_member($1, $2) AS body", [
        "member@example.test",
        "alpha",
      ])
    ).rows[0].body;
    const token = invited.card.inviteToken;
    const ok = (await db.query("SELECT bootstrap_mcp_verify_invite($1) AS body", [token])).rows[0]
      .body;
    assert.deepEqual(ok, {
      ok: true,
      invitee_email: "member@example.test",
      company_label: "alpha",
      inviter_email: "founder@example.test",
    });
    const bad = (await db.query("SELECT bootstrap_mcp_verify_invite($1) AS body", [
      "inv_not_a_real_invite_token_xx",
    ])).rows[0].body;
    assert.deepEqual(bad, { ok: false });
    assert.equal("reason" in bad, false);

    const mail = (
      await db.query(
        "SELECT payload->>'mailFrom' AS mail_from, payload->>'signupUrl' AS signup_url FROM bootstrap_mcp_invite_outbox WHERE channel = 'email' ORDER BY created_at DESC LIMIT 1",
      )
    ).rows[0];
    assert.equal(mail.mail_from, "bootstrap@pirin.ai");
    assert.match(mail.signup_url, /\/bootstrap-os\/login\?invite=inv_/);

    try {
      await asReader(
        "33333333-3333-3333-3333-333333333333",
        "SELECT bootstrap_mcp_verify_invite('inv_not_a_real_invite_token_xx')",
      );
      assert.fail("mentee_reader must not execute verify_invite");
    } catch (e) {
      assert.match(String(e.message), /permission denied|execute/i);
    }
  });

  it("existing user second workspace + already_member + pending unique", async () => {
    await db.exec("RESET ROLE");
    await db.exec("SELECT set_config('app.auth_uid', '33333333-3333-3333-3333-333333333333', false)");
    await db.exec("SELECT set_config('app.auth_email', 'founder@example.test', false)");

    const self = (
      await db.query("SELECT bootstrap_mcp_invite_member($1, $2) AS body", [
        "founder@example.test",
        "alpha",
      ])
    ).rows[0].body;
    assert.deepEqual(self, { ok: false, reason: "already_member" });

    const invited = (
      await db.query("SELECT bootstrap_mcp_invite_member($1, $2) AS body", [
        "mentee-a@example.test",
        "charlie",
      ])
    ).rows[0].body;
    assert.equal(invited.ok, true, JSON.stringify(invited));
    const firstToken = invited.card.inviteToken;

    const rotated = (
      await db.query("SELECT bootstrap_mcp_invite_member($1, $2) AS body", [
        "mentee-a@example.test",
        "charlie",
      ])
    ).rows[0].body;
    assert.equal(rotated.ok, true, JSON.stringify(rotated));
    assert.notEqual(rotated.card.inviteToken, firstToken);

    const pendingCount = (
      await db.query(
        `SELECT count(*)::int AS n FROM bootstrap_mcp_invites
         WHERE invitee_email = 'mentee-a@example.test' AND company_label = 'charlie' AND accepted_at IS NULL`,
      )
    ).rows[0].n;
    assert.equal(pendingCount, 1);

    await db.exec("SELECT set_config('app.auth_uid', '11111111-1111-1111-1111-111111111111', false)");
    await db.exec("SELECT set_config('app.auth_email', 'mentee-a@example.test', false)");
    const accepted = (
      await db.query("SELECT bootstrap_mcp_accept_invite($1) AS body", [rotated.card.inviteToken])
    ).rows[0].body;
    assert.equal(accepted.ok, true, JSON.stringify(accepted));
    assert.deepEqual(accepted.labels, ["alpha", "charlie"]);

    await db.exec("SELECT set_config('app.auth_uid', '33333333-3333-3333-3333-333333333333', false)");
    await db.exec("SELECT set_config('app.auth_email', 'founder@example.test', false)");
    const again = (
      await db.query("SELECT bootstrap_mcp_invite_member($1, $2) AS body", [
        "mentee-a@example.test",
        "charlie",
      ])
    ).rows[0].body;
    assert.deepEqual(again, { ok: false, reason: "already_member" });
  });
});

const MIGRATIONS = path.join(__dirname, "..", "supabase", "migrations");

function latestAcceptInviteMigration() {
  const files = fs.readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql")).sort();
  let hit = null;
  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS, file), "utf8");
    const re =
      /CREATE OR REPLACE FUNCTION public\.bootstrap_mcp_accept_invite\(p_token text\)[\s\S]*?\n\$\$;/g;
    let match;
    while ((match = re.exec(sql))) {
      hit = { file, sql, fn: match[0] };
    }
  }
  if (!hit) throw new Error("no bootstrap_mcp_accept_invite migration");
  return hit;
}

function menteeVarFromMigration(fn) {
  const into = fn.match(
    /SELECT id INTO ([a-z_][a-z0-9_]*)\s+FROM public\.bootstrap_mcp_mentees\s+WHERE email = invite\.invitee_email/,
  );
  if (!into) throw new Error("accept_invite is missing SELECT id INTO … mentees");
  return into[1];
}

function pgliteAcceptWithMigrationVar(varName) {
  if (!/^[a-z_][a-z0-9_]*$/.test(varName)) {
    throw new Error(`unsafe accept_invite variable ${varName}`);
  }
  const schema = fs.readFileSync(SCHEMA, "utf8");
  const match = schema.match(
    /CREATE OR REPLACE FUNCTION bootstrap_mcp_accept_invite\(p_token text\)[\s\S]*?\n\$\$;/,
  );
  if (!match) throw new Error("pglite bootstrap_mcp_accept_invite missing");
  if (!match[0].includes("found_mentee_id")) {
    throw new Error("pglite accept analog no longer uses found_mentee_id");
  }
  return match[0].replaceAll("found_mentee_id", varName);
}

describe("PGlite accept_invite mentee_id (isolated, never prod)", () => {
  let acceptDb;

  before(async () => {
    acceptDb = new PGlite();
    await acceptDb.exec(fs.readFileSync(SCHEMA, "utf8"));
  });

  after(async () => {
    await acceptDb?.close();
  });

  it("accept_invite binds founder@example.test to alpha without 42702", async () => {
    const latest = latestAcceptInviteMigration();
    assert.match(latest.fn, /RETURNS jsonb/);
    assert.match(latest.fn, /LANGUAGE plpgsql/);
    assert.match(latest.fn, /SECURITY DEFINER/);
    assert.match(latest.fn, /SET search_path = public/);
    assert.match(
      latest.sql,
      /REVOKE ALL ON FUNCTION public\.bootstrap_mcp_accept_invite\(text\) FROM PUBLIC, anon/,
    );
    assert.match(
      latest.sql,
      /GRANT EXECUTE ON FUNCTION public\.bootstrap_mcp_accept_invite\(text\) TO authenticated/,
    );
    assert.doesNotMatch(
      latest.sql,
      /GRANT EXECUTE ON FUNCTION public\.bootstrap_mcp_accept_invite\(text\) TO anon/,
    );
    assert.doesNotMatch(latest.sql, /supabase\.co/);

    const menteeVar = menteeVarFromMigration(latest.fn);
    await acceptDb.exec(pgliteAcceptWithMigrationVar(menteeVar));

    const token = "inv_example_test_token_alpha";
    await acceptDb.query(
      `INSERT INTO bootstrap_mcp_invites (
         id, invitee_email, company_label, invited_by_mentee_id, invited_by_email, token_hash, expires_at
       ) VALUES (
         'invite-founder-alpha', 'founder@example.test', 'alpha', 'mentee-ivelin', 'founder@example.test',
         bootstrap_mcp_hash_token($1), now() + interval '7 days'
       )`,
      [token],
    );
    await acceptDb.exec("RESET ROLE");
    await acceptDb.exec(
      "SELECT set_config('app.auth_uid', '33333333-3333-3333-3333-333333333333', false)",
    );
    await acceptDb.exec("SELECT set_config('app.auth_email', 'founder@example.test', false)");

    let accepted;
    try {
      accepted = (
        await acceptDb.query("SELECT bootstrap_mcp_accept_invite($1) AS body", [token])
      ).rows[0].body;
    } catch (e) {
      assert.fail(`accept_invite raised ${e.code}: ${e.message}`);
    }
    assert.equal(accepted.ok, true, JSON.stringify(accepted));
    assert.equal(accepted.email, "founder@example.test");
    assert.equal(accepted.companyWorkspace, "alpha");
    assert.deepEqual(accepted.labels, ["alpha", "bravo", "charlie"]);
    assert.doesNotMatch(JSON.stringify(accepted), /42702|ambiguous/);
    assert.notEqual(menteeVar, "mentee_id");

    const row = (
      await acceptDb.query(
        "SELECT accepted_at IS NOT NULL AS used FROM bootstrap_mcp_invites WHERE id = 'invite-founder-alpha'",
      )
    ).rows[0];
    assert.equal(row.used, true);

    const replay = (
      await acceptDb.query("SELECT bootstrap_mcp_accept_invite($1) AS body", [token])
    ).rows[0].body;
    assert.deepEqual(replay, { ok: false, reason: "invite_already_used" });
  });
});

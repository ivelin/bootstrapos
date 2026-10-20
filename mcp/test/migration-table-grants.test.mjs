import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = path.join(__dirname, "..", "supabase", "migrations");
const FIRST_NEW_MIGRATION = "20261019";

const GRANDFATHERED = [
  "20260829_bootstrap_mcp_identity.sql",
  "20260902_bootstrap_os_journey.sql",
  "20260909_bootstrap_mcp_fail_closed_invite.sql",
  "20260910_bootstrap_mcp_invite_accept.sql",
  "20260910_bootstrap_mcp_invite_qualify_label.sql",
  "20260911_bootstrap_mcp_invite_pgcrypto_search_path.sql",
  "20260911_bootstrap_mcp_invite_verify_email_outbox.sql",
  "20260912_bootstrap_mcp_invite_existing_member.sql",
  "20260915_bootstrap_os_journey_rpcs.sql",
  "20260916_bootstrap_os_get_journey_log.sql",
  "20260916_bootstrap_os_import_local_boards.sql",
  "20260917_bootstrap_os_get_journey_owners.sql",
  "20260918_bootstrap_os_create_idea.sql",
  "20260919_bootstrap_os_create_idea_disambiguate_slug.sql",
  "20260920_bootstrap_os_board_subscribers.sql",
  "20260921_bootstrap_os_list_provenance.sql",
  "20260922_bootstrap_os_portfolio_score.sql",
  "20260923_bootstrap_os_implicit_loop.sql",
  "20260925_bootstrap_os_one_control_plane.sql",
  "20260926_bootstrap_os_initiative_report_card.sql",
  "20260927_bootstrap_os_dual_read_dead.sql",
  "20260928_bootstrap_os_roles.sql",
  "20260929_bootstrap_mcp_accept_invite_disambiguate_mentee_id.sql",
  "20260930_bootstrap_os_submit_feedback.sql",
  "20261015_bootstrap_mcp_accept_on_verified_signin.sql",
];

function stripSqlNoise(sql) {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    if (sql[i] === "-" && sql[i + 1] === "-") {
      const nl = sql.indexOf("\n", i);
      i = nl < 0 ? sql.length : nl;
      out += " ";
      continue;
    }
    if (sql[i] === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end < 0 ? sql.length : end + 2;
      out += " ";
      continue;
    }
    if (sql[i] === "'") {
      i += 1;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          i += 2;
          continue;
        }
        if (sql[i] === "'") {
          i += 1;
          break;
        }
        i += 1;
      }
      out += "''";
      continue;
    }
    if (sql[i] === "$") {
      const tag = sql.slice(i).match(/^\$[a-zA-Z0-9_]*\$/);
      if (tag) {
        const end = sql.indexOf(tag[0], i + tag[0].length);
        i = end < 0 ? sql.length : end + tag[0].length;
        out += " ";
        continue;
      }
    }
    out += sql[i];
    i += 1;
  }
  return out;
}

function createdTables(sql) {
  const tables = [];
  const createRe =
    /create\s+(?:unlogged\s+|temp(?:orary)?\s+)?table(?:\s+if\s+not\s+exists)?\s+(?:([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)|([a-z_][a-z0-9_]*))/gi;
  for (const match of sql.matchAll(createRe)) {
    if (!match[1]) return { error: "CREATE TABLE must name a schema-qualified table" };
    tables.push(match[1]);
  }
  for (const match of sql.matchAll(/\bselect\b[^;]*?\binto\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)/gi)) {
    tables.push(match[1]);
  }
  return { tables };
}

function createdViews(sql) {
  return [
    ...sql.matchAll(/create(?:\s+or\s+replace)?\s+view\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)/gi),
  ].map((match) => match[1]);
}

function mentions(statement, name) {
  return new RegExp(`\\b${name.replace(/[.]/g, "\\.")}\\b`, "i").test(statement);
}

function namesRole(text, role) {
  return new RegExp(`\\b${role}\\b`, "i").test(text);
}

function grantsTo(statement, role) {
  return /^\s*grant\b/i.test(statement) && new RegExp(`\\bto\\b[\\s\\S]*\\b${role}\\b`, "i").test(statement);
}

function relationProblems(sql) {
  const cleaned = stripSqlNoise(sql);
  const parsed = createdTables(cleaned);
  if (parsed.error) return [parsed.error];
  const statements = cleaned.split(";");
  const problems = [];

  for (const table of parsed.tables) {
    let enabled = false;
    let forced = false;
    let revokedAnon = false;
    let revokedAuth = false;
    let opensAnon = false;
    let grantAllAuth = false;
    for (const statement of statements) {
      if (!mentions(statement, table)) continue;
      if (/\bdisable\s+row\s+level\s+security/i.test(statement)) enabled = false;
      else if (/\benable\s+row\s+level\s+security/i.test(statement)) enabled = true;
      if (/\bno\s+force\s+row\s+level\s+security/i.test(statement)) forced = false;
      else if (/\bforce\s+row\s+level\s+security/i.test(statement)) forced = true;
      if (/^\s*revoke\b/i.test(statement) && namesRole(statement, "anon")) revokedAnon = true;
      if (/^\s*revoke\b/i.test(statement) && namesRole(statement, "authenticated")) revokedAuth = true;
      if (grantsTo(statement, "anon")) opensAnon = true;
      if (/^\s*grant\s+all\b/i.test(statement) && grantsTo(statement, "authenticated")) grantAllAuth = true;
    }
    if (!enabled) problems.push(`${table} lacks ENABLE ROW LEVEL SECURITY`);
    if (!forced) problems.push(`${table} lacks FORCE ROW LEVEL SECURITY`);
    if (!revokedAnon || !revokedAuth) {
      problems.push(`${table} lacks an explicit GRANT or REVOKE for anon and authenticated`);
    }
    if (opensAnon || grantAllAuth) problems.push(`${table} grants anon or GRANT ALL to authenticated`);
  }

  for (const view of createdViews(cleaned)) {
    let invoker = false;
    let revokedAnon = false;
    let revokedAuth = false;
    for (const statement of statements) {
      if (!mentions(statement, view)) continue;
      if (/security_invoker\s*=\s*(true|on)\b/i.test(statement)) invoker = true;
      if (/security_invoker\s*=\s*(false|off)\b/i.test(statement)) invoker = false;
      if (/^\s*revoke\b/i.test(statement) && namesRole(statement, "anon")) revokedAnon = true;
      if (/^\s*revoke\b/i.test(statement) && namesRole(statement, "authenticated")) revokedAuth = true;
    }
    if (!invoker) problems.push(`${view} lacks security_invoker`);
    if (!revokedAnon || !revokedAuth) {
      problems.push(`${view} lacks an explicit GRANT or REVOKE for anon and authenticated`);
    }
  }

  return problems;
}

function newMigrationFiles() {
  return fs
    .readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith(".sql") && name.slice(0, 8) >= FIRST_NEW_MIGRATION)
    .sort();
}

const LOCKED_TABLE = `
  CREATE TABLE public.alpha_widget (id int);
  ALTER TABLE public.alpha_widget ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.alpha_widget FORCE ROW LEVEL SECURITY;
  REVOKE ALL ON TABLE public.alpha_widget FROM PUBLIC, anon, authenticated;
`;

describe("new migration tables state RLS and grants", () => {
  it("fails a table that skips RLS or skips anon and authenticated", () => {
    assert.deepEqual(
      relationProblems(`
        CREATE TABLE public.alpha_widget (id int);
        REVOKE ALL ON TABLE public.alpha_widget FROM anon, authenticated;
      `),
      [
        "public.alpha_widget lacks ENABLE ROW LEVEL SECURITY",
        "public.alpha_widget lacks FORCE ROW LEVEL SECURITY",
      ],
    );
    assert.deepEqual(
      relationProblems(`
        CREATE TABLE public.alpha_widget (id int);
        ALTER TABLE public.alpha_widget ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.alpha_widget FORCE ROW LEVEL SECURITY;
      `),
      ["public.alpha_widget lacks an explicit GRANT or REVOKE for anon and authenticated"],
    );
    assert.deepEqual(relationProblems("CREATE TABLE alpha_widget (id int);"), [
      "CREATE TABLE must name a schema-qualified table",
    ]);
    assert.deepEqual(relationProblems(LOCKED_TABLE), []);
  });

  it("fails CREATE UNLOGGED TABLE without row level security", () => {
    const problems = relationProblems("CREATE UNLOGGED TABLE public.alpha_widget (id int);");
    assert.ok(problems.some((line) => line.includes("public.alpha_widget lacks ENABLE ROW LEVEL SECURITY")));
  });

  it("fails CREATE TEMP TABLE without row level security", () => {
    const problems = relationProblems("CREATE TEMP TABLE public.alpha_widget (id int);");
    assert.ok(problems.some((line) => line.includes("public.alpha_widget lacks ENABLE ROW LEVEL SECURITY")));
  });

  it("fails SELECT INTO a schema-qualified table", () => {
    const problems = relationProblems("SELECT 1 AS id INTO public.alpha_widget;");
    assert.ok(problems.some((line) => line.includes("public.alpha_widget lacks ENABLE ROW LEVEL SECURITY")));
  });

  it("fails a later DISABLE ROW LEVEL SECURITY", () => {
    const problems = relationProblems(`
      ${LOCKED_TABLE}
      ALTER TABLE public.alpha_widget DISABLE ROW LEVEL SECURITY;
    `);
    assert.deepEqual(problems, ["public.alpha_widget lacks ENABLE ROW LEVEL SECURITY"]);
  });

  it("fails a later NO FORCE ROW LEVEL SECURITY", () => {
    const problems = relationProblems(`
      ${LOCKED_TABLE}
      ALTER TABLE public.alpha_widget NO FORCE ROW LEVEL SECURITY;
    `);
    assert.deepEqual(problems, ["public.alpha_widget lacks FORCE ROW LEVEL SECURITY"]);
  });

  it("fails a later GRANT ALL to anon", () => {
    const problems = relationProblems(`
      ${LOCKED_TABLE}
      GRANT ALL ON TABLE public.alpha_widget TO anon;
    `);
    assert.deepEqual(problems, ["public.alpha_widget grants anon or GRANT ALL to authenticated"]);
  });

  it("fails a view over a protected table without security_invoker and revokes", () => {
    const problems = relationProblems(`
      ${LOCKED_TABLE}
      CREATE VIEW public.alpha_widget_v AS SELECT id FROM public.alpha_widget;
    `);
    assert.deepEqual(problems, [
      "public.alpha_widget_v lacks security_invoker",
      "public.alpha_widget_v lacks an explicit GRANT or REVOKE for anon and authenticated",
    ]);
    assert.deepEqual(
      relationProblems(`
        ${LOCKED_TABLE}
        CREATE VIEW public.alpha_widget_v WITH (security_invoker = true) AS SELECT id FROM public.alpha_widget;
        REVOKE ALL ON public.alpha_widget_v FROM anon, authenticated;
      `),
      [],
    );
  });

  it("ignores RLS and revoke lines that exist only inside string literals", () => {
    const problems = relationProblems(`
      CREATE TABLE public.alpha_widget (id int);
      SELECT 'ALTER TABLE public.alpha_widget ENABLE ROW LEVEL SECURITY';
      SELECT 'ALTER TABLE public.alpha_widget FORCE ROW LEVEL SECURITY';
      SELECT 'REVOKE ALL ON TABLE public.alpha_widget FROM anon, authenticated';
    `);
    assert.ok(problems.some((line) => line.includes("lacks ENABLE ROW LEVEL SECURITY")));
    assert.ok(problems.some((line) => line.includes("lacks an explicit GRANT or REVOKE")));
    assert.deepEqual(
      relationProblems(`
        ${LOCKED_TABLE}
        SELECT 'ALTER TABLE public.alpha_widget DISABLE ROW LEVEL SECURITY';
        SELECT 'GRANT ALL ON TABLE public.alpha_widget TO anon';
      `),
      [],
    );
  });

  it("leaves migrations before 20261019 grandfathered and does not scan them", () => {
    const older = fs
      .readdirSync(MIGRATIONS)
      .filter((name) => name.endsWith(".sql") && name.slice(0, 8) < FIRST_NEW_MIGRATION)
      .sort();
    assert.deepEqual(older, GRANDFATHERED);
    const scanned = new Set(newMigrationFiles());
    for (const name of GRANDFATHERED) assert.equal(scanned.has(name), false);
  });

  it("checks every migration from 20261019 on, including the rate-limit tables", () => {
    const files = newMigrationFiles();
    assert.ok(files.includes("20261019_bootstrap_rate_limit.sql"));
    const failures = [];
    for (const name of files) {
      const sql = fs.readFileSync(path.join(MIGRATIONS, name), "utf8");
      for (const problem of relationProblems(sql)) failures.push(`${name}: ${problem}`);
    }
    assert.deepEqual(failures, []);
    const rate = stripSqlNoise(
      fs.readFileSync(path.join(MIGRATIONS, "20261019_bootstrap_rate_limit.sql"), "utf8"),
    );
    assert.deepEqual(createdTables(rate).tables, [
      "public.bootstrap_rate_window",
      "public.bootstrap_rate_cap",
      "public.bootstrap_request_cap",
    ]);
  });
});

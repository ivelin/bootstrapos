import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

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

function emptyTableSecurity() {
  return {
    enabled: false,
    forced: false,
    revokedAnon: false,
    revokedAuth: false,
    opensAnon: false,
    grantAllAuth: false,
  };
}

function evalTableSecurity(table, statements, initial) {
  const sec = { ...initial };
  for (const statement of statements) {
    if (!mentions(statement, table)) continue;
    if (/\bdisable\s+row\s+level\s+security/i.test(statement)) sec.enabled = false;
    else if (/\benable\s+row\s+level\s+security/i.test(statement)) sec.enabled = true;
    if (/\bno\s+force\s+row\s+level\s+security/i.test(statement)) sec.forced = false;
    else if (/\bforce\s+row\s+level\s+security/i.test(statement)) sec.forced = true;
    if (/^\s*revoke\b/i.test(statement) && namesRole(statement, "anon")) sec.revokedAnon = true;
    if (/^\s*revoke\b/i.test(statement) && namesRole(statement, "authenticated")) sec.revokedAuth = true;
    if (grantsTo(statement, "anon")) sec.opensAnon = true;
    if (/^\s*grant\s+all\b/i.test(statement) && grantsTo(statement, "authenticated")) sec.grantAllAuth = true;
  }
  return sec;
}

function securityProblems(table, sec) {
  const problems = [];
  if (!sec.enabled) problems.push(`${table} lacks ENABLE ROW LEVEL SECURITY`);
  if (!sec.forced) problems.push(`${table} lacks FORCE ROW LEVEL SECURITY`);
  if (!sec.revokedAnon || !sec.revokedAuth) {
    problems.push(`${table} lacks an explicit GRANT or REVOKE for anon and authenticated`);
  }
  if (sec.opensAnon || sec.grantAllAuth) problems.push(`${table} grants anon or GRANT ALL to authenticated`);
  return problems;
}

function alterAddColumnTables(cleaned) {
  const tables = [];
  for (const match of cleaned.matchAll(
    /alter\s+table\s+(?:only\s+)?(?:if\s+exists\s+)?([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)\s+add\s+column\b/gi,
  )) {
    tables.push(match[1]);
  }
  return tables;
}

function mergeMigrationIntoBaseline(baseline, sql) {
  const cleaned = stripSqlNoise(sql);
  const parsed = createdTables(cleaned);
  if (parsed.error) return;
  const statements = cleaned.split(";");
  const createdInFile = parsed.tables;
  const createdKeys = new Set(createdInFile.map((name) => name.toLowerCase()));

  const checkTables = [...createdInFile];
  for (const table of alterAddColumnTables(cleaned)) {
    if (!checkTables.some((name) => name.toLowerCase() === table.toLowerCase())) checkTables.push(table);
  }
  for (const match of cleaned.matchAll(
    /alter\s+table\s+(?:only\s+)?(?:if\s+exists\s+)?([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)/gi,
  )) {
    const table = match[1];
    if (!checkTables.some((name) => name.toLowerCase() === table.toLowerCase())) checkTables.push(table);
  }

  for (const table of checkTables) {
    const key = table.toLowerCase();
    const initial = createdKeys.has(key) ? emptyTableSecurity() : (baseline.get(key) ?? emptyTableSecurity());
    baseline.set(key, evalTableSecurity(table, statements, initial));
  }
}

function buildBaselineBeforeScan() {
  const baseline = new Map();
  const older = fs
    .readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith(".sql") && name.slice(0, 8) < FIRST_NEW_MIGRATION)
    .sort();
  for (const name of older) {
    mergeMigrationIntoBaseline(baseline, fs.readFileSync(path.join(MIGRATIONS, name), "utf8"));
  }
  return baseline;
}

function relationProblems(sql, priorSecurity = null) {
  const cleaned = stripSqlNoise(sql);
  const parsed = createdTables(cleaned);
  if (parsed.error) return [parsed.error];
  const statements = cleaned.split(";");
  const problems = [];
  const prior = priorSecurity ?? new Map();

  const createdInFile = parsed.tables;
  const createdKeys = new Set(createdInFile.map((name) => name.toLowerCase()));

  const tables = [...createdInFile];
  for (const table of alterAddColumnTables(cleaned)) {
    if (!tables.some((name) => name.toLowerCase() === table.toLowerCase())) tables.push(table);
  }

  for (const table of tables) {
    const key = table.toLowerCase();
    const isNewInFile = createdKeys.has(key);
    const initial = isNewInFile ? emptyTableSecurity() : (prior.get(key) ?? emptyTableSecurity());
    const sec = evalTableSecurity(table, statements, initial);
    problems.push(...securityProblems(table, sec));
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
  it("fails ADD COLUMN without row level security and revokes", () => {
    const bare = relationProblems(`
      ALTER TABLE bootstrap_os.companies ADD COLUMN IF NOT EXISTS founder text;
    `);
    assert.ok(bare.some((line) => line.includes("bootstrap_os.companies lacks ENABLE ROW LEVEL SECURITY")));
    assert.ok(bare.some((line) => line.includes("bootstrap_os.companies lacks FORCE ROW LEVEL SECURITY")));
    assert.ok(bare.some((line) => line.includes("lacks an explicit GRANT or REVOKE")));
    assert.deepEqual(
      relationProblems(`
        ALTER TABLE bootstrap_os.companies ADD COLUMN IF NOT EXISTS founder text;
        ALTER TABLE bootstrap_os.companies ENABLE ROW LEVEL SECURITY;
        ALTER TABLE bootstrap_os.companies FORCE ROW LEVEL SECURITY;
        REVOKE ALL ON TABLE bootstrap_os.companies FROM PUBLIC, anon, authenticated;
      `),
      [],
    );
    const granted = relationProblems(`
      ALTER TABLE bootstrap_os.companies ADD COLUMN IF NOT EXISTS founder text;
      ALTER TABLE bootstrap_os.companies ENABLE ROW LEVEL SECURITY;
      ALTER TABLE bootstrap_os.companies FORCE ROW LEVEL SECURITY;
      REVOKE ALL ON TABLE bootstrap_os.companies FROM PUBLIC, anon, authenticated;
      GRANT ALL ON TABLE bootstrap_os.companies TO authenticated;
    `);
    assert.ok(granted.some((line) => line.includes("grants anon or GRANT ALL")));
    const prior = buildBaselineBeforeScan();
    assert.equal(prior.get("bootstrap_os.companies")?.enabled, true);
    assert.equal(prior.get("bootstrap_os.companies")?.forced, true);
    assert.deepEqual(
      relationProblems(
        `
        ALTER TABLE bootstrap_os.companies ADD COLUMN IF NOT EXISTS starter boolean NOT NULL DEFAULT false;
      `,
        prior,
      ),
      [],
    );
    const newTableBare = relationProblems(`
      CREATE TABLE public.fresh_widget (id int);
      ALTER TABLE public.fresh_widget ADD COLUMN IF NOT EXISTS note text;
    `);
    assert.ok(newTableBare.some((line) => line.includes("public.fresh_widget lacks ENABLE ROW LEVEL SECURITY")));
    assert.ok(newTableBare.some((line) => line.includes("public.fresh_widget lacks FORCE ROW LEVEL SECURITY")));
  });

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
    let baseline = buildBaselineBeforeScan();
    for (const name of files) {
      const sql = fs.readFileSync(path.join(MIGRATIONS, name), "utf8");
      for (const problem of relationProblems(sql, baseline)) failures.push(`${name}: ${problem}`);
      mergeMigrationIntoBaseline(baseline, sql);
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

  it("pins starter_boards grants with aclexplode", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
        DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
        CREATE SCHEMA IF NOT EXISTS auth;
        CREATE SCHEMA IF NOT EXISTS bootstrap_os;
        CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;
        CREATE TABLE bootstrap_os.companies (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          slug text NOT NULL UNIQUE,
          label text NOT NULL
        );
        CREATE TABLE bootstrap_os.company_acl (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id uuid NOT NULL REFERENCES bootstrap_os.companies (id) ON DELETE CASCADE,
          principal text NOT NULL,
          principal_kind text NOT NULL,
          role text NOT NULL
        );
        CREATE TABLE bootstrap_os.board_subscribers (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id uuid NOT NULL REFERENCES bootstrap_os.companies (id) ON DELETE CASCADE
        );
        CREATE TABLE bootstrap_os.notify_outbox (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id uuid NOT NULL REFERENCES bootstrap_os.companies (id) ON DELETE CASCADE,
          channel text NOT NULL
        );
        CREATE TABLE public.bootstrap_mcp_mentees (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          email text NOT NULL UNIQUE
        );
        CREATE TABLE public.bootstrap_company_labels (
          mentee_id uuid NOT NULL REFERENCES public.bootstrap_mcp_mentees (id),
          label text NOT NULL
        );
        CREATE TABLE public.bootstrap_mcp_invites (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          company_label text NOT NULL,
          invitee_email text NOT NULL
        );
      `);
      await db.exec(fs.readFileSync(path.join(MIGRATIONS, "20261021_bootstrap_os_starter_board.sql"), "utf8"));
      const tableAcl = await db.query(`
        SELECT a.privilege_type, a.grantee::regrole::text AS grantee
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        CROSS JOIN LATERAL aclexplode(c.relacl) AS a
        WHERE n.nspname = 'bootstrap_os'
          AND c.relname = 'starter_boards'
          AND (
            a.grantee = 0
            OR a.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'anon')
            OR a.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'authenticated')
          )
      `);
      assert.deepEqual(tableAcl.rows, []);
      const pinned = await db.query(`
        SELECT c.relacl IS NOT NULL AS pinned
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'bootstrap_os' AND c.relname = 'starter_boards'
      `);
      assert.equal(pinned.rows[0].pinned, true);
      const fnAcl = await db.query(`
        SELECT a.privilege_type
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        CROSS JOIN LATERAL aclexplode(p.proacl) AS a
        WHERE n.nspname = 'public'
          AND p.proname = 'bootstrap_os_starter_is_sandbox'
          AND a.privilege_type = 'EXECUTE'
          AND (
            a.grantee = 0
            OR a.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'anon')
            OR a.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'authenticated')
          )
      `);
      assert.deepEqual(fnAcl.rows, []);
      const execute = await db.query(`
        SELECT has_function_privilege('authenticated', 'public.bootstrap_os_starter_is_sandbox(text)', 'execute') AS allowed
      `);
      assert.equal(execute.rows[0].allowed, false);
      const mine = await db.query(`
        SELECT has_function_privilege('authenticated', 'public.bootstrap_os_my_starter_slug()', 'execute') AS allowed
      `);
      assert.equal(mine.rows[0].allowed, true);
    } finally {
      await db.close();
    }
  });

  it("stores the company founder on companies and drops the old put_journey signature", () => {
    const sql = fs.readFileSync(
      path.join(MIGRATIONS, "20261021_bootstrap_os_company_founder.sql"),
      "utf8",
    );
    assert.match(sql, /ADD COLUMN IF NOT EXISTS founder text/i);
    assert.match(sql, /p_founder text/);
    assert.match(
      sql,
      /DROP FUNCTION IF EXISTS public\.bootstrap_os_put_journey\(text, text, text, boolean, int, int, text, text, text, jsonb\)/,
    );
    assert.match(sql, /REVOKE ALL ON TABLE bootstrap_os\.companies FROM PUBLIC, anon, authenticated/);
    assert.match(sql, /GRANT SELECT ON TABLE bootstrap_os\.companies TO authenticated/);
    assert.match(sql, /\bBEGIN;/);
    assert.match(sql, /\bCOMMIT;/);
    assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
    assert.match(sql, /FORCE ROW LEVEL SECURITY/);
    assert.match(sql, /Do not migrate/);
    assert.deepEqual(relationProblems(sql), []);
  });
});

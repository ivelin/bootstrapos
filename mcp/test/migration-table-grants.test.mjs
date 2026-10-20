import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = path.join(__dirname, "..", "supabase", "migrations");
const FIRST_NEW_MIGRATION = "20261019";

function stripSqlComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

function createdTables(sql) {
  const creates = sql.match(/create\s+table\b/gi) ?? [];
  const tables = [
    ...sql.matchAll(
      /create\s+table(?:\s+if\s+not\s+exists)?\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)\b/gi,
    ),
  ].map((match) => match[1]);
  if (creates.length !== tables.length) {
    return { error: "CREATE TABLE must name a schema-qualified table" };
  }
  return { tables };
}

function namesRole(text, role) {
  return new RegExp(`\\b${role}\\b`, "i").test(text);
}

function tableProblems(sql) {
  const cleaned = stripSqlComments(sql);
  const parsed = createdTables(cleaned);
  if (parsed.error) return [parsed.error];
  const problems = [];
  for (const table of parsed.tables) {
    const quoted = table.replace(/[.]/g, "\\.");
    const enabled = new RegExp(
      `alter\\s+table\\s+(?:only\\s+)?${quoted}\\s+enable\\s+row\\s+level\\s+security`,
      "i",
    );
    if (!enabled.test(cleaned)) {
      problems.push(`${table} lacks ENABLE ROW LEVEL SECURITY`);
    }
    const grantText = cleaned
      .split(";")
      .filter((statement) => {
        if (!/\b(grant|revoke)\b/i.test(statement)) return false;
        return new RegExp(`\\b${quoted}\\b`, "i").test(statement);
      })
      .join("\n");
    if (!namesRole(grantText, "anon") || !namesRole(grantText, "authenticated")) {
      problems.push(`${table} lacks an explicit GRANT or REVOKE for anon and authenticated`);
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

describe("new migration tables state RLS and grants", () => {
  it("fails a table that skips RLS or skips anon and authenticated", () => {
    const missingRls = `
      CREATE TABLE public.alpha_widget (id int);
      REVOKE ALL ON TABLE public.alpha_widget FROM anon, authenticated;
    `;
    assert.deepEqual(tableProblems(missingRls), [
      "public.alpha_widget lacks ENABLE ROW LEVEL SECURITY",
    ]);

    const missingRoles = `
      CREATE TABLE public.alpha_widget (id int);
      ALTER TABLE public.alpha_widget ENABLE ROW LEVEL SECURITY;
    `;
    assert.deepEqual(tableProblems(missingRoles), [
      "public.alpha_widget lacks an explicit GRANT or REVOKE for anon and authenticated",
    ]);

    const onlyAuthenticated = `
      CREATE TABLE public.alpha_widget (id int);
      ALTER TABLE public.alpha_widget ENABLE ROW LEVEL SECURITY;
      GRANT SELECT ON TABLE public.alpha_widget TO authenticated;
    `;
    assert.deepEqual(tableProblems(onlyAuthenticated), [
      "public.alpha_widget lacks an explicit GRANT or REVOKE for anon and authenticated",
    ]);

    const commented = `
      CREATE TABLE public.alpha_widget (id int);
      -- ALTER TABLE public.alpha_widget ENABLE ROW LEVEL SECURITY;
      -- REVOKE ALL ON TABLE public.alpha_widget FROM anon, authenticated;
    `;
    assert.deepEqual(tableProblems(commented), [
      "public.alpha_widget lacks ENABLE ROW LEVEL SECURITY",
      "public.alpha_widget lacks an explicit GRANT or REVOKE for anon and authenticated",
    ]);

    assert.deepEqual(tableProblems("CREATE TABLE alpha_widget (id int);"), [
      "CREATE TABLE must name a schema-qualified table",
    ]);

    const locked = `
      CREATE TABLE public.alpha_widget (id int);
      ALTER TABLE public.alpha_widget ENABLE ROW LEVEL SECURITY;
      REVOKE ALL ON TABLE public.alpha_widget FROM PUBLIC, anon, authenticated;
    `;
    assert.deepEqual(tableProblems(locked), []);
  });

  it("checks every migration from 20261019 on, including the rate-limit tables", () => {
    const files = newMigrationFiles();
    assert.ok(files.includes("20261019_bootstrap_rate_limit.sql"));
    const failures = [];
    for (const name of files) {
      const sql = fs.readFileSync(path.join(MIGRATIONS, name), "utf8");
      for (const problem of tableProblems(sql)) failures.push(`${name}: ${problem}`);
    }
    assert.deepEqual(failures, []);
    const rate = fs.readFileSync(
      path.join(MIGRATIONS, "20261019_bootstrap_rate_limit.sql"),
      "utf8",
    );
    assert.deepEqual(createdTables(stripSqlComments(rate)).tables, [
      "public.bootstrap_rate_window",
      "public.bootstrap_rate_cap",
      "public.bootstrap_request_cap",
    ]);
  });
});

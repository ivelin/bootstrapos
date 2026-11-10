# CTO delta Q1 + Q2 (PR #156)

HEAD: `31aec64344131a89e770868b932c55ac2ddf0b3f` on `gb/spark-seed-founder-owner` (plus this RESULT.md commit).

## Read-create callers

Bill skill files: none found. They only read `get_journey` and do not rely on a read inserting a company.

In-repo callers that did rely on a read creating the company, now switched off that path:

- SQL `bootstrap_os_ensure_company` used to insert on miss. `p_create` defaults to false. A miss raises `not_found` (`P0002`) before any insert. `put_journey` and `create_idea` pass true.
- `HostedMembershipJourneyStore` reads (`getJourney` and the other read methods) no longer call the old ensure-on-read path. A missing slug returns `{ ok: false, error: "not_found" }` and writes nothing.
- Tests that assumed a label alone materialized alpha or charlie now seed with `put_journey`.
- `create_starter_board` is a write. The memory journey store now gets an empty company from that write (`ensureSandboxBoard`, no default idea), matching the starter SQL insert that already created the company. `get_journey` does not create it.

## Files changed

- `mcp/supabase/migrations/20261110_bootstrap_os_ensure_company_founder_email.sql`
- `mcp/supabase/rollbacks/20261110_bootstrap_os_ensure_company_founder_email.sql`
- `mcp/src/journey.ts`
- `mcp/src/hosted-journey-store.ts`
- `mcp/src/server.ts`
- `mcp/test/ensure-company-founder-email-pglite.test.mjs`
- `mcp/test/ensure-company-founder-email-pg16.test.mjs`
- `mcp/test/journey-rls.test.mjs`
- `mcp/test/hosted-journey-store.test.mjs`
- `mcp/test/hosted-handler.test.mjs`
- `mcp/test/cross-tenant-leak.test.mjs`
- `mcp/test/e2e-roleplay-matrix.test.mjs`
- `RESULT.md`

## Behavior

Q1. Unknown slug on `get_journey`, `list_subscribers`, and `list_killed_ideas` returns `not_found` and writes no `companies`, `company_acl`, or label rows. `put_journey` and `create_idea` still seed under the existing Option A rules. One-arg `ensure_company` does not create.

Q2. `bootstrap_os_grant_acl_internal` takes `p_write_label boolean DEFAULT true`. `change_acl` passes false and skips the `bootstrap_company_labels` insert. Existing change_acl grant/revoke test is unchanged. New test: `change_acl writes no label row`.

SECURITY DEFINER and `search_path` stay on `ensure_company` and the helper. REVOKE/GRANT unchanged. The helper is not executable by anon or authenticated. Down restores one-arg `ensure_company`, the inline `change_acl` insert, and 11-arg `put_journey`, and drops the helper.

## Tests

- `npm test --prefix mcp`: 517 pass, 0 fail.
- Coverage (`npm run test:coverage --prefix mcp`, CI gate `--test-coverage-lines=80`): all files line 90.79%, branch 82.71%, funcs 93.17%. Gate met.
- `npm run test:pg16 --prefix mcp`: 11 pass, 0 fail. Founder-email case applies, rolls back, and applies again. Down notices that `(text,text)` ensure and the 3-arg helper do not exist are expected `DROP IF EXISTS` skips.

## Incomplete

`list_provenance` (read) and the write RPCs `post_comment` and `put_portfolio_score` were not replaced in this migration. They still call one-arg `ensure_company`. That now means `p_create` false, so a missing company writes nothing and raises `P0002` instead of a jsonb `not_found` when the call is reached. `list_provenance` still returns `company not visible` before that call when the caller has no label. No rate limits, no `held_label` email check, no backfill. Not pushed. No PR.

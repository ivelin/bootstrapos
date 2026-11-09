# RESULT: ensure_company founderEmail seed

Branch `gb/spark-seed-founder-owner`. Local commits only. No push, no PR, no prod SQL.

Newest migration prefixes before this change: `20261109_bootstrap_mcp_membership_effective_to.sql`, then `20261108` and `20261107`. This PR adds `20261110` only.

## Summary

`public.bootstrap_os_ensure_company(text)` is dropped in one transaction and replaced by a single function `bootstrap_os_ensure_company(text, text)` with `p_founder_email text DEFAULT NULL`. There is no overload.

`bootstrap_os_grant_acl_internal(uuid, text, text)` lowercases the email, `principal_kind` is always `email`, upserts `bootstrap_mcp_mentees`, inserts `bootstrap_company_labels` for the company slug, and inserts `company_acl` `ON CONFLICT DO NOTHING`. It does not write `companies.founder` or any display name. `REVOKE ALL` from `PUBLIC`, `anon`, and `authenticated`. No `GRANT EXECUTE`.

`bootstrap_os_change_acl` still validates held label, starter sandbox, principal, role, and op, still revokes by DELETE, and still emits audit. Email grants call the helper. Sub grants stay a direct ACL insert because the helper is email-only. Existing change_acl tests were not edited.

New company, no founder email, caller is not `super_admin`: company + default idea, caller role `founder` plus mentee/label. Held label is skipped on this create path.

New company, founder email equals the caller: role `founder` for the caller.

New company, founder email differs: role `founder` for that email and `commenter` for the caller, both labeled.

New company, caller has a live `bootstrap_os_roles.role = super_admin` and no founder email: `founder_email_required: pass founderEmail`. Bad shape: `invalid_founder_email`.

Existing company: `held_label` required (`company not visible`). First email touch inserts `founder_authorized` only. No demotion. `founderEmail` is not remapped.

`bootstrap_os_put_journey` gains optional `p_founder_email` (11-arg function dropped, 12-arg created) and forwards it. Other callers keep one-arg `ensure_company` via `DEFAULT NULL`.

Down script: `mcp/supabase/rollbacks/20261110_bootstrap_os_ensure_company_founder_email.sql` restores the 1-arg ensure body, inline change_acl grant insert, and 11-arg `put_journey`, and drops the helper.

TypeScript: `put_journey` accepts optional `founderEmail` and the hosted store sends `p_founder_email` when set. Memory `ensureCompanyForMember` uses the same seed rules. `canPostComment` allows `commenter` and `mentor`. `canWriteJourney` stays `founder` / `founder_authorized`.

No backfill. No ACL enforcement or rate-limit work. No anyone-can-invite work.

## Principle 4

Hosted `bootstrap_os_held_label` matches mentee email or auth sub to `bootstrap_company_labels`. It does not read `auth.users.email_confirmed_at`. Accept-invite and `create_company_self_serve` do require a confirmed email. This PR does not change `held_label`.

PGlite documents that: an unconfirmed `auth.users` row with no mentee/label has `held_label` false; the same email with a label row has `held_label` true even when `email_confirmed_at` is null; the function body does not contain `email_confirmed_at`.

## Tests

| Check | Result |
| --- | --- |
| `npm run build --prefix mcp` | pass |
| `node --test mcp/test/ensure-company-founder-email-pglite.test.mjs` | pass (8) |
| `node --test mcp/test/hosted-journey-store.test.mjs` | pass |
| `node --test mcp/test/journey-rls.test.mjs` | pass (commenter/mentor comment; commenter cannot put_journey; memory seed) |
| `node --test mcp/test/starter-ensure-pglite.test.mjs` | pass |
| `node --test mcp/test/company-admin-pglite.test.mjs` | pass |
| `node --test mcp/test/hosted-board-subscribers-pglite.test.mjs` | pass |
| `npm run test:coverage --prefix mcp` | pass (515 tests) |
| `npm run test:pg16 --prefix mcp` | pass (11 tests) |

PGlite cases: dual seed founder + commenter and labels; founder invites editor; commenter invite is `tier_forbidden`; super_admin without founderEmail is `founder_email_required`; bad email is `invalid_founder_email`; non-admin without founderEmail is caller `founder`; existing first touch is `founder_authorized` with no demotion; one-arg call resolves; single signature `(text,text)`; anon and authenticated lack `EXECUTE` on ensure and the helper; change_acl grant/revoke still `{ok:true}`.

Hosted Bill path: `SupabaseJourneyStore.putJourney` with `client: "bootstrap-bill"` and `founderEmail` sends `p_founder_email`. Omitting it does not send the key. SQL super_admin path is the rejection above (fictional `bill@example.invalid`).

## Coverage

`node --experimental-test-coverage` via `npm run test:coverage --prefix mcp` (line gate 80).

- all files: line 90.85%, branch 82.74%, funcs 93.17%
- `dist/journey.js`: line 96.24%. New `ensureCompanyForMember` / `canPostComment` lines are not in the uncovered set.
- `dist/hosted-journey-store.js`: line 76.69% for the whole file (pre-existing). New lines (`founderEmail` on the memory ensure call, `p_founder_email` on the RPC body) are not in the uncovered set.
- `dist/server.js`: `founderEmail` zod field and the `putJourney` pass-through are not in the uncovered set.

New TypeScript lines exercised by the unit suite are covered. The process gate stayed green at 90.85% lines.

## pg16 round trip

PostgreSQL 16 at `/usr/lib/postgresql/16/bin`. In-process cluster under the OS temp dir. No prod dump. No dump file in the worktree.

Redacted snippet (fictional email only):

```
signature after up:    bootstrap_os_ensure_company(text,text)
ensure_company('roundco') as solo@example.invalid
signature after down:  bootstrap_os_ensure_company(text)
grant_acl_internal count after down: 0
signature after re-up: bootstrap_os_ensure_company(text,text)
```

`npm run test:pg16 --prefix mcp`: 11 pass, 0 fail (starter subscriber, starter ensure, this round trip, self-serve race, invite accept race, SOP store).

## Known gaps

Hosted `put_journey` / `post_comment` still gate on `held_label` only, so a commenter can still write on hosted until PR2 (due Nov 18). Bill must not market commenter as read-only.

The Bill skill change (pass `founderEmail`) must ship in the same release.

Prod data changes for veritas-hr-tech / healthshield / damo-achaiyan need Ivelin's yes, coordinated with Bootstrap Bill. Out of this PR.

## Gates

Code Reviewer at this exact head. Prod SQL and merge each need Ivelin's yes.

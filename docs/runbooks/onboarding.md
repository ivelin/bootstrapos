# Onboarding probe

Fixtures only (`alpha` / `bravo` / `charlie`, `@example.test`). Never production. Never `supabase-pirin-ai`. A PR agent does not apply SQL.

## What it checks

Invite mail is one link (“Open this to sign in or create your account”). A verified session with a pending invite accepts that invite and `bootstrap_whoami` shows the board. A verified session with zero boards is HTTP **200** `reason: no_membership` and the hint “No boards yet. Ask your inviter to resend the invite to this email.” A missing or rejected token is HTTP **401** `error: invalid_token` with the specific `reason`. A membership-required tool with no board is HTTP **403** `error: no_membership` and does not send `WWW-Authenticate`. Repeating Allow reuses one user and one OAuth subject. A revoked access token is a clean 401; another live token for that user still works. A membership written in the database is visible on the next call.

## How to run

```bash
cd mcp && npm run probe:onboarding
```

That builds, then runs `node scripts/onboarding-probe.mjs`, which runs `test/onboarding-gate.test.mjs` on PGlite. The same file is in `npm run test:unit` and `npm run verify:user-path`. CI runs it on pull requests and on the daily schedule. `preview-live.mjs` is not this probe.

## 401 vs 200

| Call | Status | Body |
|------|--------|------|
| No bearer, or a rejected / revoked token | 401 | `error: invalid_token`, `reason` is the exact failure (`missing_or_short_token`, `invalid_or_revoked_token`, …) |
| Verified session, no board | 200 | `reason: no_membership`, hint above. Not a rejected token. |
| `invite_member` / `create_company` / super-admin tools with no board | 403 | `error: no_membership`. No `WWW-Authenticate`. |

SQL `bootstrap_mcp_my_labels` still says `not_invited`. The handler upgrades that. Clients must branch on `error` / `reason`, not on “the server rejected the access it just issued.”

## Migration

`mcp/supabase/migrations/20261015_bootstrap_mcp_accept_on_verified_signin.sql` lives in the repo. Cos applies it after merge. Until then, auto-accept is a no-op (`invite_rpc_failed` is ignored) and a verified zero-board session is still HTTP 200, not 401.

## Forgot password

The public reply is the same for every address: “If that email has an account, we sent a reset link.” It does not say whether the account exists. This host does not send that mail. The create-account path is the invite link.

## Login page

Allow stays on pirin.ai. The contract it calls is `POST /bootstrap-os/session` — [`mcp/docs/INVITE.md`](../../mcp/docs/INVITE.md).

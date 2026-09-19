---
name: verify-bootstrap
description: "Drive Bootstrap OS hosted MCP (invite/whoami/accept_invite + board tools on this repo) the way a user/agent does — launch the local HTTP helper, fail-closed handshake/whoami, PGlite invite/accept e2e. Use before Ready-for-human-eyes, after invite/auth/board changes, or when proving a claim path. Does not own pirin.ai marketing or login UI (verify-pirin)."
---

# Verify Bootstrap OS

This skill is for the next agent, mid-task, who has never seen the app. The user-facing product in **this repo** is the hosted MCP resource server (`mcp/`) plus optional Accept / signup **cards** returned as tool results. There is no login page, no marketing site, and no HTML Accept landing here.

**MECE vs `verify-pirin` (ivelin/pirin-ai):** this skill owns invite/signup **contracts emitted here**, email-confirm **token preservation on the way back**, signed-in Accept **claim** (`accept_invite` + whoami), hosted MCP handshake/whoami, and any board/invite UX **served by this repo**. It does **not** own pirin.ai home, insights, events, or install-os marketing. When a path crosses hosts, drive only the Bootstrap landing here and name `verify-pirin` for the other host. Do not duplicate pirin drive steps.

Proof standards: exercise the real user path (HTTP MCP tools / existing PGlite e2e), not internal setters. Capture the action and the resulting state. Side effects that matter: 401 challenge strings, Accept/signup card fields, whoami labels after accept, opaque `verify_invite` failures, outbox enqueue (not prod Resend). Mocks only where production already isolates the boundary (PGlite instead of `supabase-pirin-ai`; mail `dry-run` / outbox instead of Resend). Do not live-probe the production pin or prod DB from a PR agent. When reporting board status to a human, lead with descriptive labels; numbers only in parentheses.

## Launch

Documented local helper (not Vercel, not the collab pin):

```bash
cd mcp && npm ci && npm run build
node .cursor/skills/verify-bootstrap/scripts/verify-bootstrap.mjs launch
```

The helper starts `mcp/dist/http.js` (same process as `npm run start:http`) on `127.0.0.1` and an ephemeral port. It is ready when `GET /health` returns `200` with body `ok`. Stderr from the helper also prints `bootstrap-os hosted-read local helper listening on http://127.0.0.1:<port>/mcp`.

Teardown is `cleanup` (below). Never `pkill` by name.

Isolation:

- Scratch + pid live under `VERIFY_BOOTSTRAP_RUN_DIR` (default `/tmp/verify-bootstrap-run`).
- Two runs may sit side by side if each uses its own run dir and port. The helper refuses to launch when a recorded pid is still alive.
- Do **not** set `VERCEL_ENV=production`. Preview/dev must not attach prod identity even if `BOOTSTRAP_SUPABASE_*` is present. The helper unsets those for the child.
- Do **not** drive a user's Cursor/Grok MCP session or `https://mcp.bootstrap.pirin.ai/mcp` from a PR cloud agent.
- Local identity store is `unset`. Invite/accept **mutations** are proven with the repo's PGlite e2e (`mcp/test/e2e-roleplay-matrix.test.mjs`), not against live Supabase.

If `mcp/dist/http.js` is missing, stop: `cd mcp && npm ci && npm run build`. If that fails, report the exact command and stderr — do not invent a browser recipe.

## Doctor

Read-only. Run first whenever anything looks off:

```bash
node .cursor/skills/verify-bootstrap/scripts/verify-bootstrap.mjs doctor
```

Worth driving only when every check is `ok`:

| Check | Pass |
|-------|------|
| `process` | Recorded pid is alive |
| `health` | `GET http://127.0.0.1:<port>/health` → `200` / `ok` |
| `well-known` | `GET /.well-known/oauth-protected-resource` includes `authorization_servers: ["https://pirin.ai/bootstrap-os/login"]` |
| `whoami-401` | Cookie-less `tools/call` `bootstrap_whoami` → HTTP `401`, `reason: missing_or_short_token`, `identityStore: unset`, `WWW-Authenticate` equals the collab challenge in `mcp/docs/HOSTED_IDENTITY.md` |
| `initialize-loopback-open` | Cookie-less `initialize` **without** a collab `Host` → `200`, `serverInfo.name` is `bootstrap-os` (loopback helper is not handshake-gated) |
| `initialize-collab-401` | Same `initialize` with `Host: mcp.bootstrap.pirin.ai` → HTTP `401` + the same `WWW-Authenticate` |

Refuse to drive if `VERCEL_ENV=production`, if health is not `ok`, or if whoami is not 401. A silent `200` on cookie-less whoami is a failed doctor.

## Drive

No Playwright in this repo. Prefer the existing harnesses, then raw HTTP against the launched helper.

```bash
node .cursor/skills/verify-bootstrap/scripts/verify-bootstrap.mjs drive hosted-handshake-whoami
node .cursor/skills/verify-bootstrap/scripts/verify-bootstrap.mjs drive invite-member
node .cursor/skills/verify-bootstrap/scripts/verify-bootstrap.mjs drive accept-invite-claim
node .cursor/skills/verify-bootstrap/scripts/verify-bootstrap.mjs drive invite-signup-login-url
node .cursor/skills/verify-bootstrap/scripts/verify-bootstrap.mjs drive journey-board
```

Stable handles (use these, not coordinates):

- Routes: `/health`, `/mcp`, `/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server`
- JSON-RPC methods: `initialize`, `tools/list`, `tools/call`
- Tool names: `bootstrap_whoami`, `bootstrap_list_company_labels`, `invite_member` (`email`, `companyLabel`), `accept_invite` (`token`), `get_journey` (`company` / `idea` / `q`), `enable_board_watch`, `subscribe_board`, `unsubscribe_board`, `list_subscribers`
- Card fields: `card: "accept_invite"` + `action: "Accept"`; `card: "invite_signup"` + `action: "Sign in or create account"`; `signupUrl` query `invite=`
- Challenge: `WWW-Authenticate: Bearer realm="bootstrap-os-mcp", resource_metadata="https://mcp.bootstrap.pirin.ai/.well-known/oauth-protected-resource", resource="https://mcp.bootstrap.pirin.ai/mcp", scope="bootstrap-os"`

Host split: loopback `initialize` is open; collab Host / production pin handshake is 401. Gated tools 401 on both.

Cross-host: after `invite_member`, the signup URL is `https://pirin.ai/bootstrap-os/login?invite=<token>`. Sign-in, create-account, and **email confirm** pages are `verify-pirin`. This skill only checks that the `invite=` token is still the one `accept_invite` consumes when the user returns with a JWT.

Read the matching file under `features/` and drive that recipe. A proof that uses a different entry point does not cover the others.

## Evidence

Write under `.cursor/skills/verify-bootstrap/artifacts/<feature-id>/` (override with `VERIFY_BOOTSTRAP_EVIDENCE_DIR`). That directory **survives cleanup**.

Minimum for a pass:

- Action + resulting state in `proof.json` (not only the last status).
- For HTTP: status, `WWW-Authenticate` when 401, JSON body, and that `labels` is absent on fail-closed whoami.
- For invite/accept: TAP from the named PGlite test plus `proof.json` with exit code `0`.
- Side effects: Accept card `inviteToken` prefix `inv_`; email outbox From `bootstrap@pirin.ai`; `verify_invite` opaque `{ "ok": false }` on miss/expired; whoami labels after accept.
- Record `featureId` and the entry point on every artifact.

Do not treat `cd mcp && npm run ci` as a substitute for driving the mapped feature. CI green is necessary for merge, not the same as this skill's user-path proof.

## Cleanup

```bash
node .cursor/skills/verify-bootstrap/scripts/verify-bootstrap.mjs cleanup
```

Kills **only** the pid recorded at launch (`SIGTERM`, then `SIGKILL`). Removes run-dir scratch (`state.json`, helper logs). Does **not** delete `artifacts/`. After cleanup, confirm `artifacts/<feature-id>/proof.json` still exists.

Never `pkill -f http.js` / `pkill -f verify-bootstrap`. If you did not start the instance, do not tear it down.

## Helpers

The only shipped helper is executable at `.cursor/skills/verify-bootstrap/scripts/verify-bootstrap.mjs`. Invocations are the four commands in Launch / Doctor / Drive / Cleanup. It records pid/url, talks HTTP, wraps the existing Node tests, and writes evidence. Do not reverse-engineer a second harness.

Feature map: [`features/README.md`](features/README.md). Upkeep later: `/maintain-verification-skill`.

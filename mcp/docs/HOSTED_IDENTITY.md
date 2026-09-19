# Hosted MCP identity (resource server)

This host is the **resource server only**. There is **one** invite-only hosted MCP pin: `https://mcp.bootstrap.pirin.ai/mcp`. Cookie-less `initialize` / GET SSE / `tools/list` **401** so an MCP client (Grok Bot is one example) can start OAuth. Gated tools accept **access tokens issued by pirin.ai login**. This draft also gates journey tools — contract: [`JOURNEY.md`](JOURNEY.md).

Free docs are GitHub + [install-os](https://pirin.ai/install-os) + local — **not** a hosted MCP connector. Do not invent `os.bootstrap.pirin.ai` or a second public Path 1 hostname. Path 3 local stdio stays the write path.

## Founder lock

| | |
|--|--|
| Login / OAuth | **pirin.ai only.** Web Builder owns `/bootstrap-os/login` (authorize URL, authorization code + PKCE) and RFC 8414. This MCP origin serves RFC 9728; `authorization_servers` stay on pirin.ai. |
| This repo | MCP resource server. Do **not** add a login UI. No second authorization server. |
| Product | MCP client follows 401 → this origin's protected-resource metadata → pirin.ai authorize + PKCE. The client attaches the issued access token. This host never issues connector secrets. |
| Prod database | Cloud agents on PRs do **not** migrate, seed, or live-probe the live pirin.ai project. Local / CI use **PGlite**. |
| Allowlist | A valid pirin.ai JWT is **not** enough. Hosted MCP whoami is `authenticated: true` only if email/`auth_user_id` is on `bootstrap_mcp_mentees` (user table, legacy name). Uninvited → `not_invited`; gated tools stay 401. First user is a SQL insert — [First user (rebuild from GitHub)](#first-user-rebuild-from-github). Later users + additional workspaces: [`INVITE.md`](INVITE.md) (`invite_member` / `accept_invite` / `bootstrap_mcp_verify_invite`). |
| **Invite-only boards** | **Hard rule — invite-only company boards.** Company board/data access is invite-only. Unauthenticated or non-invited principals, and members of company A, must never receive company B rows (labels, comments, audit, scoreboard, owners, subscribers). Fail closed: HTTP **401/403 or empty** — never another company's rows. CI gate: [`../test/cross-tenant-leak.test.mjs`](../test/cross-tenant-leak.test.mjs). Board contract: [`JOURNEY.md`](JOURNEY.md#hard-rule--invite-only-company-boards). |
| Env pin | Live on Vercel project `bootstrap-os-mcp`. Identity/invite Supabase adapters attach **only** when `VERCEL_ENV=production`. Preview/development must not use prod DB even if `BOOTSTRAP_SUPABASE_*` is set. Do **not** print those values. Invite-only collab pin is `https://mcp.bootstrap.pirin.ai/mcp` on `main`. Do not merge. Board watch (Bill): Cos sets `BOOTSTRAP_BOARD_WATCH_URL` (https), `BOOTSTRAP_BOARD_WATCH_PRINCIPAL`, optional `BOOTSTRAP_BOARD_WATCH_PRINCIPAL_KIND` once. Agents call `enable_board_watch` after invite. Founders never paste URLs. |
| Public preview | Vercel Authentication is **off** on this project so founders can add the PR git preview with no Vercel login. Unmodified URL **and** protected-resource identifier: `https://bootstrap-os-mcp-git-cursor-ho-16df4d-ivelins-projects-9f9b7132.vercel.app/mcp`. Derived from the request host when `VERCEL_ENV=preview`. Never the production pin on preview. |
| Deploy Host (not a pin) | `https://bootstrap-os-mcp.vercel.app/mcp` is the Vercel production Host. **Not a pin.** Not Path 1. Not advertised. Cos HARD 2026-09-09: treat this Host **exactly like collab** — cookie-less `initialize` / `tools/list` **HTTP 401** + `WWW-Authenticate`. Not a silent 200 alias (undeclared deploy-only). |

## HTTP contract

One production pin. Say it here; other files link.

| Pin | URL | Cookie-less `initialize` / GET SSE / `tools/list` |
|-----|-----|---------------------------------------------------|
| Collab / Grok / whoami (invite-only) | `https://mcp.bootstrap.pirin.ai/mcp` | **HTTP 401** + `WWW-Authenticate` (same as gated whoami). Public OS tools stay listed **after** auth. |

On this **Hold preview** (`VERCEL_ENV=preview`, not a prod hostname), cookie-less `initialize`, GET SSE `/mcp`, and `tools/list` return **HTTP 401** with the same `WWW-Authenticate` as gated whoami. Public OS tools still work **with a Bearer**. RFC 8414 / RFC 9728 well-known GETs stay 200.

Unauthenticated or invalid-token calls to `bootstrap_whoami`, `bootstrap_list_companies`, `bootstrap_use_company`, `invite_member`, or `accept_invite` (and any later gated tool) return **HTTP 401**. `accept_invite` allows a valid JWT that is still `not_invited` — the invitee is not on the allowlist yet. Production / main uses this exact header (`resource_metadata` is **this MCP origin** well-known — not live pirin.ai, whose RFC 9728 `resource` is still the vercel.app alias until pirin-ai updates):

```http
WWW-Authenticate: Bearer realm="bootstrap-os-mcp", resource_metadata="https://mcp.bootstrap.pirin.ai/.well-known/oauth-protected-resource", resource="https://mcp.bootstrap.pirin.ai/mcp", scope="bootstrap-os"
```

The 401 JSON also includes `identityStore` (`supabase` | `memory` | `unset`) and `reason` (`missing_or_short_token` | `not_invited` | …). Those are not session claims.

Preview (this Hold — Cos lock) challenge — `resource` is this preview MCP URL, `resource_metadata` is **this preview origin** well-known (not live pirin.ai, not the dead #143 git preview):

```http
WWW-Authenticate: Bearer realm="bootstrap-os-mcp", resource_metadata="https://bootstrap-os-mcp-git-cursor-ho-16df4d-ivelins-projects-9f9b7132.vercel.app/.well-known/oauth-protected-resource", resource="https://bootstrap-os-mcp-git-cursor-ho-16df4d-ivelins-projects-9f9b7132.vercel.app/mcp", scope="bootstrap-os"
```

Do **not** point production or Hold-preview `resource_metadata` at `https://pirin.ai/.well-known/oauth-protected-resource` — that JSON `resource` is still `https://bootstrap-os-mcp.vercel.app/mcp`. `BOOTSTRAP_OAUTH_RESOURCE_METADATA` cannot override onto that live document.

This host also serves RFC 9728 at `/.well-known/oauth-protected-resource` (and the `/mcp` suffix). On this Hold preview, `"resource"` is the preview MCP URL and `"authorization_servers"` is live `https://www.pirin.ai/bootstrap-os/login` (apex `pirin.ai` 307s — DCR/token must be 200). The vercel.app deploy Host must **401** cookie-less `initialize` and `tools/list` exactly like collab — not a silent 200.

## Web Builder

pirin-ai #143 is merged to main. The live authorization server is pirin.ai. Advertise the apex URLs (the live AS document uses these). Apex `https://pirin.ai/...` 307s to `www.pirin.ai` — that is pirin furniture, not this repo. Do not send Cos at the dead #143 git preview.

Protected-resource metadata URL (production — this MCP origin):

`https://mcp.bootstrap.pirin.ai/.well-known/oauth-protected-resource`

pirin.ai still publishes its own RFC 9728 at `https://pirin.ai/.well-known/oauth-protected-resource`. Do not send that URL as `resource_metadata` until that document's `resource` matches `https://mcp.bootstrap.pirin.ai/mcp`.

Protected-resource metadata URL (Hold preview — this MCP origin, Cos lock):

`https://bootstrap-os-mcp-git-cursor-ho-16df4d-ivelins-projects-9f9b7132.vercel.app/.well-known/oauth-protected-resource`

Authorize URL (authorization code + PKCE) — production **and** this Hold preview. Advertised as www so Grok App DCR is HTTP 200 (apex 307s to www):

`https://www.pirin.ai/bootstrap-os/login`

Suggested RFC 9728 document (production — live):

```json
{
  "resource": "https://mcp.bootstrap.pirin.ai/mcp",
  "authorization_servers": ["https://www.pirin.ai/bootstrap-os/login"],
  "scopes_supported": ["bootstrap-os"],
  "bearer_methods_supported": ["header"]
}
```

Suggested RFC 9728 document this MCP origin serves on the Hold preview (`VERCEL_ENV=preview`). `resource` is this preview MCP URL. `authorization_servers` is live pirin.ai login — not the prod pin, not #143:

```json
{
  "resource": "https://bootstrap-os-mcp-git-cursor-ho-16df4d-ivelins-projects-9f9b7132.vercel.app/mcp",
  "authorization_servers": ["https://www.pirin.ai/bootstrap-os/login"],
  "scopes_supported": ["bootstrap-os"],
  "bearer_methods_supported": ["header"]
}
```

`WWW-Authenticate` `resource_metadata` points at this MCP origin well-known (production pin origin on main; this preview origin on Hold). Clients then read `authorization_servers` and land on live `https://www.pirin.ai/bootstrap-os/login`. This repo does not host a login UI.

Grok Bot / RFC 8414 clients that look for `/.well-known/oauth-authorization-server` (and the `/mcp` suffix) on **this MCP origin** get HTTP 200. Preview and production copy the live www.pirin.ai AS document (apex 307s — DCR must be 200). All endpoints stay on www.pirin.ai — this repo does **not** serve `/oauth/token`, `/oauth/register`, or a login UI.

Hold-preview RFC 8414 document (`VERCEL_ENV=preview`) — live www.pirin.ai:

```json
{
  "issuer": "https://www.pirin.ai/bootstrap-os/login",
  "authorization_endpoint": "https://www.pirin.ai/bootstrap-os/login",
  "token_endpoint": "https://www.pirin.ai/oauth/token",
  "registration_endpoint": "https://www.pirin.ai/oauth/register",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "code_challenge_methods_supported": ["S256"],
  "token_endpoint_auth_methods_supported": ["none"],
  "scopes_supported": ["bootstrap-os", "openid", "profile", "email"],
  "service_documentation": "https://www.pirin.ai/bootstrap-os/login"
}
```

After the code exchange, the MCP client retries gated tools with:

```http
Authorization: Bearer <access_token issued by pirin.ai>
```

Collab-host and undeclared-deploy-Host clients get 401 on the first handshake and follow `WWW-Authenticate`. Path 1 founders are not told to connect a hosted MCP URL.

## First user (rebuild from GitHub)

Say it **once** here. Other files link.

A valid pirin.ai JWT alone must **not** grant hosted MCP access. There is **no login UI in this repo**. Invite-from-existing-user is Bearer `accept_invite` (same user, additional workspace) or login URL; in-chat Accept is optional — [`INVITE.md`](INVITE.md). First user is a **direct SQL insert** into `bootstrap_mcp_mentees` (user table; email **lowercased**) plus optional `bootstrap_company_labels` (team memberships).

On a rebuild (empty project / Cos applying migrations — **never from a PR cloud agent**):

1. Apply identity migrations: `mcp/supabase/migrations/20260829_bootstrap_mcp_identity.sql`, `mcp/supabase/migrations/20260909_bootstrap_mcp_fail_closed_invite.sql`, `mcp/supabase/migrations/20260910_bootstrap_mcp_invite_accept.sql`, then `mcp/supabase/migrations/20260910_bootstrap_mcp_invite_qualify_label.sql`, then `mcp/supabase/migrations/20260911_bootstrap_mcp_invite_pgcrypto_search_path.sql`, then `mcp/supabase/migrations/20260911_bootstrap_mcp_invite_verify_email_outbox.sql`, then `mcp/supabase/migrations/20260912_bootstrap_mcp_invite_existing_member.sql` (CREATE OR REPLACE `bootstrap_mcp_invite_member` — existing user, second workspace, `already_member`, pending unique). PR CI uses `mcp/test/pglite/identity-schema.sql` — do **not** apply that fixture to prod.
2. Insert the first user. The identity migration seeds a **fictional** template row (`founder@example.test` + labels `alpha`, `bravo`, `charlie`) so clones and PGlite never contain live instance names. Production first-user is a Cos-only SQL insert of the live maintainer (never committed as those emails or labels). Additional first-user SQL uses the same shape:

```sql
INSERT INTO public.bootstrap_mcp_mentees (email)
VALUES (lower('founder@example.com'));

INSERT INTO public.bootstrap_company_labels (mentee_id, label)
SELECT m.id, x.label
FROM public.bootstrap_mcp_mentees m
CROSS JOIN (VALUES ('alpha')) AS x(label)
WHERE m.email = lower('founder@example.com');
```

3. That person signs in at pirin.ai `/bootstrap-os/login`. OAuth then works. `bootstrap_mcp_my_labels` binds `auth_user_id` on the first email match.

Uninvited JWTs stay `authenticated: false` / `reason: not_invited`. Gated tools stay HTTP 401 except `accept_invite` (valid JWT + matching invite token; already-authenticated users may join another workspace). Missing token still 401s the collab handshake. Later users: [`INVITE.md`](INVITE.md).

## Tests (PGlite / isolated)

| | |
|--|--|
| HTTP 401 + exact `WWW-Authenticate` | `mcp/test/identity.test.mjs` |
| Invited JWT authenticates; uninvited → `not_invited` | `mcp/test/identity.test.mjs` + `identity-pglite.test.mjs` |
| FORCE RLS | `mcp/test/identity-pglite.test.mjs` |
| SQL file locks | `mcp/test/identity-rls.test.mjs` (no network) |
| CTO/PM role-play matrix + draft prod synthetic SRE | [`E2E_ROLEPLAY.md`](E2E_ROLEPLAY.md) · `mcp/test/e2e-roleplay-matrix.test.mjs` |
| Invite / accept / login-URL mail | [`INVITE.md`](INVITE.md) · `mcp/test/invite.test.mjs` + `invite-mail.test.mjs` + role-play P1–P4 + `identity-pglite.test.mjs` (SQL `invite_member` / `verify_invite`, no 42702 / no 42883; existing user second workspace; preview store refuse) |
| **Invite-only company boards (cross-tenant)** | `mcp/test/cross-tenant-leak.test.mjs` — unauthenticated / stranger / invited-to-A-only vs B; `q=` / slug typo / idea slug / webhook / list; PGlite `held_label`. Fictional `alpha` / `bravo` / `charlie` / `delta` only. Fail the pipeline on any leak. |

Do not run `preview-live.mjs` on PR cloud agents. Draft prod synthetic checks are Cos-only — same doc.

## Out

No mentee roster. No usage analytics as proof. No founder-update write. No WebMCP. No marketplace. No billing. No login UI in this repo. Insights/Apply stay email-only. No public Path 1 hosted MCP pin. No open login (JWT without a mentee row). No prod Resend from this repo. QR image / SMS later — [`INVITE.md`](INVITE.md).

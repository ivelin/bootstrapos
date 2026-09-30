# Hosted MCP invite + accept (team membership)

Say it **once** here. Other files link. First-user SQL stays in [`HOSTED_IDENTITY.md`](HOSTED_IDENTITY.md#first-user-rebuild-from-github). HTTP challenge strings stay there too.

Fail-closed allowlist is already on. A valid pirin.ai JWT is not enough. **User** is the identity (one email). **Team member** is that user authorized on a company workspace. Same user, many workspaces. Roles (founder / advisor / mentor) are not in this contract.

`bootstrap_mcp_mentees` is the user table (legacy name). `bootstrap_company_labels` are team memberships.

## Tools

| Tool | Who | Does |
|------|-----|------|
| `invite_member` | Allowlisted team member | Email + company workspace the inviter already belongs to. Returns an optional Accept card + sign-in/create-account card. Enqueues `in_chat` + `email` outbox. |
| `accept_invite` | Invitee with a pirin.ai JWT | One-time token → user row (if new) + that workspace membership. JWT email must match. Existing users gain an additional membership — not a second account. |

`accept_invite` is the only gated tool that does **not** require an allowlist row (a first-time invitee is `not_invited` until they accept). An **already-authenticated** user may call it to join another workspace. It still needs a usable JWT. Empty / wrong / expired Bearer stays HTTP 401.

`invite_store_unset` means this host has no Supabase URL / anon key / access token, **or** it is not the production Vercel env (preview/dev never attach prod DB). A failed invite RPC (schema cache, grants, SQL) is `invite_rpc_failed` — HTTP status + body. Do not collapse those.

## Channels (harness-agnostic)

The product is MCP tools + a login URL. Grok Bot is one client, not the requirement. Any agentic client (Grok Bot, Claude Cowork, ChatGPT Work, ChatGPT Dot, Cursor, Hermes, OpenClaw, a browser) that can open the URL and/or call `accept_invite` with a Bearer is first-class. Named targets: [`docs/TARGETED_CHANNELS.md`](../../docs/TARGETED_CHANNELS.md).

| Channel | Who it is for | Status |
|---------|----------------|--------|
| Email + `https://pirin.ai/bootstrap-os/login?invite=<token>` | Universal | **Primary** |
| MCP `accept_invite` with a pirin.ai Bearer | Any MCP client that already has OAuth | **Primary** (same token) |
| In-chat Accept card (`DraftExternalMessage`) | Clients that render tool results as actions | Optional |

This repo does **not** add a login UI. pirin.ai `/bootstrap-os/login?invite=` must **sign in** an existing pirin.ai user with that email, not fail “email already registered.”

## Accept card (optional)

Shaped like **DraftExternalMessage**. Shows **who invited / to whom / company workspace → Accept**.

```json
{
  "card": "accept_invite",
  "shape": "DraftExternalMessage",
  "from": { "email": "founder@example.test" },
  "to": { "email": "bill@example.test" },
  "companyWorkspace": "alpha",
  "action": "Accept",
  "inviteToken": "inv_…",
  "tool": "accept_invite"
}
```

The raw token is shown **once** on the Accept card (and on the sign-in Auth card / email mailer handoff). The `in_chat` outbox stores the same shape **without** the token.

Auth card `action` is **Sign in or create account** (valid for first-time and returning users). Do not enumerate to the inviter whether the email is already a Bootstrap OS user.

Invite mail and this card tell the invitee to open the signup URL on their agent's computer and fill the form card in the chat. The page is one step: **Email**, **Password**, **Continue**, then **Accept invite**. The password stays on that card. This host does not take a password in a tool argument.

## Token

Single-use. Expires in 7 days. Hash only in `bootstrap_mcp_invites`. Fail closed on wrong email, expired, replay, or unknown token. Inviter cannot grant a workspace they do not belong to (cross-company). Invitee who **already belongs** to that workspace → `already_member` (not a leak of their other teams). One pending invite per `(email, workspace)`; re-invite to the same workspace rotates the token. A **different** workspace for the same email is allowed.

## How Bill uses it (dogfood A/B)

1. First user is already a Bootstrap OS user via SQL — [rebuild](HOSTED_IDENTITY.md#first-user-rebuild-from-github). Template fixture is `founder@example.test` (`alpha` / `bravo` / `charlie`).
2. Allowlisted inviter (any MCP client, collab pin): `invite_member` `email=bill@…` `companyLabel=alpha`.
3. **Invitee with Bearer:** Bill calls `accept_invite` with the token. JWT email must match. First accept creates the user + `alpha`.
4. **Invitee via login URL:** mail / Auth card → `https://pirin.ai/bootstrap-os/login?invite=<token>` → sign in or create account **for that email** → JWT → `accept_invite` with the **same** token.
5. Bill’s `bootstrap_whoami` is `authenticated: true` with company `alpha`.
6. Later, the same inviter invites the **same** Bill to `bravo`. Bill accepts with the same email. whoami companies include `alpha` and `bravo`. Still one user.
7. Outsider dogfood uses the same path (`member@example.test` / `alpha`). No Cos SQL shortcut for later users.

## Signup URL (Web Builder)

Documented here. pirin-ai owns the login UI. This repo does **not** implement it.

```
https://pirin.ai/bootstrap-os/login?invite=<token>
```

| Query | Required | Meaning |
|-------|----------|---------|
| `invite` | yes | Same `inv_…` token as `accept_invite` / `bootstrap_mcp_verify_invite`. |

Optional display hints the mailer may also send (not required for redeem): invitee email and company label come from **verify**, not from extra query params. Do not trust query `email=` / `company=` for allowlist.

After the invitee has a JWT as that email, the MCP client calls `accept_invite` with the same token. whoami then shows the company workspace memberships for that user.

## Verify RPC (Web Builder — fail-closed)

`bootstrap_mcp_verify_invite(p_token text)` — SECURITY DEFINER, `search_path = public`. Hash lookup only.

| Pending + unexpired + unused | `{ "ok": true, "invitee_email", "company_label", "inviter_email" }` |
| Else (missing / expired / used / short) | `{ "ok": false }` — **opaque**. No reason. Do not enumerate. |

**Who calls it:** pirin-ai server (service_role) or MCP edge. **Never** the browser with open RLS. No anon SELECT on invite tables. `GRANT EXECUTE` is `service_role` only — not `anon`, not `authenticated`.

Login page: receive `?invite=` → server verify → **sign in or** create-account **for `invitee_email` only** → issue JWT → `accept_invite`.

## Outbox + who sends mail

| Channel | Stores raw token? | Who reads |
|---------|-------------------|-----------|
| `in_chat` | **No** (`inviteToken: null`) | Optional Accept card already has it |
| `email` | **Yes** — mailer handoff so pirin-ai can send `?invite=` | service_role poller only (FORCE RLS, no SELECT policies) |

**Recipe (say once):** table stores `token_hash` only. Raw `inv_` is revealed (1) on the Accept / Auth cards returned by `invite_member`, and (2) on the `email` outbox row for the pirin-ai poller. `in_chat` never stores it.

Email payload is enough for bootstrap@ mail: who invited, invitee email, company workspace, `signupUrl` + `qrPayload` (`https://pirin.ai/bootstrap-os/login?invite=<token>`).

**From address (hard):** `bootstrap@pirin.ai` only. Never `ivelin@` / `cos@`.

**Who sends:** this repo **enqueues**. pirin-ai **owns Resend**. MCP default is mail **off** (`BOOTSTRAP_INVITE_MAIL=off`). `dry-run` builds the body for tests. There is **no prod send** from this host. On Vercel production, `invite_member` POSTs pirin `/api/bootstrap-os/invite-mail` (shared secret; www.pirin.ai only). Cron retries undelivered outbox rows. Preview never POSTs. Team members may `invite_member` for workspaces they already belong to; no Cos yes per invite.

### Poll contract (pirin-ai, service_role)

```sql
SELECT id, invite_id, payload, created_at
FROM public.bootstrap_mcp_invite_outbox
WHERE channel = 'email' AND delivered_at IS NULL
ORDER BY created_at
LIMIT 50;
```

Send From `bootstrap@pirin.ai` using `payload.signupUrl` / who / to / workspace. Then:

```sql
UPDATE public.bootstrap_mcp_invite_outbox
SET delivered_at = now()
WHERE id = $1 AND channel = 'email' AND delivered_at IS NULL;
```

Do not SELECT as `anon` / `authenticated`. Do not call Resend from ivelin/bootstrap CI.

## Isolation (preview never prod DB)

Hosted identity + invite Supabase adapters attach **only** when `VERCEL_ENV=production`. Git preview, Vercel development, GitHub Actions, Cursor Cloud Agents, and Grok Build CI use PGlite or an unset store — even if `BOOTSTRAP_SUPABASE_*` is present. Cos should also omit prod URL/key from Vercel Preview/Development; code does not trust that.

`preview-live.mjs` is Cos-only, read-only handshake/`/health`. Not in `npm run ci`. Never invite/accept/migrate.

## Rebuild from GitHub (Cos — never a PR agent)

1. Identity + fail-closed + invite migrations, in order: `20260829_bootstrap_mcp_identity.sql`, `20260909_bootstrap_mcp_fail_closed_invite.sql`, `20260910_bootstrap_mcp_invite_accept.sql`, then the label-qualify fix `20260910_bootstrap_mcp_invite_qualify_label.sql`, then the pgcrypto search_path fix `20260911_bootstrap_mcp_invite_pgcrypto_search_path.sql`, then the verify + email outbox `20260911_bootstrap_mcp_invite_verify_email_outbox.sql`, then existing-user / second-workspace `20260912_bootstrap_mcp_invite_existing_member.sql` (CREATE OR REPLACE `bootstrap_mcp_invite_member` — shipped accept / qualify / pgcrypto / verify files are not edited).
2. First user = SQL insert (link above). Do **not** apply `mcp/test/pglite/identity-schema.sql` to prod.
3. Later users use `invite_member` / `accept_invite`. Additional workspaces are extra memberships on the same user. Do not invent journey stage or Advance.

PR CI is **PGlite only**. Do not migrate, seed, or live-probe `supabase-pirin-ai`. Do not merge to `main` if `mcp-ci` or Day-0 `ci` is red. A chat claim from any agent is not evidence — `cd mcp && npm run ci` is. CI green ≠ ready for human eyes. pirin-ai production sends invite mail for member invites.

## Deferred

| | |
|--|--|
| Prod Resend | pirin-ai poller on production. This host never sends. |
| QR render / SMS | Payload includes `qrPayload` (the signup URL). Image / SMS later. |
| Login UI | Never in this repo. pirin.ai `/bootstrap-os/login` is OAuth + sign-in/create-account furniture. |
| Role enum / table rename | `bootstrap_mcp_mentees` stays the user table. Roles later on membership, not on the person. |
| Journey board ACL | Labels ≠ boards. Separate design. |

## Tests

PGlite role-play: [`E2E_ROLEPLAY.md`](E2E_ROLEPLAY.md) · `mcp/test/e2e-roleplay-matrix.test.mjs` · `mcp/test/invite.test.mjs` · `mcp/test/invite-mail.test.mjs` · `mcp/test/identity-pglite.test.mjs` (`SELECT bootstrap_mcp_invite_member` / `bootstrap_mcp_verify_invite` — no 42702 / no 42883 / opaque verify / P4 existing user second workspace / preview store refuse).

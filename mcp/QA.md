# MCP QA / merge gates

**Rule:** Do not merge to `main` until every gate below is green. Draft PRs may land incomplete code on feature branches only.

## Automated (CI must pass)

| Gate | Command / job | Pass criteria |
|------|----------------|---------------|
| Typecheck | `npm run typecheck` | zero errors |
| Build | `npm run build` | `dist/` emits index + policy + companies |
| Unit tests | `npm run test:unit` | phase gate, isolation, policy, markdown path, PGlite journey RLS, no-instance-secrets smell test |
| Cold-path smoke | `node test/cold-path.smoke.mjs` | multi-company + refuse external ask + no template writes |
| **Stdio MCP client (M1 protocol)** | `node test/stdio-mcp.client.mjs` | official SDK client over stdio: tools, init, phase gate, refuse |
| **HTTP hosted-read** | `node test/http-mcp.client.mjs` | Streamable HTTP serves OS info/docs without a local clone; write tools absent |
| **Mentee visitor matrix** | `test/mentee-visitor-matrix.test.mjs` | Claimed mentee-agent file surfaces (skills, README, marketplace.json) |
| **Hosted identity + RLS** | `identity.test.mjs` + `identity-rls.test.mjs` + `identity-pglite.test.mjs` | Path 1 alias stays open; collab-host handshake + gated tools 401 + exact WWW-Authenticate; PGlite FORCE RLS (never the live project) |
| **E2E role-play matrix** | `e2e-roleplay-matrix.test.mjs` | Empty/uninvited 401; first-user SQL insert → invited whoami; wrong/expired tokens; label isolation; P1–P4 invite/accept; **P5–P6** membership; **P7 where are we**. No prod mail. PGlite only. |
| **Invite-only company boards (cross-tenant)** | `cross-tenant-leak.test.mjs` | Unauthenticated / stranger / invited-to-A-only must not see B via journey + label tools (`q=`, typo, idea slug, webhook, list). HTTP 401/403 or empty. PGlite `held_label`. Fictional `alpha` / `bravo` / `charlie` / `delta` only. Fail the pipeline on any leak. |
| **Line coverage ≥ 80%** | `npm run test:coverage` | Node 22 `node --test` coverage on `dist/`. Lines ≥ 80. Not a substitute for the role-play matrix. |
| Markdown path | CI job `markdown-path` | portable docs + state JSON valid without MCP |

Local full CI mirror:

```bash
cd mcp && npm ci && npm run ci
```

## Hard product rules (asserted in tests)

1. Journey phase does **not** advance without `founderApprovedPhaseChange` / `allowPhaseAdvance`.
2. `evaluateExternalAsk` denies when human-eyes ≠ green (unless founder override).
3. Multi-company state is isolated by `companyId` under `BOOTSTRAP_DATA_ROOT`.
4. MCP never mutates files under `company-os/`.
5. Markdown path (point-an-AI / optional install) works with **zero** MCP usage.
6. Stdio MCP protocol serves the full tool surface to a real client.
7. OS house rules (through 2.8.13; current pack 2.8.19; spoken-card pin 2.8.20; spoken label 2.8.21): stated / synthetic / observed (observed wins); spoken yes cannot promote; no demographic one-liner seed; no Likert / naked dollar WTP; several ideas allowed (rank and kill per board); marketing volume cannot promote; there is no optimal price until people have paid and stayed; do not automate a step that should not exist; legal paper cannot promote; one founder control plane (primary + supporting + engagements; exile rejected); advisor ride-along is assumed, not observed. Initiative report card: company header → bottleneck #1 → customer bets with nested engagements → other initiatives footer. Card heading: CUSTOMER BETS. Stored kind stays customer_check. Spoken card (founder voice default): company name, then Bottleneck #1 in that company’s words, then accounts, then “Also moving (not the bottleneck)”, then open questions; hide clocks and schema unless the human says “show clocks” or “show schema”; clocks are storage. Ask / Do / Write back is a quality bar, not a card. Clock examples are teaching only — not a live board. Also: re-ground before advising; evidence bound to the exact artifact; failure becomes a small runtime policy; synthetic-consumer pretests are not customer evidence.
8. Same state furniture: a self-host or path-2 instance gets `company-state.json` + `where-are-we.py` (and schema). Pirin boards are the hosted pin (`create_company` then `create_idea`). Git-branch previews are not mentee-ready boards.
9. **No instance secrets in the template.** Specific company names, theses, scores, decision traces, and local paths stay out of OS / MCP fixtures / evals. Fictional `alpha` / `bravo` / `charlie` + `founder@example.test` only. Smell test: `test/no-instance-secrets.test.mjs`.
10. **create_idea** starts a new 0-1 board. `put_journey` does not invent a missing slug. Cos applies `20260918_bootstrap_os_create_idea.sql` on the live project — not from a PR agent.
11. **Board subscribers** persist via `public.bootstrap_os_subscribe_board` / `unsubscribe_board` / `list_subscribers` / `change_acl`. Material writes POST the JOURNEY.md webhook payload. Cos applies `20260920_bootstrap_os_board_subscribers.sql` on supabase-pirin-ai — not from a PR agent. Email stays enqueue-only. Founder-facing path is `enable_board_watch` (Cos sets `BOOTSTRAP_BOARD_WATCH_*` on Vercel once; agents call after invite; founders never paste URLs).
12. **Invite-only company boards.** Unauthenticated, non-invited, or invited-to-A-only principals must not receive company B rows (labels, comments, audit, scoreboard, owners, subscribers). Fail closed (401/403 or empty). CI gate: `test/cross-tenant-leak.test.mjs`.
13. **`create_company` / super admin.** Live `super_admin` only. Member, revoked admin, self-grant, and grant-without-admin are 403. Duplicate slug is 409 `slug_taken`. Revoking the last live super_admin is 409 `last_super_admin` with no audit row and no role change. Create of company C must not leak company B. Audit rows for grant and create. `whoami.role` is `member` | `super_admin` | `unset`. Template and test fixtures use `founder@example.test` as an illustrative `member` only, not a super_admin. Real contact addresses are never committed. A first-time hosted install must name a real super_admin email contact. The operator applies `20260928_bootstrap_os_roles.sql`, then inserts that first super_admin row by hand, outside git — not from a PR agent. `grant_super_admin` cannot run when no super_admin exists yet (it requires an existing super_admin caller). Procedure: [`docs/HOSTED_IDENTITY.md`](docs/HOSTED_IDENTITY.md#first-super-admin-hosted-install). CI: `test/company-admin-pglite.test.mjs`.

## Manual (before ready-for-review)

| # | Check | Status | Evidence |
|---|--------|--------|----------|
| M1a | **Automated** stdio protocol smoke in CI | [x] `test/stdio-mcp.client.mjs` | CI job |
| M1b | Human client (Cursor/Claude/Grok) using `config/mcp.stdio.example.json` | [x] Grok CLI 2026-08-16 CT, sandbox only | [`docs/CLIENT_CONNECT.md`](docs/CLIENT_CONNECT.md) sign-off. Not Cursor GUI. M2 still required. |
| M2 | Non-maintainer cold path | ☐ | Runbook [`docs/COLD_PATH.md`](docs/COLD_PATH.md) + sign-off form |
| M3 | Private dogfood weekly snapshot + stage-7 | [x] 2026-08-16 private instance (one week, not four) | Private files, not this template. M2 still open. |
| M4 | PR description test plan boxes checked with evidence | ☐ | PR body |
| M5 | Human-eyes for MCP still labeled honestly (`unknown` until M2) | ☐ | honest status |

## Merge / ship (multi-tool)

Proof of work is `cd mcp && npm run ci` plus root `./scripts/ci.sh`. The `user-path` job runs `npm run verify:user-path` (stdio MCP client, HTTP hosted-read, cold-path, e2e role-play including P5/P6). Node 22 also runs `npm run test:coverage` (lines ≥ 80). A chat claim from Grok Build, Cursor Cloud Agent, Claude, or any other tool is not evidence. Do **not** merge to `main` if `mcp-ci`, `user-path`, or Day-0 `ci` is red. GitHub required status checks are a Cos console setting — YAML alone does not block merge. CI green is closer to pstack user-path and is still not an independent verdict.

PR cloud agents: **PGlite only**. No migrate / seed / live-probe of `supabase-pirin-ai`. Do not run `preview-live.mjs`. Preview/dev must not attach prod identity even if `BOOTSTRAP_SUPABASE_*` is set (`VERCEL_ENV=production` only).

Ready-for-human-eyes for invite links: this host never sends. pirin-ai production drains the email outbox. CI green is necessary, not sufficient. When in doubt, hold.

## SRE / ops notes

- **Runtime:** Node ≥20. The hosted pin is the Pirin write plane. Stdio `initCompany()` is the self-host disk kit. `npm run start:http` is the local HTTP helper.
- **State:** self-host disk under `BOOTSTRAP_DATA_ROOT` (default `~/.bootstrap-os`). Pirin boards are not that directory.
- **Failure modes:** missing state file, unknown companyId, template demo mode when no instance — tools return structured errors, not silent success.
- **Secrets:** do not put API keys in company state; traces may be shared carefully (no PII). Identity tests use PGlite. Supabase env is live on `bootstrap-os-mcp` — do not print it. Never service role.
- **Rollback:** Vercel → Deployments → Redeploy / previous production on `bootstrap-os-mcp`. Path 1 (point an AI) remains the default forever; disable MCP client config to fall back. Hosted read adapter is preview only. Logs: Vercel project logs. Liveness: `GET /health`.
- **Runbooks:** [`docs/COLD_PATH.md`](docs/COLD_PATH.md), [`docs/CLIENT_CONNECT.md`](docs/CLIENT_CONNECT.md)
- **E2E / draft prod synthetic SRE:** [`docs/E2E_ROLEPLAY.md`](docs/E2E_ROLEPLAY.md) (say once). Not PR live-probe.

## Exit criteria for this PR

- [x] Automated CI workflow present
- [x] Unit + smoke + **stdio client** coverage for hard rules
- [x] Cold-path + client-connect runbooks published
- [x] Manual M1b (Grok CLI, sandbox) + first-week M3 (Pirin snapshot). M2 is **post-merge** on `main`
- [x] Maintainer decision: merge as **maintainers-only alpha**. Mentees use `main` only. Do not hand them this PR.

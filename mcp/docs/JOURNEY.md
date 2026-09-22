# FAST 0-1 journey (hosted board)

Invite-only collab pin: [`HOSTED_IDENTITY.md`](HOSTED_IDENTITY.md). After Cos applies journey SQL on pirin.ai, production `VERCEL_ENV=production` attaches the store. Preview never attaches. Tests are **PGlite only**. Login UI stays on pirin.ai. No migrate/seed/live-probe of supabase-pirin-ai from PR agents.

Ivelin yes 2026-09-01 (via Cos): one source of truth for a FAST mentee 0-1 journey. **Company and idea are separate abstractions**, not a flattened composite key.

## What this is

SQL + gated MCP tools + a thin “when to write” skill. Same payload for team / advisor / board / investor prep. Views (mermaid, two-minute snapshot, optional meeting doc) are generated. Do not store a novel. Comments never mutate phase or gate. Board status spoken to humans leads with descriptive labels; numbers are reference only. Spoken journey names: Write the bet / Filter cheaply / Ground it / Build tiny slice / Try with real people. Ask / Do / Write back is a quality bar on the week’s artifact, not a card. Stored integers stay 1–9 / 1–7 (no schema bump). Mapping: journey 1 or 2 → Write the bet; 3 → Filter cheaply; 4 → Ground it; 5 or 6 → Build tiny slice; 7 → Try with real people; 8 or 9 stay at Try until founder Advance. Loop 1 or 2 → Ask; 3–6 → Do; 7 → Write back (teaching / back-compat only — not where-we-are). `loopStage` mutations and spoken-label writes are rejected. Do not invent Advance on live boards. Make / Check / Hear are not loop weeks.

Each idea has a fluid `constraint_this_week` (short text on versioned jsonb). Not a clock. Not tickets. It is the honest biggest bottleneck — not a fun side quest. Preference / “this is interesting” cannot name it. Teaching picture, not extra law: the company only moves as fast as its weakest link. The platoon only moves as fast as the slowest soldier. Work that is not on that link is not progress. `get_journey` / “Where are we” must surface the field (and challenge a side quest dressed as the bottleneck). Writes emit an append-only audit row. Refuse “new landing page” when no one has talked to customers unless the founder writes an override. Do not rubber-stamp.

Research/traces stay local to the founder. Do not lift `~/.bootstrap-os`.

## Schema (apply later on pirin.ai; not from this PR)

See [`../supabase/migrations/20260902_bootstrap_os_journey.sql`](../supabase/migrations/20260902_bootstrap_os_journey.sql). PGlite fixture: [`../test/pglite/journey-schema.sql`](../test/pglite/journey-schema.sql).

Seed slugs exist **only** in the PGlite fixture: `dyeconverter`, `corehaul`. One default idea each. Fixture emails are synthetic `@example.test`. Real FAST emails are not in git.

Allowlist in SQL, fail closed. Token `email` (fallback `sub`) → ACL. No FAST claim on the JWT.

## Hard rule — invite-only company boards

Ivelin HARD (via Bootstrap Bill): company board/data access is invite-only. There is no room for cross-company leaks.

| Principal | `get_journey` / `put_journey` / `put_portfolio_score` / `post_comment` / `subscribe_*` / `list_*` / labels |
|-----------|-----------------------------------------------------------------------------------|
| Unauthenticated or non-invited | Fail closed: HTTP **401/403 or empty**. Never another company's rows. |
| Invited to company A only | May see A. Must **not** see company B (or any other) data, labels, comments, audit, scoreboard, owners, subscribers beyond ACL. |
| Multi-membership | Only companies on their invite / `bootstrap_company_labels` / ACL list. No bleed via `q=`, company slug typos, idea slug, webhook, or list endpoints. |

Hosted membership is `bootstrap_os_held_label` → `bootstrap_company_labels` (same companies as whoami). Journey table RLS is company ACL. Both fail closed. CI must attempt cross-tenant reads/writes and **fail the pipeline on any leak**: [`../test/cross-tenant-leak.test.mjs`](../test/cross-tenant-leak.test.mjs). Identity pin: [`HOSTED_IDENTITY.md`](HOSTED_IDENTITY.md).

Append-only `audit_events` hang off company + optional idea (ACL is company-level). Who, when, which client, what changed. Inserts only — no update/delete policies. `put_journey`, `post_comment`, ACL, and subscribe/unsubscribe emit a row. Advisors may read audit for companies they can `get_journey`. They cannot write audit except via those tools.

Provenance is audit `what_changed` before/after (clocks + full scoreboard) plus first-class `gate_events`. `list_provenance` rebuilds the board at any point in range. Every Advance/Iterate/Hold/Kill stores short `whatChanged` + `whatWereNotDoing` (optional `evidenceLinks`). Kill REQUIRES a postmortem on the scoreboard (`why` + `lessonsLearned` + `actionableInsights`); silent kill is rejected; killed ideas stay readable; `get_journey` surfaces ☠ Killed cards from stored fields only. Subscriber audit omits `webhookUrl` — the live URL stays on ACL’d `list_subscribers` only, never in append-only provenance. Cos applies `20260921_bootstrap_os_list_provenance.sql` on pirin.ai — not from this PR.

Weekly portfolio scores live on the idea scoreboard as `portfolioScore: { impact, evidence, leverage, why, scoredAt?, scoredBy? }`. Each axis is an integer 1–5. **why** is a required short sentence (≤280) on write — stored on the score and copied into audit `what_changed` before/after. Never invent a missing why on read. Plain-founder meaning: **impact** = if this works, how much does it change the beachhead; **evidence** = how much of that is observed, not hoped; **leverage** = how much this team can uniquely do from here. Applies when a company has **two or more live (non-kill) ideas**. Rank = `impact + evidence + leverage` (higher first; slug tie-break). Unscored live ideas stay in `portfolio.unscored` — never invent a number on read. Killed ideas stay off the live rank (still readable on kill cards). Scores are founder/advisor labels. They cannot Advance, Iterate, Hold, or Kill. Write: `put_portfolio_score` (or `put_journey.portfolioScore`). Single-idea boards skip with that reason. Score-only writes do not fire board-subscriber notify. Cos applies `20260922_bootstrap_os_portfolio_score.sql` on pirin.ai — not from this PR. No cron, no Resend, no webhook teaching in this slice.

`board_subscribers` hang off the company (optional idea). After ACL: only people who already have access may be subscribed. Team members (employees, advisors, co-founders, investors, bots) receive only if they already have access. On `put_journey` / `post_comment` / `gate_events`, emit audit then fire the webhook to subscribers who may still read that row. Email is **enqueue-only** — Resend lives on pirin.ai. This repo does not send mail.

### Cos digest (smell-check)

`get_journey` returns `owners` and `acl` from the company ACL. Digest / board “owner” is those founder principals — not a free-text `owner` field Cos invents. `put_journey` strips invented owner keys from scoreboard jsonb.

Prefer webhook / material-change notify (`board_subscribers` / `notify_outbox`) over polling `get_journey`. Digests must not invent stage or Advance. Comments never move gates. Advance / Iterate / Hold / Kill stay human founder labels.

### Webhook payload (Web Builder)

No PII dump. Same shape for webhook and the email contract row:

```json
{
  "company": { "slug": "exampleco", "label": "Example Co" },
  "idea": { "slug": "default", "name": "Default" },
  "event": "put_journey",
  "who": "acl-principal",
  "at": "2026-09-02T00:00:00.000Z",
  "summary": "short comment-or-change summary"
}
```

`event` is `put_journey` | `post_comment` | `gate_event`. `idea` is null for company-only events. `who` is the actor already on the ACL. `summary` is ≤80 characters.

After Cos applies `20260920_bootstrap_os_board_subscribers.sql`, production MCP POSTs this JSON to each eligible subscriber https URL on a successful `put_journey` / `post_comment` (and `gate_event` when that is the write). Delivery failure does not roll back the board. Email stays enqueue-only — Resend lives on pirin.ai.

### Board watch (Bill)

Cos sets Vercel secrets **once** on `bootstrap-os-mcp` production: `BOOTSTRAP_BOARD_WATCH_URL` (https), `BOOTSTRAP_BOARD_WATCH_PRINCIPAL` (email), optional `BOOTSTRAP_BOARD_WATCH_PRINCIPAL_KIND` (`email`|`sub`, default `email`). Do not print those values. Agents call `enable_board_watch` after invite. Founders never paste URLs. Unset or non-https env fail closed as `{ ok: false, error: "board_watch_unset" }`. Auto-subscribe on `accept_invite` is a later slice.

## Tools (gated; public OS tools stay listed after auth on the collab host)

| Tool | Who | Notes |
|------|-----|--------|
| `get_journey` | founder / advisor on the allowlist | Company query → every idea. Company/idea → one idea. Print spoken first. Hide clocks/schema unless the human says show clocks. Render the founder-facing spoken card without a clarification round: company name, then Bottleneck #1 in that company’s words, then accounts (where it stands / next), then “Also moving (not the bottleneck)”, then open questions. Hide clocks and schema unless the human says “show clocks” or “show schema”. Clocks are storage. Payload lead is spoken; snapshot is not a clock dump. Surfaces top-level `card` from `initiatives[]`. When `initiatives[]` is present, dual-read of `progress[]` / `supporting[]` / `engagements[]` is dead for the card lead (empty `initiatives[]` still dual-reads old fields). Default payload is compact (no full audit — use `list_provenance`). ACL `owners`, stored `portfolioScore` on live ideas, and `portfolio` ranked by impact+evidence+leverage when ≥2 live ideas. Never invents missing scores. `progress[]` is not card body. |
| `create_company` | live `super_admin` | New company slug + membership label for the caller. Founder yes and a why. Does not create an idea — caller then `create_idea`. Global duplicate slug → 409. Anyone else → 403 with an empty body (no other company rows). Audit who / slug / why. |
| `grant_super_admin` / `revoke_super_admin` | live `super_admin` | Grant or revoke another login. No self-grant (403). Revoke is immediate. No self-serve signup. Audit the grant and the revoke. |
| `create_idea` | founder + founder-authorized | New 0-1 primary board under a held company. Empty clocks (Write the bet / hold; stored 1 / 1). A person or instrument as the primary object is rejected — write supporting[]. Founder yes in chat. Does not invent stage. Ask / Do / Write back is a quality bar, not a card. |
| `put_journey` | founder + founder-authorized | Overwrite journey/gate/jsonb including `initiatives[]` on an **existing** idea. New writes prefer `initiatives[]` and clear `progress` / `supporting` / `engagements` (jsonb `-`; shallow `||` cannot delete). Dual-read is dead for the card lead when `initiatives[]` is present. Missing slug → `idea not found; call create_idea first`. Primary phase needs founder yes and a product bet-class why. Recon may patch initiatives + constraint; recon may not Advance primary. Mapping cannot Advance. `loopStage` mutations and spoken Ask/Do/Write back writes are rejected. |
| `post_comment` | advisors | Side table. Never a gate. |
| `subscribe_board` | founder + founder-authorized | Grant webhook (+ email opt-in enqueue) to an ACL member. Cos / adapter furniture — not the founder path. |
| `unsubscribe_board` | founder + founder-authorized | Remove a subscriber. |
| `list_subscribers` | anyone who may `get_journey` | Company the caller can read. |
| `enable_board_watch` | founder + founder-authorized | Turn on board updates for Bill. Reads Cos-set Vercel env (URL + principal). Founders never paste a URL. |
| `list_provenance` | anyone who may `get_journey` | Ordered audit + gate events with before/after. Invite-only / held_label fail-closed. |
| `put_portfolio_score` | founder + founder-authorized | Weekly Impact/Evidence/Leverage 1–5 plus required short `why` (≤280) on one live idea. Skip if fewer than two live ideas. Never changes clocks or gates. |

HTTP 401 + `WWW-Authenticate: Bearer … resource_metadata=…` on gated `tools/call` without a token. Cookie-less handshake on the invite-only collab host is also 401. Path 1 founders use GitHub + local — they are not told to connect this host.

Listed on the production pin when the journey store is attached (Cos SQL applied). The self-host stdio kit does not register them (do not lift local traces). Membership is `bootstrap_company_labels` — same companies as whoami. `whoami.role` is `member`, `super_admin`, or `unset`. Hosted callers do not call `bootstrap_init_company`; a super admin calls `create_company`, then `create_idea`. Cos applies `20260928_bootstrap_os_roles.sql` on pirin.ai — not from a PR agent. The committed seed is `founder@example.test` as `member` only.

## Out

No login UI in this repo. No snapshot UI. No marketplace. No Grok Bot template. No FAST mentee names or emails in public markdown.

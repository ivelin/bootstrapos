# Bootstrap OS MCP (self-host kit and hosted pin)

**What this is / is not:** see root [`ROADMAP.md` §0](../ROADMAP.md) — MCP is adapter furniture to the control plane, not a second OS, harness, or memory product.

**Markdown is the constitution.** Front door is still **path 1**: point an AI at https://github.com/ivelin/bootstrapos — no install. Path 2 is optional instance files / CLI + `.grok/workflows`. **This package is the OSS self-host kit** (stdio on your disk via `initCompany()`, or deploy `mcp/` on your own Vercel + Supabase). It is not the Pirin-supported mentee source of record. The Pirin write plane is the hosted pin. Several ideas are allowed. Each company is its own board. Rank and kill per board.

| Path | Who it is for | Dependency |
|------|----------------|------------|
| **1. Point an AI** | Everyone (default). Constitution. | None |
| **2. Optional instance / CLI** | Notes in your repo. Not the source of record. | `./scripts/install-instance.sh` |
| **Self-host kit (this package)** | Your own disk or your own Vercel + Supabase | Node 20+, this package |
| **Hosted MCP** | Pirin-supported mentees | Pin `https://mcp.bootstrap.pirin.ai/mcp` (handshake 401). Super admin calls `create_company`, then `create_idea`. Free docs = GitHub + install-os + local — not a hosted MCP connector. Git-branch previews on `*.vercel.app` (same 401 as collab, not a silent 200, not mentee-ready boards). Contract: [`docs/HOSTED_IDENTITY.md`](docs/HOSTED_IDENTITY.md). No public catalog submit (team Import from Repo only). Not pirin.ai. |

Same state as markdown: `company-state.json` + `where-are-we.py`. Isolation is hard: no shared phase/evidence across `companyId`. MCP never writes `company-os/` template files.

---

## Connector model

```text
  One bootstrap-os MCP process
           │
     ┌─────┼─────┐
     ▼     ▼     ▼
   alpha  bravo  charlie   ← isolated instances under BOOTSTRAP_DATA_ROOT
```

| Path | Role |
|------|------|
| `$BOOTSTRAP_DATA_ROOT` (default `~/.bootstrap-os`) | Registry + instances |
| `…/registry.json` | Active company + catalog |
| `…/instances/<companyId>/` | That company's state + traces only |

Product code stays in its own repo. Point the agent at this connector once.

---

## Tools (v0.2)

### Multi-company

| Tool | Purpose |
|------|---------|
| `bootstrap_list_companies` | List instances + which is active |
| `bootstrap_init_company` | Create isolated instance (state + traces) |
| `bootstrap_use_company` | Switch active company for session + registry |

### Process / active company only

| Tool | Purpose |
|------|---------|
| `bootstrap_os_info` | Modes, versions, data root, active paths, support email |
| `bootstrap_support` | How to email `bootstrap@pirin.ai` (human-routed, not auto-fix) |
| `bootstrap_list_docs` / `bootstrap_get_doc` / `bootstrap_get_ai_instructions` | Blueprint |
| `bootstrap_reference_clocks` | Five journey rungs + five loop weeks (stored 1–9 / 1–7 still map) |
| `bootstrap_get_state` | Active `company-state.json` |
| `bootstrap_where_are_we` | Status visibility (active only) |
| `bootstrap_next_evidence` | Evidence for next phase/stage |
| `bootstrap_agent_focus` | Session work order |
| `bootstrap_update_state` | Patch active (phase advance gated) |
| `bootstrap_set_ready_for_human_eyes` | unknown / blocked / green |
| `bootstrap_ready_checklist` | Checklist + status |
| `bootstrap_log_decision` | Trace under active company |
| `bootstrap_refuse_external_ask_if_not_green` | Fail-closed external asks |

### Hosted-only (optional auth)

| Tool | Purpose |
|------|---------|
| `bootstrap_whoami` | Who is signed in, which **companies** they can open, and `role` (`member`, `super_admin`, or `unset`). [`INVITE.md`](docs/INVITE.md). |
| `create_company` | Super admin creates a company (membership only). Then `create_idea`. Duplicate slug is 409. Others get 403 with an empty body. |
| `grant_super_admin` / `revoke_super_admin` | Live super admin grants or revokes another login. No self-grant. Revoke is immediate. |
| `bootstrap_list_companies` | Same company list. (`bootstrap_list_company_labels` is a one-release alias.) |
| `bootstrap_use_company` | This chat is about one company the user already belongs to. |
| `invite_member` | Invite someone to a company you can open. Same email may join several companies. Email outbox for pirin-ai (`bootstrap@pirin.ai`; production sends). [`INVITE.md`](docs/INVITE.md). |
| `accept_invite` | Invitee JWT + one-time token → user + workspace membership. Existing users gain an additional team — not a second account. Fail-closed on wrong email / expired / replay. Same token as `?invite=`. |

Hard rules (OS 2.8.9):

- Journey phase does **not** change unless `founderApprovedPhaseChange=true`
- Human-eyes **green** is not demand or PMF
- Blueprint under `company-os/` is never written by MCP
- **Busy is not progress** — activity without evidence is not advancement
- **No cross-company writes**
- Weigh **stated / synthetic / observed** — observed wins a clash
- A spoken yes cannot promote a customer group
- Do not seed a persona from a demographic one-liner (demo-only role-play is the weak case)
- Do not ask a sim for a Likert or a naked dollar WTP — a choice or a sentence, then map
- Several ideas are allowed — each `companyId` is its own board; do not hide a second idea to look focused; rank and kill per board
- Marketing volume cannot promote
- There is no optimal price until people have paid and stayed
- Do not automate a step that should not exist. Automate last. An agent team is automation.

---

## Install (local)

From the Bootstrap OS clone:

```bash
cd mcp
npm install
npm run build
```

### Multi-company (recommended)

```bash
export BOOTSTRAP_OS_ROOT=/path/to/bootstrap   # template clone (docs + blank templates)
export BOOTSTRAP_DATA_ROOT=$HOME/.bootstrap-os  # optional; this is the default
# do NOT set BOOTSTRAP_INSTANCE_ROOT if you want multi-company
```

Then in the agent:

1. `bootstrap_init_company` — `companyId: "alpha"` (and bravo, charlie, …)
2. `bootstrap_use_company` — switch when the conversation is about another idea
3. `bootstrap_where_are_we` / `bootstrap_next_evidence` — always on the **active** company

### Single-company env (backward compatible)

```bash
export BOOTSTRAP_OS_ROOT=/path/to/bootstrap
export BOOTSTRAP_INSTANCE_ROOT=/path/to/one-company-instance
```

---

## Client config (one connector)

See [`config/mcp.stdio.example.json`](config/mcp.stdio.example.json).

```json
{
  "mcpServers": {
    "bootstrap-os": {
      "command": "node",
      "args": ["/absolute/path/to/bootstrap/mcp/dist/index.js"],
      "env": {
        "BOOTSTRAP_OS_ROOT": "/absolute/path/to/bootstrap",
        "BOOTSTRAP_DATA_ROOT": "/absolute/path/to/.bootstrap-os"
      }
    }
  }
}
```

### Hosted read (preview)

Same package. Production entry is the Vercel request handler (`api/mcp.ts` + `api/health.ts`). `npm run start:http` is a local helper only.

Same public read tool names as today (`bootstrap_os_info`, docs, house-rule pins, `bootstrap_support`). Fetches the published GitHub repo (`BOOTSTRAP_OS_DOCS_SOURCE=published`). Invite-only collab host 401s cookie-less `initialize` / `tools/list` / GET SSE; public OS tools stay listed **after** auth. The pin is the Pirin write plane. Hosted callers do not call `bootstrap_init_company`. Free docs are GitHub + install-os + local — not this host as a docs CDN.

Optional gated tools on this host only: `bootstrap_whoami` (includes `role`), `bootstrap_list_companies` (alias `bootstrap_list_company_labels`), `bootstrap_use_company`, `invite_member`, `accept_invite`, `create_company`, `grant_super_admin`, and `revoke_super_admin`. Unauthenticated calls return HTTP 401 + `WWW-Authenticate` pointing at this MCP origin RFC 9728 (`authorization_servers` = pirin.ai login). Login UI is `/bootstrap-os/login` (Web Builder), not this repo. Accept path is in-chat; outsider signup is `?invite=` — [`docs/INVITE.md`](docs/INVITE.md). A super admin calls `create_company`, then `create_idea`. Contract: [`docs/HOSTED_IDENTITY.md`](docs/HOSTED_IDENTITY.md).

Invite-only collab / Grok pin is `https://mcp.bootstrap.pirin.ai/mcp`. Git-branch public preview is `*.vercel.app` (undeclared deploy-only, not a pin). Project `bootstrap-os-mcp` under `ivelins-projects-9f9b7132`. Not mentee-ready boards. No public catalog submit (team Import from Repo only). Not pirin.ai. Path 1 stays the front door.

```bash
cd mcp
npx vercel --prod --yes --scope ivelins-projects-9f9b7132
```

First time: create project `bootstrap-os-mcp` in that team (CLI may prompt for the name; `--name` is deprecated). Never `v0-pirin-ai-founder-studio`.

Never deploy this adapter to `v0-pirin-ai-founder-studio` or any pirin.ai host.

---

## Privacy

| Data | Self-host kit | Hosted pin |
|------|----------------|------------|
| Blueprint | Read from your clone | Fetch published GitHub repo (no login) |
| Company state | Disk under data root, **per company**, via `initCompany()` | Hosted boards for invited companies. `create_company` then `create_idea`. |
| Identity | None (local files) | Whoami + labels + `role` on pirin.ai Supabase + RLS |
| Cross-tenant | **Denied** | **Denied** (RLS + pirin.ai access token). Tests lock it. |
| Leaderboards | Out of scope | Never |

---

## Hosted vs self-host

| | Self-host kit | Hosted pin |
|--|----------------|------------|
| Public OS tool names | Same | Same. Listed after auth on the collab host. |
| Writes | `bootstrap_init_company` on your disk, or your own deploy of `mcp/` | `create_company` (super admin) then `create_idea`. Do not call `bootstrap_init_company`. |
| Replaces Path 1? | No | No |
| Pirin mentee source of record? | No | Yes, for invited companies on the pin |
| First-user fixture | Local instances if they init them | Can list three **labels** (`alpha`, `bravo`, `charlie`) after allowlist invite + login. First user is a SQL insert — [`HOSTED_IDENTITY.md`](docs/HOSTED_IDENTITY.md#first-user-rebuild-from-github). Later members: in-chat [`INVITE.md`](docs/INVITE.md). Template seed is fictional `founder@example.test` as `member`. |

---

## Non-goals

- Replacing the open-source markdown pack or becoming the front door
- Auto-advancing journey phases
- Blended multi-idea scoreboard
- Writing into `company-os/` template files
- Treating `~/.bootstrap-os` as the Pirin mentee source of record
- Weekly market-radar jobs
- Seeding personas from a demographic one-liner
- Likert or naked-dollar WTP from a sim

---

*You supply the insight. AI supplies the speed. MCP is optional furniture.*

## Roadmap

High-impact plan, dogfood protocol, and kill criteria: [`../ROADMAP.md`](../ROADMAP.md).

---

## CI & tests

| Command | Purpose |
|---------|---------|
| `npm run typecheck` | Strict TypeScript |
| `npm run build` | Emit `dist/` |
| `npm run test:unit` | Hard-rule unit tests (phase gate, isolation, policy, markdown path, PGlite journey RLS) |
| `npm run test:smoke` | Cold-path multi-company smoke |
| `npm run test:stdio` | Real stdio MCP client (M1 protocol) |
| `npm run test:http` | Streamable HTTP hosted-read (no local clone) |
| unit `identity` / `identity-rls` / `e2e-roleplay-matrix` | Optional whoami + RLS + CTO/PM role-play (PGlite). Invite tools pending. |
| `npm run start:http` | Preview HTTP read adapter |
| `npm run ci` | Full local CI mirror |

Merge gates and manual checklist: [`QA.md`](QA.md).

GitHub Actions: `.github/workflows/mcp-ci.yml` (Node 20 + 22).

Runbooks: [`docs/COLD_PATH.md`](docs/COLD_PATH.md) · [`docs/CLIENT_CONNECT.md`](docs/CLIENT_CONNECT.md) · [`docs/JOURNEY.md`](docs/JOURNEY.md) · [`docs/E2E_ROLEPLAY.md`](docs/E2E_ROLEPLAY.md) · [`QA.md`](QA.md)

**This branch:** gated journey tools + SQL (PGlite tests only). Not on the production pin. Do not merge. Invite-only collab pin: [`docs/HOSTED_IDENTITY.md`](docs/HOSTED_IDENTITY.md). Journey contract: [`docs/JOURNEY.md`](docs/JOURNEY.md).

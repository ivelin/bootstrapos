# Bootstrap OS

**Portable company operating system for solo founders in the 0→1 journey.**

Not the Bootstrap CSS / UI framework ([getbootstrap.com](https://getbootstrap.com)). This repo is process and control for a company: two clocks, founder gates, honest evidence.

Use this repo as the **source of truth** for process and control. Point your AI here and apply what fits *your* startup. Instantiate blank files in *your* product repo only when you want them — fill only *your* thesis, customer groups, scores, and open questions.

| | |
|--|--|
| **Version** | Blueprint + live runtime **v2.8.12** · optional local MCP **v0.2** (path 3) |
| **License** | Apache-2.0 |
| **Audience** | Independent solo founders; mentors (Founder Institute, SCORE, …); AI helpers |
| **Maintainer** | [Ivelin Ivanov](https://github.com/ivelin) · [Pirin.ai](https://pirin.ai) |
| **Install** | [pirin.ai/bootstrap-os](https://pirin.ai/bootstrap-os) |
| **Canonical repo** | [github.com/ivelin/bootstrapos](https://github.com/ivelin/bootstrapos) |

---

## Mental model (blueprint vs weekly loop)

```text
BLUEPRINT (how to decide)              LIVE RUNTIME (how to learn every week)
company-os/operating-system.md         company-os/live-runtime.md
  five journey rungs                     persistent state (personas, traces, scores…)
  founder gates + honest evidence        five-week loop → Write back → Ask again
  reward/risk + virtual office           git remembers; day tools may feed it
  (cards stay; jobs optional)            optional: founder-day + skill-capture
```

**Golden rule:** Copy *process and control*. Do **not** copy another founder’s market, ICP list, feature roadmap, or “current hypothesis.”

---

## What’s in this repo

| Path | What it is |
|------|------------|
| [`company-os/operating-system.md`](company-os/operating-system.md) | **Blueprint** — principles, five journey rungs, gates, evidence labels, next pack, Ready for human eyes, growth pack |
| [`company-os/after-proof-efficiency.md`](company-os/after-proof-efficiency.md) | **After proof** — five instruments (fences + they asked). Not Day 0. |
| [`company-os/live-runtime.md`](company-os/live-runtime.md) | **Live OS shape** — durable state + five-week loop + eval harness ideas |
| [`company-os/ready-for-human-eyes.md`](company-os/ready-for-human-eyes.md) | **Ship gate checklist** — cold URL + happy path before external product-test asks |
| [`company-os/ai-instructions.md`](company-os/ai-instructions.md) | Thin enforcement layer — paste into `AGENTS.md` / Cursor / Claude / Grok |
| [`company-os/first-hour.md`](company-os/first-hour.md) | **Day 0 (~60 minutes)** — thesis, ≥3 ICPs, first “Where are we?” (chat or instance files). The two-minute figure is the snapshot *read*, not this hour. |
| [`templates/`](templates/) | Blank files to copy into *your* company repo when you instantiate |
| [`examples/`](examples/) | Pointers to public live instances (illustration only) |
| [`.grok/workflows/`](.grok/workflows/) | Optional Grok Build workflows (path 2) — company-operating-loop, user-research, ready-for-human-eyes |
| [`mcp/`](mcp/) | **Optional path 3** — local MCP adapter (one connector, isolated instances). Not a second OS. HTTP read transport is preview only. |
| [`plugin/`](plugin/) | **Preview** Cursor/Grok Agent Plugin — skills hyperlink this pack. Team Import from Repo only — not a public catalog submit. |

This repo is **template only**. Filled company state never lives here.

---

## How to use this (pick one)

Compatible paths. Start at **1**. Later rungs are opt-in. Several ideas are allowed; each stays *your* company on its own board.

### 1. Point an AI at this pack (default)

No copy, no script, no CLI, no MCP. Use what applies to *your* startup immediately.

```text
Take the Bootstrap OS from https://github.com/ivelin/bootstrapos
(company-os/operating-system.md + live-runtime.md + ai-instructions.md).
Bootstrap OS is a company operating system for solo 0-1 founders.
It is not the Bootstrap CSS framework.
Apply process and control to MY startup only.
Do not import any other company's product thesis or market.
```

Then Day 0 (~60 minutes) — thesis, ≥3 customer groups, first “Where are we?”: [`company-os/first-hour.md`](company-os/first-hour.md). Chat plus a weekly ritual is enough. Lifestyle / small good business, or swinging for the fences? [Day 0](company-os/operating-system.md#day-0-lifestyle-or-swinging-for-the-fences).

Hands-on page: [Install Bootstrap OS](https://pirin.ai/bootstrap-os).

### 2. Instantiate files (when you want them in your repo)

Optional. Script or hand copy — [Install](#install-in-your-company). Optional Grok Build workflows live in [`.grok/workflows/`](.grok/workflows/) (`company-operating-loop`, `user-research`, `ready-for-human-eyes`) if present — same rung, not the only front door. One idea per repo is fine; several ideas each get their own board.

### 3. Self-hosted MCP (optional — several ideas)

Several ideas are allowed. Do not hide a second thesis to look focused. Optional local MCP under [`mcp/`](mcp/) keeps each idea on its own board — `company-state.json` + `where-are-we.py` — without importing this tree into every product repo. Same founder gates. Same evidence rules (OS 2.8.12). Rank and kill per board. Markdown remains the constitution.

Not required. Path 1 (point an AI) and path 2 (optional files + workflows) stay enough.

```bash
cd mcp && npm install && npm run build
```

One stdio connector, many `companyId`s: [`mcp/README.md`](mcp/README.md). MCP never writes `company-os/` template files.

### 4. Hosted MCP (preview — not mentee-ready)

A **preview** plugin lives in [`plugin/`](plugin/): thin skills that hyperlink this repo, plus an optional Streamable HTTP **read** adapter in [`mcp/`](mcp/). Team Import from Repo only — not a public catalog submit. It is not a second front door. Path 1 stays default.

The hosted slice is invite-only collab: OS info, docs, house-rule pins. Pin `https://mcp.bootstrap.pirin.ai/mcp` 401s the handshake. Free docs are GitHub + [install-os](https://pirin.ai/bootstrap-os) + local — not a hosted MCP connector. The Vercel production Host is the same 401, not a silent 200 alias. Gated whoami + labels return 401 + `WWW-Authenticate` to this MCP origin RFC 9728 (`authorization_servers` = pirin.ai login); login is `/bootstrap-os/login` (Web Builder; not this repo). Contract: [`mcp/docs/HOSTED_IDENTITY.md`](mcp/docs/HOSTED_IDENTITY.md). Markdown on GitHub remains the constitution. Founder `company-state` stays on path 3 local stdio — not on a shared server.

There is a **preview** git-branch read adapter on `*.vercel.app` (not mentee-ready boards, not a public catalog submit, not pirin.ai, not a Path 1 pin). `plugin/mcp.json` pins the collab host; `${BOOTSTRAP_MCP_URL}` can override. No day-one SaaS boards. Do not use `mcp.pirin.ai` (dead).

Invited founders who want Bill: [Install Bootstrap Bill](docs/install-bill.md). That is not Path 1.

---

## Install in your company

Optional (path 2). From this repo:

```text
./scripts/install-instance.sh /path/to/your-company
```

That copies `templates/` into the target and merges [`company-os/ai-instructions.md`](company-os/ai-instructions.md) into the instance `AGENTS.md`. If present, optional Grok Build workflows also copy to `.grok/workflows/`. You can run them with `grok` by name without making install the only front door.

Then do **Day 0 (~60 minutes)**: [`company-os/first-hour.md`](company-os/first-hour.md) (also copied to `docs/company-os/first-hour.md` in the target). Fill thesis, ≥3 ICP scorecards, first “Where are we?” — *your* company only. The two-minute figure is the snapshot *read*, not this hour.

**Manual copy:** if you cannot run the script, use the copy map in [`templates/README.md`](templates/README.md) and paste the fenced block from [`company-os/ai-instructions.md`](company-os/ai-instructions.md) into the instance `AGENTS.md`.

Start with markdown + a weekly “Where are we?” ritual. Add agent frameworks only when they reduce pain.

Local CI is `./scripts/ci.sh`.

---

## Two clocks (the whole game)

| Clock | Question | Changes when |
|-------|----------|--------------|
| **Bootstrap journey** (five rungs: Bet / Filter / Ground / Build / Try) | Where is this bet on the prove-it path? | Founder **Advance / Iterate / Hold / Kill** |
| **Live loop** (five weeks: Ask / Make / Check / Hear / Write) | What are we learning this week? | Continuous; many cycles inside one journey rung |

AI never advances a journey phase alone. Evidence beats narrative. Waitlists and synthetic research are filters, not product–market fit.

---

## Template change policy

Treat promotion into this template as rare, deliberate work — not a continuous sync from any product PR.

| Layer | Default |
|-------|---------|
| **Instance** (your `applied-here.md`, product code, scores) | Update freely as *your* company learns (public-safe; no PII) |
| **Template** (files under `company-os/`) | **Do not change** unless the maintainer **explicitly approves** a portable edit |

### When a change may enter the template

1. **Slow** — many product iterations before one template change  
2. **Methodical** — name the pattern, why it is domain-agnostic, how mentees might misuse it  
3. **Thoughtful** — principle + checklist over markets, stacks, or one-off workflows  
4. **Approval-gated** — short delta (what / why / where); wait for explicit approval  
5. **Instance-first** — keep company-specific application in that company’s repo  
6. **Additive, rarely breaking** — founders adopt this for months. New packs sit beside existing ones. Do not rename clocks, restack the loop, or drop a gate without a named version note. Optional until useful.

### Anti-patterns

- Auto-promoting every product win into the OS  
- Copying a beachhead market, MCP stack, or pricing into the blueprint “because we use them”  
- Silent template edits inside product PRs without template approval  
- Moving sand: a rewrite that makes last month’s snapshot unreadable  
- **Instance secrets in the template** — specific company names, theses, scores, decision traces, local paths, or other confidential instance data in `company-os/`, `mcp/` fixtures/migrations, plugin, skills, or tests. Fixtures are fictional (`alpha` / `bravo` / `charlie`). CI smell test: `mcp/test/no-instance-secrets.test.mjs`.  

---

## Versioning

| Doc | Current |
|-----|---------|
| Operating system blueprint | **v2.8.12** |
| Live runtime | **v2.8.12** |
| Optional local MCP (path 3) | **v0.2** — adapter only; not a second OS. HTTP read transport is preview. |
| Preview plugin | **0.1.1** — [`plugin/`](plugin/). Skills hyperlink this pack. Team Import from Repo only — not a public catalog submit. Not mentee-ready hosted boards. |

### Recent portable additions

**v2.8.12 — founder checkpoints (QC / Bind / Clock / Alpha)**  
Additive pack. Optional until useful. Absent checkpoints = 2.8.9 behavior. QC Hold is path-local; it does not freeze the journey. Alpha is a written five-field bet against the default recommendation. No tenth phase. No third clock. No schema bump. Full text: [founder checkpoints](company-os/operating-system.md#founder-checkpoints-when-human-judgment-is-the-work).

**v2.8.11 — advisor ride-along is assumed, not observed**  
House rule. Full text: [operating-system.md](company-os/operating-system.md#house-rule-advisor-ride-along-is-assumed-not-observed). Same family as 2.8.6–2.8.10; do not merge. An advisor's opinion is a tip, not proof. Write down who said it. Do not delay a paying customer.

**v2.8.10 — legal paper cannot promote**  
House rule. Full text: [operating-system.md](company-os/operating-system.md#house-rule-legal-paper-cannot-promote). Same family as 2.8.6–2.8.9; do not merge. Cap table, SAFE, and lawyer emails do not prove the product works.

**After proof — efficiency (fences)**  
Resource page, not a house rule, not a version bump. Open only if fences + proof + they asked: [after-proof-efficiency.md](company-os/after-proof-efficiency.md).

**v2.8.9 — do not automate a step that should not exist**  
House rule. Full text: [operating-system.md](company-os/operating-system.md#house-rule-do-not-automate-a-step-that-should-not-exist). Same family as 2.8.6 / 2.8.7 / 2.8.8; do not merge. Name the person. Delete first. Automate last. An agent team is automation. Name the one bottleneck this week and work that. Several ideas may attack that same bottleneck.

**v2.8.8 — there is no optimal price until people have paid and stayed**  
House rule. Full text: [operating-system.md](company-os/operating-system.md#house-rule-there-is-no-optimal-price-until-people-have-paid-and-stayed). Same family as 2.8.6 / 2.8.7; do not merge. Stay current; do not guide to where the puck has been. Day 0 / Path 1 question (not a house rule; not this essay): [lifestyle or swinging for the fences](company-os/operating-system.md#day-0-lifestyle-or-swinging-for-the-fences).

**v2.8.7 — a security program cannot promote**  
House rule. Full text: [operating-system.md](company-os/operating-system.md#house-rule-a-security-program-cannot-promote). Preview plugin pointer (not a house rule): [`plugin/`](plugin/) — hyperlinks only; team Import from Repo only, not a public catalog submit; hosted read adapter is preview, not mentee-ready boards.

**v2.8.6 — marketing volume cannot promote**  
House rule. Full text: [operating-system.md](company-os/operating-system.md#house-rule-marketing-volume-cannot-promote). Writing: [Say it once. Link. No filler.](company-os/operating-system.md#how-this-os-may-change-stability-contract)

**v2.8.5 — several ideas are allowed**  
Each idea is its own thesis, instance, and scorecard. Do not hide a second idea to look focused. Rank and kill per board.

**v2.8.4 — additive weekday packs + stability contract**  
Nothing established was removed. Founder-day and skill-capture sit beside existing rituals and are skippable until real conversations exist. Virtual-office cards stay; the partner may call jobs for a card. Day tools may feed the snapshot; git remains memory. After proof: overnight drafts still unsent; if the channel is public writing, one lived insight beats a content calendar. [Additive diagram](docs/diagrams/os-v2.8.4-before-after.html).

**v2.8.3 — demo-only role-play is the weak case**  
Do not seed a persona from a demographic one-liner. Seed from traces. Sharpening of thesis-only-is-weaker.

**v2.8.2 — honesty pass**  
House rules labeled (observed wins; spoken yes cannot promote). Dollar/Likert qualified. Load-bearing cites: Bisbee 2024, Brand 2026 §3.3.

**v2.8 — Ready for human eyes (ship gate)**  
Fail-closed cold URL + happy path before mentor/user product-test asks. Not demand or PMF.

**v2.7 — growth pack (after proof)**  
Entry criteria, single-channel hypothesis, founder gate on channels.

**v2.6 — control hygiene**  
Autonomy postures (Strict / Auto / Dangerous), standing deny list, learning rituals.

**v2.5 — next pack after synthetic ranking**  
Light synthetic product sandbox + real interest tests before heavy build.

---

## Related

- Insights (plain-language guides): [pirin.ai/insights](https://pirin.ai/insights) — search “Bootstrap OS”  
- Hands-on install: [Install Bootstrap OS](https://pirin.ai/bootstrap-os)
- Invite-only: [Install Bootstrap Bill](docs/install-bill.md)  
- Public live instances (illustration only): see [`examples/`](examples/)
- Optional local MCP (path 3): [`mcp/README.md`](mcp/README.md)
- Preview plugin (team Import from Repo only — not a public catalog submit): [`plugin/`](plugin/)
- Starter legal templates (hyperlink only): [operating-system.md](company-os/operating-system.md#starter-legal-templates)
- Cap-table modeler (hyperlink only): [operating-system.md](company-os/operating-system.md#cap-table-modeler)
- After-proof efficiency (hyperlink only; fences + proof + they asked): [after-proof-efficiency.md](company-os/after-proof-efficiency.md)

---

*You supply the insight. AI supplies the speed.*

# Bootstrap OS — maintainer roadmap

**Audience:** Maintainers (Pirin / template owners) and serious contributors.  
**Doctrine:** Same rigor we demand of founders. **No shortcuts.** Dogfood or it is not real. If we would reject a mentee’s excuse, we reject our own.  
**Process vs ideas:** **Flexible on ideas and execution. Stringent on process.** Busy is not progress. Activity without evidence, gates, or stage-7 write-back is wishful thinking — refuse it for ourselves and for founders.  
**Not:** A feature wishlist. Kitchen-sink ideas die here first.

| | |
|--|--|
| **Product** | Portable Company OS (markdown) + optional thin MCP |
| **Primary customer group (working)** | Solo / near-solo non-technical founders in 0→1 who thrash between AI harnesses |
| **Job** | Stable **control plane** (two clocks, gates, sparse evidence) that survives tool switches |
| **Non-job** | Harness, hosting platform, memory product, skill marketplace, investor network |


---

## 0. What Bootstrap OS is — and is not

**Conviction:** Non-technical 0→1 founders thrash on harnesses, memory tools, and hosting because nothing durable owns **judgment + status + evidence**. Bootstrap OS is that layer. Everything else is optional furniture.

**Evidence base (mixed, labeled):** mentor-observed FI patterns (high volume OH demand for “bootstrap with AI agents”); public positioning tested on X/LinkedIn; one multi-touch founder arc (thesis pressure → tool setup → real pilot feedback); peer confirmation of “disorganized chats + vibe prototypes”; **not** a large corpus of unsolicited “this OS fixed me” mail. Synthetic/design conviction fills gaps only where field repeatedly rhymes — and stays killable.

### Bootstrap OS (the product of record)

| | **IS** | **IS NOT** |
|--|--------|------------|
| **Job** | Portable **company control plane** for solo/near-solo 0→1: two clocks, founder gates, honest evidence labels, Ready for human eyes | A coding agent, IDE, cloud host, or “build my MVP for me” studio feature set |
| **Source of truth** | Markdown process pack (`company-os/`) + **founder’s instance** state (thesis, scores, phase, traces) | Chat history, auto-memory, skill marketplaces, or vendor project rooms |
| **Primary user** | Non-technical or light-technical founders who must decide Advance / Iterate / Hold / Kill | Funded multi-team orgs needing multiplayer agent admin (that’s 1–n harness territory, e.g. QM-class) |
| **Core loop** | Prove the business (slow) while learning weekly (fast); stage 7 write-back | Infinite prototype generation without gates |
| **Success** | Founder answers “Where are we?” in <2 minutes from written state; can switch tools without losing the board | Stars, waitlists, or “we installed twelve agents” |
| **Teaching** | 90‑min install + OH ritual; FI-style accountability | A certification empire or content farm without dogfood |
| **Default delivery** | **Markdown only** — zero Node required | Something you must “sign up” to think |

### MCP (optional adapter — not the OS)

| | **IS** | **IS NOT** |
|--|--------|------------|
| **Job** | Thin **tool interface** to the same process + instance state: where-are-we, gated updates, human-eyes policy, later sparse ledger/export | A new company operating system, memory product, or harness |
| **Value** | Enforces P1–P4 (and later P5) across Cursor/Claude/Grok/etc. without re-pasting novels | Required for mentees; replacement for reading the blueprint |
| **State** | Reads/writes **founder-owned** files (or future private store); template `company-os/` stays read-only | Multi-tenant social graph or public leaderboard backend |
| **Local v0.1** | Stdio server in-repo; process tools + thin `company-state.json` | Hosted SaaS, auth product, or investor network |
| **Hosted (preview / maybe later)** | Preview: same read tool names; fetch published OS; no shared founder state. Optional gated whoami + **labels** (not boards) on the existing pirin.ai Supabase. Mentee-ready boards later only if proven | Day-one dependency; ranking; auto-ingest of all chats |
| **Noise policy** | Explicit tools only (milestone/decision/gate) | Auto skill creation, ambient memory, “agent built 40 skills today” |

### One stack picture

```text
  [ Any harness: Claude / Cursor / Grok / OpenClaw / … ]     ← changes often
              │
              │  optional MCP tools (same names local or future hosted)
              ▼
  [ Bootstrap OS control plane: gates + state + sparse evidence ]  ← stable
              │
              ▼
  [ Founder instance files / ledger / export ]                 ← founder owns
```

**Stack. Don’t swap the control plane.** Swap harnesses only after weekly snapshot + stage 7.

### Boundary vs adjacent things founders confuse us with

| Adjacent thing | Relationship |
|----------------|--------------|
| **Vibe/coding agents** (Grok Build, Cursor, Lovable, …) | Build surface. OS decides *whether/when* to ship and ask humans. |
| **Agent harnesses** (OpenClaw, Hermes, YC QM, …) | Runtime/orchestration. OS is judgment + memory spine; QM-like tools are 1–n, not day-one solo. |
| **Chat project “rooms” / memory tools** | Session context. Useful; **not** company evidence unless promoted into ledger deliberately. |
| **Pirin intensive / OH** | Human distribution and coaching of the OS — not a substitute for the portable pack. |
| **Investor data room products** | Export may *feed* diligence later; OS is not DocSend/cap-table. |
| **Monthly supporter updates / investor-update SaaS** | **Synthesis of the same board** (bullets from weekly evidence) is in-scope under P5. Email delivery, lists, and analytics are not. |

### Non-negotiables (high conviction)

1. Markdown remains sufficient to run the OS.  
2. AI never advances journey phase without founder approval.  
3. Human-eyes green ≠ demand, PMF, or willingness to pay.  
4. No leaderboard, no auto-memory as product core.  
5. Dogfood with the same gates we demand of founders — **no maintainer exceptions**.  
6. Ship only work that strengthens **P1–P6** (§2a).  
7. **No shortcuts** — see §5a maintainer rule book (mirrors founder hard rules).


---

## 1. Where we stand (control plane — dogfood)

Update this block when reality changes. Do not invent progress.

| Field | Current (honest) |
|-------|------------------|
| **Journey phase** | **6 Hold** — tiny slice built; local MCP still draft ([PR #1](https://github.com/ivelin/bootstrap/pull/1)). No paid-path Advance. |
| **Loop stage** | **7** this week (write-back after MCP work); markdown path already shippable as docs |
| **Autonomy posture** | **Strict** — no auto phase advances; no silent hosted launch |
| **Ready for human eyes** | **unknown** for MCP until cold install by a non-maintainer works end-to-end |
| **Gate** | Do not market MCP as required. Do not ship hosted until local export + dogfood ledger exist or are explicitly killed |
| **Open questions** | Will non-technical mentees use local MCP, or only markdown + later hosted read path? Does ledger reduce thrash in a real FI cohort? Can “Claude rooms / project setup” collapse into a 90‑min Bootstrap install without tool thrash? |
| **Last roadmap review** | 2026-08-07 (evidence scan: Gmail FI/mentees, X, public LinkedIn) |
| **Last weekly control-plane snapshot** | **2026-08-16** in private Pirin instance (`docs/company-os/instance/WEEKLY-SNAPSHOT-2026-08-16.md`). Not in this template. |
| **Stage 7 write-back this week** | **2026-08-16** — Hold PR #1 draft; MCP human-eyes unknown; WTP unchanged at 0.2. Trace lives in the Pirin instance. |
| **Maintainer autonomy posture** | **Strict** — same as we prescribe early solo founders |

**Where are we in one sentence:**  
We pursue only P1–P6 (control plane, gates, human-eyes, harness-agnostic state, sparse evidence, teachable install). Optional MCP is a delivery path for P1–P4/P5 — not a goal in itself. Hosted/social stay out until evidence appears. **This week’s private snapshot + stage-7 exist.** That is one week, not four. M2 (non-author cold path) is still open. Do not claim mentee-ready MCP.

---

## 2. High-impact scope only

### In (prove these) — maps to §2a

| Capability | Pursue # | Success evidence (not narrative) |
|------------|----------|----------------------------------|
| **Markdown OS** | P1, P6 | Install templates; answer “Where are we?” without Node |
| **Gates as tools (MCP optional)** | P2, P3, P4 | Phase advance blocked without founder flag; external ask blocked if human-eyes ≠ green |
| **Sparse evidence ledger + export** | P5 | Explicit milestones only; mentor brief in under 5 min |
| **Harness-agnostic state** | P4 | Same control plane after tool switch |

### Out (explicit kill / defer)

| Idea | Why out |
|------|---------|
| Public founder leaderboard | Vanity; games process |
| Investor discovery via MCP | Unlikely channel; dilutes job |
| Auto-ingest chat / auto skill farms | Becomes the noise we exist to avoid |
| Cap table / full data-room SaaS | Wrong product boundary |
| Hosting/runtime opinions (beyond human-eyes URL) | Not the job |
| Investor-readiness score theater | Harms trust |
| Requiring MCP for install | Breaks non-technical floor |
| Multiplayer company harness (QM-class) as day-one | Wrong segment (1–n, not 0–1) |


---

## 2a. Pursue — strong evidence only

These are the **only** benefits we actively invest in. Each row must keep a live evidence link. If evidence dies, demote to Hold/Kill.

| # | Benefit (what founders get) | Why pursue | Strongest evidence we have | How we prove it next | Phase |
|---|----------------------------|------------|----------------------------|----------------------|-------|
| **P1** | **Honest control plane** — answer “Where are we?” in under 2 minutes (phase + loop + posture + human-eyes + open questions) | Stops chat-log theater; baseline of any real OS | Public teaching claim + FI OH demand for bootstrap/status guidance; success metric already in §6 | OH capture: y/n could answer from *written state* pre/post | **A** (markdown) always; **B** tools optional |
| **P2** | **Founder gates on strategy** — Advance / Iterate / Hold / Kill; AI cannot advance phase alone | Non-tech founders need judgment scaffolding when experiments are cheap | Mentor-forced thesis rethink → better path (MicDots email); multi-idea only with boards+gates (dogfood claim) | Decision traces on thesis/phase changes in dogfood + mentee instances | **A** rules; **B** `founderApprovedPhaseChange` |
| **P3** | **Ready for human eyes** — cold happy path before “please try my link” | Stops burned early-adopter favors; keeps founder on vision | Repeated mentor/public gut-punch narrative; checklist already in OS v2.8 | Refuse external-ask tool + cold-path notes; mentee demos that don’t fail strangers | **A** checklist; **B** status + policy tools |
| **P4** | **Harness-agnostic partner** — same scoreboard when Cursor/Claude/Grok/OpenClaw change | Field thrash is real; wrappers pollute sessions | FI “bootstrap with agents” demand without single-stack loyalty; builder friction with harness pollution (X) | Same state file works after tool switch in dogfood + 1 mentee | **A** files; **B** MCP as adapter not runtime |
| **P5** | **Sparse evidence memory + clean rollup** — explicit milestones/traces; optional structured export for founder *and* supporters (same board, not a second narrative) | Learning dies without write-back; monthly/mentor updates are a chore when invented from chat | MicDots-class traces; mentor OH prep; founder demand for honest “where we are” shared outward | Ledger 1–3 entries/week; **one synthesis tool**: bullets only from gathered weekly evidence — wins / challenges / asks / phase+gate — no prose salad | **C** (after B or parallel markdown ledger) |
| **P6** | **Teachable 0–1 install** — 90‑min get-running + OH script, not a platform tour | Distribution and trust via FI/workshops | Luma Bootstrap OS series; packed FI OH calendar Jul–Aug 2026 | Run 90‑min on markdown-only; measure P1 success rate | **A** (+ intensive); no MCP required |

### Explicitly not elevated (evidence too weak or counter)

| Benefit idea | Verdict |
|--------------|---------|
| Local MCP as *required* install for non-tech | Demand not found — **optional only** |
| Hosted MCP / social leaderboard / investor discovery | Not found — **Out** |
| Auto skill/memory ingestion | Contradicts P4–P5 — **Out** |
| Day-one multiplayer harness (QM-class) | Wrong segment — **Out** for Bootstrap |

### Investment rule

> Ship work only if it strengthens **P1–P6**.  
> Phase B MCP is justified solely as a better delivery of **P1–P4** (and later **P5**), not as a product category of its own.


### P5 export shape (only if ledger/stage-7 is real)

**Job:** Same visibility the founder wants for themselves — **clean “where we are”** — shareable as structured bullets. Not a newsletter product.

| | |
|--|--|
| **Input** | Control plane + **explicit** weekly evidence only (ledger / stage-7 / decision traces). No chat scrape. |
| **Output** | Structured response (markdown): phase + loop + human-eyes; **1–3** achievements; **1–3** challenges; **1–3** asks; real metrics if present; next gate. Empty sections stay empty. |
| **Audience** | Founder first; optional paste to team / mentors / advisors / investors |
| **Tool name (when built)** | e.g. `bootstrap_synthesize_update` — synthesis only, **no send** |
| **IS** | Projection of the control plane; chore compressor; noise filter |
| **IS NOT** | Email SaaS, CRM, open-rate tracking, AI fluff essay, second status system, auto-send |
| **Gate** | Refuse to invent bullets not backed by labeled evidence. Prefer short + true over full + vibe. |
| **Kill if** | Dogfood doesn’t use it for 3 real rollups, or it grows send/audience features |



---

## 3. Delivery modes (stable contract)

| Mode | Status | Rule |
|------|--------|------|
| **1. Point an AI** | **Default forever** | https://github.com/ivelin/bootstrap — no install, no MCP |
| **2. Optional instance / CLI + workflows** | **Shipped on main** | `./scripts/install-instance.sh` + optional `.grok/workflows` |
| **3. Self-host kit** | **Optional OSS `mcp/`** | Your disk (`initCompany()` / `~/.bootstrap-os`) or your own Vercel + Supabase. Not the Pirin mentee source of record. Same `company-state.json` + `where-are-we.py` on disk. |
| **4. Hosted MCP** | **Pirin write plane** | Pin `https://mcp.bootstrap.pirin.ai/mcp` (handshake 401). Super admin calls `create_company`, then `create_idea`. `plugin/` is preview. Free docs are GitHub + install-os + local — not a hosted MCP connector. Git-branch previews on `*.vercel.app` (same 401 as collab, not a silent 200 alias, not a pin, not mentee-ready boards). Contract: [`mcp/docs/HOSTED_IDENTITY.md`](mcp/docs/HOSTED_IDENTITY.md). Gated tools: HTTP 401 + `WWW-Authenticate` to this MCP origin RFC 9728 (`authorization_servers` = pirin.ai login). This repo is the resource server only. Login / OAuth stay on pirin.ai `/bootstrap-os/login` (Web Builder). No login UI and no copy-paste `bos_` mint as the mentee path. No public catalog submit (team Import from Repo only). Not pirin.ai. Path 1 stays the front door. This row is not an Advance of Phase D. |

Cos Advance (hosted board): invited companies share a 0-1 snapshot (`get_journey`) after journey SQL is applied on pirin.ai. Preview still does not attach. Local traces stay on disk. Path 1 stays the no-login front door. Still not a public catalog.

MCP is **compass + logbook**, not a third harness.

---

## 4. Phased plan (founder gates)

Each phase needs **Advance / Iterate / Hold / Kill** with evidence. No phase auto-advance.

### Phase A — Portable process (baseline)

| | |
|--|--|
| **Done means** | `company-os/` + `templates/` installable; AI instructions pasteable; Ready for human eyes checklist exists |
| **Evidence** | Public repo; workshops/OH can teach without MCP |
| **Status** | **Advance candidate** — treat as shipped process baseline (v2.8.3 docs) |
| **From field** | FI demand for “Bootstrap with AI Agents” OH; Luma series (90‑min → reliable → scale). Teach Phase A first. |



### Multi-company connector (locked)

One Bootstrap OS MCP process (like Supabase/Vercel multi-project). Tools: `bootstrap_list_companies`, `bootstrap_init_company`, `bootstrap_use_company`. All state tools scoped to **active** `companyId` only. Product repos do not import the full Bootstrap tree.

### Status + next-evidence (MCP guidance — locked design)

| Tool | Job |
|------|-----|
| `bootstrap_where_are_we` | Clear **where we are** (slow + fast clocks, human-eyes, questions) |
| `bootstrap_next_evidence` | **What evidence** is needed to consider journey Advance and to complete current loop stage; label hints; do-not-count list |
| `bootstrap_agent_focus` | **What to do now**: gather evidence / do work toward evidence / stage-7 write-back / blocked on founder |

Agents should start sessions with focus → do work → record when ready (`log_decision` / state). Never invent evidence. Never self-advance phase.
**Busy ≠ progress:** tool output and agent runtime are not evidence. `bootstrap_next_evidence` exists to make the *required proof* visible so founders cannot hide in activity.

### Phase B — Thin local MCP (gates + state) — *current thin slice*

| | |
|--|--|
| **Ship** | [PR #1](https://github.com/ivelin/bootstrap/pull/1): stdio MCP, policy tools, thin `company-state.json`, **status + next-evidence + agent-focus**, no template writes |
| **Done means** | Non-maintainer cold path: clone → `mcp` build → point at *instance* state → `bootstrap_where_are_we` + blocked phase advance without approval |
| **Dogfood** | Pirin / Bootstrap maintainer instance uses MCP weekly for “Where are we?” on *this* product |
| **Kill if** | Cold install fails repeatedly for target mentees *and* markdown-only already covers them → keep markdown, archive MCP |
| **Status** | **In build** — human-eyes unknown until cold path green |
| **From field** | No email/X proof yet that non-tech FI founders want local Node MCP. Do not market B as required. |

### Phase C — Evidence ledger + export (next high impact)

| | |
|--|--|
| **Ship** | Append-only ledger (milestones, decisions, evidence labels, gate events); `list_timeline`; **`bootstrap_synthesize_update`** (structured bullets only); optional full export pack |
| **Done means** | Weekly stage-7 writes 1–3 ledger entries; export usable for mentor OH brief without chat dig |
| **Dogfood** | 4 consecutive weekly snapshots for Bootstrap OS itself live only in ledger + state |
| **Kill if** | Ledger unused after 4 dogfood weeks → do not build hosted on top of fiction |
| **Status** | **Next** after Phase B human-eyes green or explicit iterate |
| **From field** | Thesis change → pilot evidence (MicDots class); multi-company dogfood claim needs per-company boards |

### Phase D — Hosted read path (optional)

| | |
|--|--|
| **Ship only if** | Phase C dogfood green **and** real demand for shareable read-only export |
| **Done means** | Same tools/names; founder owns revoke; no public ranking |
| **Kill if** | Local export + Drive/git share is enough for dogfood cohort |
| **Status** | **Hold** — this phase is not Advanced. The production pin is the Pirin write plane (`create_company` / `grant_super_admin`). Git-branch previews stay not mentee-ready. OSS `mcp/` is the self-host kit. |

---

## 5. Dogfood protocol (mandatory)

We run Bootstrap OS **on Bootstrap OS / Pirin delivery of it**.

### Weekly (learning ritual)

1. **Control-plane snapshot** — update §1 table (phase, stage, human-eyes, open questions).  
2. **Stage 7** — what did we learn; what was killed; one decision trace.  
3. **Evidence only** — if it is not in state/ledger/export, it did not happen.  
4. **Harness rule** — may switch AI tools only after snapshot + stage 7 for the week.

### After each Bootstrap-related office hour (new)

One ledger row (when Phase C exists; until then a short note in dogfood instance):

| Field | Capture |
|-------|---------|
| Founder / company (private) | id only in private instance |
| Confusion type | harness thrash / process / product / human-eyes / other |
| State file existed? | y/n |
| Could answer “Where are we?” in 2 min? | y/n |
| Action assigned | one concrete next gate |

That converts mentor-observed patterns into **company signals**.

### Ready for human eyes (this product)

Before asking mentees to “try the MCP”: cold path on non-maintainer machine; instance root ≠ template; documented five-minute failure modes.  
Green human-eyes ≠ demand for MCP. Markdown remains the floor.

### Anti-patterns (dogfood)

| Anti-pattern | Response |
|--------------|----------|
| Roadmap grows features without kill criteria | Delete or move to Out |
| “We’ll need leaderboard later” | No — re-open only with real evidence |
| Dogfood only in chat | Fail week — no Advance |
| Shipping hosted to avoid fixing local cold path | Hold hosted; fix B |
| Treating OH booking volume as PMF for MCP | Bookings = demand for *guidance*, not for Node MCP |

---


### 5a. Maintainer rule book — same hard rules as founders (no shortcuts)

We teach [`company-os/ai-instructions.md`](company-os/ai-instructions.md). We are bound by the same spirit. **Maintainer privilege is not a gate exemption.**

#### Hard rules (apply to Bootstrap OS / Pirin delivery of it)

| # | Rule | Shortcut we refuse |
|---|------|--------------------|
| M1 | **Never advance** journey phase, “shipped,” or human-eyes **green** without evidence + explicit maintainer decision trace | “It’s basically done” / PR merged = product proof |
| M2 | **Label claims** honestly: outside facts / company signals / assumed capability / needs real-world proof | Treating OH bookings or stars as PMF |
| M3 | **Weekly control-plane snapshot** in the *private dogfood instance* (not only this ROADMAP prose) | Updating marketing copy instead of state |
| M4 | **Stage 7 write-back** after real work (MCP, workshops, cohort) — personas/hypotheses/scores/open questions | “We’ll remember from Slack/Grok chat” |
| M5 | **Standing deny list:** no silent live-send to mentees as “required MCP”; no fake bot staff; no secret dumps of founder PII into public template | Shipping to founders to “learn in prod” without cold path |
| M6 | **Ready for human eyes** before asking non-maintainers to depend on MCP/install paths | “Works on my machine” demos as green |
| M7 | **Harness switch** only after snapshot + stage 7 for the week | Thrashing tools mid-week without write-back (hypocrisy vs mentees) |
| M8 | **Template policy:** no product thesis/market from Pirin or mentees into `company-os/` without approval-gated portable edit | “While we’re here” template pollution |
| M9 | **Evidence over narrative** in ROADMAP §1 and §8 | Roadmap theater without instance files |
| M10 | If unsure whether a founder excuse is valid, **apply the same test to ourselves** | “We’re the authors so we know” |
| M11 | **No instance secrets in the template:** no specific company names, theses, scores, decision traces, or local paths in OS / MCP fixtures / evals. Fictional `alpha` / `bravo` / `charlie` only. CI smell test must stay green | Copying dogfood boards or labels into the public pack |

#### Fail the week (automatic)

Any of these = **no Advance** on roadmap phases that week:

- No private-instance snapshot (phase, loop stage, posture, human-eyes, open questions, lastAction)
- No stage 7 note after meaningful product or teaching work
- Claimed human-eyes green without cold-path artifact
- Merged user-facing “you should use X” without mapping to **P1–P6**
- Public promise of hosted/leaderboard/auto-memory without §2 Out list change + evidence
- **Activity theater:** narrative of busyness (PRs, agent hours, chats) without labeled evidence or control-plane movement

#### PR / merge gate (dogfood CI for humans)

Before merge to `main` for product behavior (MCP, install docs that change founder path):

| Check | Pass? |
|-------|-------|
| Maps to **P1–P6** or explicit kill of old behavior | ☐ |
| Does not require MCP for markdown-only path | ☐ |
| State/template write boundaries respected | ☐ |
| Human-eyes impact considered (cold install notes if user-facing) | ☐ |
| Decision trace if phase/posture/scope Advance | ☐ |
| Author would accept this bar from an FI mentee | ☐ |

#### Private dogfood instance (mandatory location)

| | |
|--|--|
| **Where** | Pirin (or maintainer) **company repo / drive** — **not** this template’s `company-os/` |
| **Minimum files** | `company/state/company-state.json`, `docs/company-os/applied-here.md`, `company/traces/` |
| **Public** | Only §1 summary + §8 evidence log in this ROADMAP (no PII, no mentee secrets) |
| **Cadence** | Snapshot at least weekly; OH capture rows after Bootstrap-related sessions |

Until the private instance exists and has a non-empty `lastWeeklySnapshotAt`, we **do not** claim dogfood is running — we claim intent. Intent is not evidence.

#### Hypocrisy test (use in review)

> “Would we tell a Founder Institute mentee this excuse is unacceptable?”  
> If yes, it is unacceptable for us.

Examples of excuses that **fail**:

- “Too busy teaching the OS to run the OS”
- “The PR is the documentation”
- “We’ll add state after the launch”
- “Mentors don’t need Ready for human eyes”
- “Stars mean we can skip kill criteria”


---

## 6. Success / kill for the *product* (not vanity)

| Signal | Counts as evidence | Does not count |
|--------|--------------------|----------------|
| Mentee answers “Where are we?” in under 2 minutes from OS state | Company signal | Stars alone |
| Switch harness without losing phase/loop/evidence | Company signal | “People liked the demo” |
| Mentor brief from export without Slack archaeology | Company signal | Waitlist for hosted |
| Four weeks dogfood ledger discipline | Company signal | Internal enthusiasm |
| FI OH pre/post 2‑minute status (repeated) | Company signal | Luma “event is live” mail |

**Kill Bootstrap-as-product experiments** (not the helpful markdown pack) if after a real cohort: no one uses gates or ledger and thrash continues unchanged. Keep portable docs; stop investing in MCP surface.

---

## 7. Near-term checklist

- [ ] **No shortcuts:** Create private dogfood instance (state + applied-here + traces) — fail week until done  
- [ ] **M3:** First real `lastWeeklySnapshotAt` in private state; reflect summary in §1  
- [ ] **M4:** Stage 7 decision trace for this MCP/roadmap work  
- [ ] **P1/P6:** Next FI/workshop markdown-only; record 2‑min “Where are we?” y/n  
- [ ] **P2/P5:** Log thesis/phase decisions as traces in dogfood instance  
- [ ] **P3/M6:** Cold-path notes before any “try MCP” ask to non-maintainers  
- [ ] **P4:** One intentional harness switch; state still answers P1  
- [ ] **B as delivery of P1–P4:** Merge Phase B only after cold-path notes or explicit “maintainers-only alpha” trace  
- [ ] **P5 schema:** event types only (`milestone`, `decision`, `evidence`, `gate`, `score_snapshot`)  
- [ ] OH capture rows (confusion type + P1 y/n)  
- [ ] Refuse work that does not map to **P1–P6** or fails hypocrisy test  
- [ ] Next roadmap review: after Phase B human-eyes check or ≤ 14 days  

---

## 8. External evidence log (2026-08-07 scan)

**Method:** Gmail (FI/founder threads + office-hour traffic), X posts/replies, public LinkedIn.  
**Honesty:** Direct written founder product feedback is thinner than office-hour *demand* and mentor synthesis. Labels follow OS evidence rules.

### 8.1 Direct founder / mentee signals

| Signal | Source | Label | Roadmap implication |
|--------|--------|-------|---------------------|
| Founder thanked mentor pressure that forced **thesis rethink**, then advanced **pilot with real client stakeholders** | Email: Donna Vincent Roa / MicDots (Jul–Aug 2026); OH “Help bootstrap with AI agents” | **Company signal** (one founder, multi-touch) | Thesis/gate discipline + evidence beats tool tips. Ledger must record *why thesis changed*. |
| Same founder set up **Claude rooms as recommended**; multi-front progress; needs crisp **one-liner** for investor/mentor audiences | Email Aug 5–6 2026 | **Company signal** | Founders follow concrete setup steps — but rooms are *harness*, not OS. Keep OS **above** Claude/Cursor. |
| Heavy FI **OH demand** for “Bootstrap with AI Agents” (group AMA + 1:1s: Donna, Sylvie, Lu, Kelly, Sion; later Mustafa, Alejo, Imran, etc.) | FI Events mail Jul–Aug 2026 | **Company signal** (guidance demand) | Invest in Phase A teaching + OH script. Do **not** equate bookings with MCP PMF. |
| Ops: missed slots / calendar confusion | Email (Sylvie waiting room; Alejo missed calendar save) | **Company signal** (process, not product) | Do not “fix” with software theater. |
| Google review ping for Pirin.ai (Chef Kelly) | GBP Aug 6 2026 | **Weak** until full text captured | Log review text into private dogfood instance when available. |

### 8.2 Public founder-adjacent response

| Signal | Source | Label | Roadmap implication |
|--------|--------|-------|---------------------|
| Solo “day-one founder OS” misread of YC QM is “more interesting”; worries enterprise-shaped for one person | X: @n0ur_salama (2026-08-04) | Market attention | Positioning confirmed: **0–1 judgment OS ≠ multiplayer harness**. |
| Non-tech solos “lost in disorganized chats and vibe coded prototypes”; peer Soleur exploring same gap | X thread with @deruelle | Shared diagnosis | Job = organize judgment + state, not more prototype speed alone. |
| FI pattern: “find technical cofounder for MVP”; vibe stalls ~final 20%; need guidance + milestones | Public LinkedIn Pirin/FI posts | Mentor-observed pattern | Stay on milestones, human-eyes, ownership — not agency replacement. |

### 8.3 Mentor synthesis already in market (test as hypotheses)

| Public claim | Test |
|--------------|------|
| No “Where are we?” in 2 minutes → no OS | Measure in OH from written state |
| Burned favor when demo fails for stranger | Human-eyes gate + refuse external ask |
| Harness wrappers pollute builder sessions | Stay harness-agnostic |
| Multi-idea only with boards + gates | Per-company state ids; no leaderboard |
| 90‑min Bootstrap workshops | Distribution for Phase A only until MCP cold path green |

### 8.4 Not found (keep honest)

| Looked for | Result |
|------------|--------|
| Unsolicited “Bootstrap OS fixed my thrash” email volume | **Not found** |
| Detailed public LinkedIn comment critique | **Mostly empty / auth-walled** in fetch |
| Demand for leaderboards / investor MCP discovery | **Not found** |
| Non-tech demand for local Node MCP | **Not found** (demand = bootstrap *with agents* guidance) |

### 8.5 High-impact deltas only

| Raise | Still refuse |
|-------|----------------|
| Phase A teaching + OH “Where are we?” measurement | Harness-as-product |
| Human-eyes narrative (burned favors) | Full QA suite product |
| Thesis/decision traces (MicDots-class) | Auto-ingest Claude rooms |
| Positioning vs QM/OpenClaw | Day-one multiplayer admin brain |
| Ledger prioritized for **mentor-exportable** weekly brief | Public ranking |

---


---

## 10. Exploration — automated evidence collection (not committed)

**Status:** Explore only. **Do not build ambient auto-memory.** Anything automated must strengthen **P5** without violating noise policy (§0).

### Principle

```text
CAPTURE (cheap, optional, noisy)
   → PROPOSE (structured candidates, labeled)
      → COMMIT (founder or stage-7 gate — becomes company evidence)
         → SYNTHESIZE (where-we-are / monthly bullets from commits only)
```

Automation may **capture and propose**. It must **not** silently **commit** into the ledger that drives gates, phase advances, or supporter updates.

### What “evidence” means here

| Class (OS labels) | Safe to auto-capture? | Auto-commit? |
|-------------------|----------------------|--------------|
| **Outside facts** (public URLs, published prices, dated articles) | Yes — with URL + timestamp | No — propose only until founder accepts |
| **Company signals** (pilot feedback, waitlist count, paid $) | Only from **declared** sources founder connected | No without confirm |
| **Assumed capability** (demo on laptop) | Risky — often over-claimed | Never auto |
| **Needs real-world proof** | N/A (gap marker) | N/A |

### Automation tiers (high → low conviction)

| Tier | What | Value | Risk | Verdict |
|------|------|-------|------|---------|
| **T0 Manual** | Founder/agent calls `record_milestone` / stage-7 write | Clean, sparse | Low volume | **Default forever** |
| **T1 Action-bound** | MCP writes a **draft event** when *this* OS tool runs (phase blocked, human-eyes check, decision logged) | Perfect provenance; zero chat scrape | Low | **Pursue with Phase C** |
| **T2 Declared metrics** | Founder pins 1–5 sources (Stripe MRR, waitlist sheet cell, “deploy URL returns 200”) · poll or on-demand fetch · store as **proposed** company signals | Real signals without narrative | Credential + staleness | **Maybe later** — thin connectors only |
| **T3 Artifact hooks** | On explicit path watch: `ready-for-human-eyes` report file, cold-check log, export folder — propose “artifact available” | Human-eyes honesty | Path spam | **Maybe** if paths are opt-in |
| **T4 Session digest** | End of agent session: model proposes ≤3 bullets from *this* session only; founder accepts/rejects | Low friction for non-tech | Model invents; still better than ambient | **Experiment** — accept-gate required |
| **T5 Ambient chat/email/Slack ingest** | Always-on memory of everything | Looks helpful | **Noise factory**; contradicts OS | **Out / kill** |

### What is true added value (only)

1. **Don’t lose gate events** — every Advance/Iterate/Hold/Kill and human-eyes transition becomes a ledger candidate automatically (**T1**).  
2. **Don’t invent weekly rollup** — synthesis reads **commits only**; empty beats fiction.  
3. **Shorten stage 7** — present a **proposal list** (max N) to accept/edit/drop, not a full second brain.  
4. **Label on the way in** — proposed events carry class + source + time; refuse unlabeled commits.

### What is not worth building

| Idea | Why not |
|------|---------|
| Auto-ingest all Claude/Cursor chats | Random noise; thrash amplifier |
| Silent score updates from vibes | Corrupts control plane |
| “AI noticed 47 insights this week” | Performative junk |
| Competing with full memory SaaS | Non-job (§0) |
| Auto-green human-eyes from one successful local run | Shortcut we forbid for mentees |

### Minimal design (if/when we touch code)

```text
ledger/
  committed.jsonl    # company truth — sparse
  proposed.jsonl     # machine drafts — disposable

Tools:
  bootstrap_record_evidence     # explicit commit (human/agent with intent)
  bootstrap_list_proposed       # review queue
  bootstrap_accept_proposed     # promote to committed (+ label check)
  bootstrap_reject_proposed
  bootstrap_synthesize_update   # committed only

T1 hooks (no new product):
  phase change, decision log, human-eyes set, weekly snapshot → auto append proposed or committed-with-type=gate_event
```

### Dogfood kill criteria

| After | Kill automation layer if |
|-------|---------------------------|
| 4 weeks | Proposed queue ignored or always bulk-accepted without read |
| 4 weeks | Committed ledger grows faster than stage-7 can narrate (noise won) |
| Anytime | Synthesis cites proposed/unlabeled items |

### Fit to roadmap

| Now | Phase C | Later / maybe | Never |
|-----|---------|---------------|-------|
| Manual + T1 gate events | proposed/committed split; synthesize from committed | T2 1–5 declared metrics; T4 session propose≤3 | T5 ambient |

**One-liner:** Automate **capture of what the OS already did** and **proposals from declared sources**; never automate **judgment that something is company truth**.


## 9. Related

- Process pack: [`company-os/`](company-os/)  
- Optional MCP: [`mcp/README.md`](mcp/README.md)
- Preview plugin: [`plugin/`](plugin/) — team Import from Repo only; not a public catalog submit  
- Template policy: [README](README.md#template-change-policy)  
- PR (local MCP): https://github.com/ivelin/bootstrap/pull/1  

---

*You supply the insight. AI supplies the speed. Roadmap supplies kill criteria — or it is theater.*

# Live Company Runtime  
## Persistent state + continuous learning loop

**Part of:** [Company Operating System](operating-system.md) (v2.8.19)  
**Audience:** Solo founders implementing the OS; AI helpers; mentors  
**Portable:** Yes — this is the *runtime shape*, not any one product  
**Instance mapping:** Fill `templates/applied-here.md` in *your* company repo (not part of this template).  
**Template edits:** Approval-gated — see root [README](../README.md#template-change-policy)

---

## 1. Two clocks, one company

The OS has **two coordinated views**. Do not collapse them into one list.

| View | What it is | Changes when |
|------|------------|--------------|
| **Bootstrap journey** (five rungs) | Where this bet is on the *prove it* path | Founder **Advance / Iterate / Hold / Kill** |
| **Live runtime loop** (quality bar) | Ask / Do / Write back on this week’s artifact | Continuous; many cycles inside one journey rung. Not a stored week verb. Not card position. |

Early on you mostly live in **Write the bet / Filter cheaply / Ground it**.  
Later you still run the weekly quality bar **inside** Build / Try — research does not stop after launch. Grow is an after-proof pack after Try, not a sixth rung.

Name rule: journey = place names (Bet / Filter / Ground / Build / Try). Loop verbs = quality bar + [clock-examples](clock-examples.md) teaching only. Never put “synthetic research” or “real users” on both clocks. Do not flatten the two clocks into one list. Do takes the station’s shape. It is not a synonym for Build. Make / Check / Hear are not loop weeks. Where-are-we is journey + gate + constraint + missing artifacts. Do not invent Write back as `loopStage` 7.

```text
  BOOTSTRAP JOURNEY (slow, founder-gated)
  Write the bet → Filter cheaply → Ground it → Build tiny slice → Try with real people
         │
         │  at every step, the LIVE LOOP can run:
         │
         ▼
  LIVE RUNTIME (fast, evidence-producing)
  persistent state ──► Ask ──► Do ──► Write back ──► Ask
  (quality bar on the week's artifact — not a card)
```

---

## 2. Blueprint vs live runtime (restated)

| Layer | Holds |
|-------|--------|
| **Blueprint** | Principles, gates, forbidden moves ([`operating-system.md`](operating-system.md)) |
| **Live runtime** | Actual state, scores, traces, personas, eval results, open questions |
| **Compute** | Agents / graphs / scripts that read state, do work, write traces |

Writing a great blueprint without a live loop is **planning theater**.  
Running agents without founder gates and honest state is **automation theater**.

---

## 3. Persistent state (the company memory)

Whatever tools you pick, the **live OS needs durable, versioned state** that both you and AI can read.

### 3.1 Minimum stores

| Store | Purpose | Must include |
|-------|---------|--------------|
| **User personas** | Synthetic (and later real-derived) customers | Rich profile, version, history of interactions; optional psychographics (e.g. Big Five / OCEAN) — only if it improves scenario quality, not for vanity |
| **Product knowledge base** | What the product is, constraints, non-goals | Thesis, slice definition, API/UX facts, safety rules |
| **Decision traces** | Why the company did things | Decision, evidence, outcome, next review ([template in OS](operating-system.md#decision-traces--learning-loop)) |
| **Research hypotheses & results** | Customer-group ranking and validation outcomes | Hypothesis id, method, evidence labels, scores, pass/fail, demotions |
| **Real-usage feedback** | What happened with real people | Redacted notes, outcomes, quotes (lawful capture only) |
| **Scores snapshot** | Current board | Completion, willingness, escalation, trust, etc. |
| **Loop cursor** | Where the runtime is | Current stored week 1–7 (spoken three weeks), last run id, blocked reason; optional: last snapshot date |
| **Autonomy posture** | How much the system may do alone | Strict / Auto / Dangerous ([blueprint](operating-system.md#autonomy-postures-how-much-the-system-may-do-alone)); default Strict |
| **Ready for human eyes** | May we ask cold humans to try a product URL? | `unknown` \| `blocked` \| `green` + optional evidence path / blockers ([blueprint](operating-system.md#ready-for-human-eyes-ship-gate-before-external-feedback)); default **unknown** |
| **Founder checkpoints** | Open QC / Bind / Clock / Alpha moments | Optional. Default **empty** = 2.8.9 behavior. QC Hold is path-local. Does not change `current_gate`. See [founder checkpoints](operating-system.md#founder-checkpoints-when-human-judgment-is-the-work) |

### 3.2 Design rules for state

1. **Version personas and hypotheses** — never silently overwrite; you need “what we believed last month.”  
2. **Label runs and claims** — every *run* is `synthetic` | `real` | `mixed`. Important *claims* inside reports use the four evidence labels in the blueprint ([honest research](operating-system.md#how-to-do-honest-research--validation)): outside facts, company signals, assumed capability, needs real-world proof.  
3. **Redact by default in public repos** — personal data and raw recordings stay private / gitignored.  
4. **Trace-first** — if it is not written down, the company did not learn it.  
5. **Founder-readable** — structured files are fine; always keep a plain-language summary path (“Where are we?”).  
6. **Day tools are inputs; git (or equivalent) is memory.** Calendar, inbox, and meeting notes feed the control plane. They are not a second operating system. If “Where are we?” cannot see this week’s conversations, you are running on last week’s markdown. Do not require any named vendor.

### 3.3 Tooling (examples, not requirements)

Popular open-source stacks that fit this shape well:

| Concern | Example options | Notes |
|---------|-----------------|-------|
| **Durable graph + state** | [LangGraph](https://github.com/langchain-ai/langgraph) (checkpoints, threads) | Good default for “loop with memory” |
| **Multi-agent roles** | [CrewAI](https://github.com/crewAIInc/crewAI), LangGraph nodes, plain scripts | Use when roles (researcher, builder, critic) help; skip if one agent + tools is enough |
| **Evals / scenarios** | Your domain harness, Promptfoo, custom CI | Must score the *same* contracts you ship |
| **Docs + decisions as code** | Git markdown / YAML | Solo-friendly; starts before any framework |
| **Product app state** | Your app DB / `.data/` | Product runtime ≠ company OS state (link them with ids) |

**Rule:** Choose tools that fit *your* product and skill.  
A markdown + script loop that is honest beats a LangGraph cathedral that never runs.  
Upgrade when state and multi-step agents become the bottleneck — not before.

---

## 4. The continuous loop (three weeks)

Each week **reads** persistent state, **does work**, and **writes** traces + updates.  
Founder gates sit between weeks when strategy or spend would change.  
Filter is not Ground. Build is not Try. Ask does not Ground. Do at Build is not Try.

```text
┌─────────────────────────────────────────────────────────────────┐
│                    PERSISTENT STATE                             │
│  • User Personas (rich, versioned; optional OCEAN + history)    │
│  • Product Knowledge Base + Decision Traces                     │
│  • Real-usage Feedback Store                                    │
│  • Research Hypotheses & Validation Results                     │
│  • Scores + loop cursor                                         │
└────────────────────────────┬────────────────────────────────────┘
                             │
         ┌───────────────────▼───────────────────┐
         │  1. ASK                               │
         └───────────────────┬───────────────────┘
                             │
         ┌───────────────────▼───────────────────┐
         │  2. DO  (station-shaped)              │
         └───────────────────┬───────────────────┘
                             │
         ┌───────────────────▼───────────────────┐
         │  3. WRITE BACK                        │
         └───────────────────┬───────────────────┘
                             │
                             └──────────► back to Ask
```

### Week cards

#### 1 — Ask

Write the question and the kill line.

| | |
|--|--|
| **Goal** | Name what this station must learn this week, and what would kill or demote before you run work |
| **Inputs** | Thesis; legal adjacent traces if no customers yet (public forums, substitute/competitor reviews, founder prior-domain notes with no PII — not a former employer’s private list); existing personas; hypotheses; prior scores |
| **Work** | Seed personas from those traces (or write none yet). Do not seed from a demographic one-liner. Demo-only role-play is the weak case. Write the forced choice, the kill line, and what behavior would count. Do not ask a 1–5 or a naked dollar WTP — a choice or a sentence, then map. Mapping may still produce a dollar figure. Too-tight variance or same-prompt drift versus a human handful makes the pass unusable. New category / none yet stays the weak case. Ask does not Ground. |
| **Outputs** | The week’s question, kill line, and what “works” means at this station |
| **Founder gate?** | Soft — synthetic may rank or kill later. Do not promote a primary group without observed evidence (journey **Ground it**). |

Ask at **Filter** stays synthetic. Ask at **Ground** names who talks and what behavior counts. Ask at **Build** names what can fail in the lab. Ask at **Try** names what use would count in their life, not ours.

#### 2 — Do

Run the work this station allows against that line. Do takes the station’s shape. It is not a synonym for Build.

| | |
|--|--|
| **Goal** | Do only the work this rung allows |
| **Inputs** | The Ask question + kill line; product knowledge; personas; pass/fail rules when the station is Build or Try |
| **Work** | **Write the bet:** one-page thesis — not a landing page, not interviews, not a bot. **Filter cheaply:** comps, listings, sims; rank; still hold; do not call a friend yet. **Ground it:** real talks or waitlist with friction — not a product, not a sim labeled heard. **Build tiny slice:** design + build the smallest slice; run tests ([Evaluation-Driven Development](operating-system.md#evaluation-driven-development-edd)). **Try with real people:** put the slice in their hands; watch what they did. |
| **Outputs** | Station-shaped artifacts: thesis, ranked notes, talks, slice + tests, or observed use |
| **Founder gate?** | Yes — spend, scope expand, or any move that would treat Do at Build as Try. Engineering green is not demand. |

Do at Build may include a light synthetic product sandbox (capability / feasibility) and Ready-for-human-eyes cold path. That is still lab work. Real interest tests belong at Ground. Real use belongs at Try.

#### 3 — Write back

Change company memory. Never skip. Never Advance.

| | |
|--|--|
| **Goal** | Close the learning loop so the next cycle is smarter |
| **Inputs** | All new traces, scores, feedback |
| **Work** | Version personas; revise hypotheses; update product knowledge; write decision traces. Do not write `loopStage`. At Write the bet: save as stated. At Filter: rank as synthetic. At Ground: observed vs still synthetic. At Build: bugs and what ran — cannot Advance to Try. At Try: observed use or no use. |
| **Outputs** | Fresh state ready for Ask; explicit list of what changed and why |
| **Founder gate?** | Soft — review diffs when strategy-sensitive fields change. Write back does not promote. |

**Never skip Write back.** Without memory update, you are generating noise, not running a company OS.

**Learning rituals (blueprint):** Weekly control-plane snapshot is the **read-back**. Write back is the **write-back**. Also: weekly scoreboard glance; monthly (or pre-hire) coordination-tax check. Full table: [operating-system — Learning rituals](operating-system.md#learning-rituals-your-crons-without-servers).

### Fifteen cells

The full 5 × 3 matrix (labels first) lives in [operating-system — Fifteen cells](operating-system.md#fifteen-cells-journey-rung--loop-week). Same cells here, spoken names only:

| Journey | Ask | Do | Write back |
|---------|-----|-----|------------|
| Write the bet | Three groups, what “works” means, kill line before ranking. | One-page thesis. Not a landing page. Not interviews. Not a bot. | Save as stated. Next is Filter, or stay if mush. |
| Filter cheaply | Same forced choice; cheap signal that demotes a group; sims stay synthetic. | Comps, listings, sims. Rank. Still hold. Do not call a friend yet. | Rank as synthetic. Do not Advance. |
| Ground it | Who talks this week; what behavior counts (time, intro, money-shaped), not “cool idea.” | Real talks or waitlist with friction. Not a product. Not a sim labeled heard. | Observed vs still synthetic. Founder gates Ground-done. |
| Build tiny slice | What can fail in the lab; Ready-for-human-eyes line. | Design + build the smallest slice. Run tests. | Bugs and what ran. Cannot Advance to Try. |
| Try with real people | What use would count; who, this week, in their life not ours. | Put the slice in their hands. Watch what they did. | Observed use or no use. Only here can that support a Grow pack. |

### End-to-end path

Write the bet Ask → Do → Write back → Filter Ask → Do → Write back → Ground Ask → Do → Write back → Build Ask → Do → Write back (a Build-stage kill can stop here) → Try Ask → Do → Write back. Grow pack stays closed unless observed use exists.

---

## 5. Mapping loop weeks ↔ bootstrap journey rungs

Stored integers stay 1–9 / 1–7. Spoken/rendered uses five rungs. Ask / Do / Write back is a quality bar, not a card. No invented Advance.

| Stored journey | Spoken journey | Runtime weeks that dominate |
|----------------|----------------|-----------------------------|
| 1 or 2 | Write the bet | **Ask** + **Do** (one-page thesis) + **Write back** as stated |
| 3 | Filter cheaply | **Ask** + **Do** (comps / sims) + **Write back** as synthetic |
| 4 | Ground it | **Ask** + **Do** (real talks) + **Write back** observed vs synthetic |
| 5 or 6 | Build tiny slice | **Ask** + **Do** (design + tests) + **Write back** bugs. Cannot Advance to Try. |
| 7 | Try with real people | **Ask** + **Do** (slice in their hands) + **Write back** observed use |
| 8 or 9 | stay at Try until founder Advance | Full loop; [growth pack](operating-system.md#after-proof-the-growth-pack) only after proof markers. Efficiency or an exit after fences + proof: [after-proof-efficiency.md](after-proof-efficiency.md). |

| Stored loop | Spoken week |
|-------------|-------------|
| 1 or 2 | Ask |
| 3–6 | Do |
| 7 | Write back |

---

## 6. Founder control inside the loop

The loop may be automated; **strategy must not**.

| Always human | May be AI-recommended |
|--------------|------------------------|
| Advance / kill journey phase | Stage transition inside a locked plan |
| Primary customer-group change | Persona draft updates |
| Success threshold change | Score calculation |
| Autonomy posture change (esp. toward looser) | Drafts / dry-runs under current posture |
| Spend / hiring / co-founder | Test generation |
| Shipping to real customers (first times) | Synthetic scenario runs |
| Clear a founder checkpoint (QC / Bind / Clock / Alpha) | Draft the Human Expert Brief; recommend opening one |

**QC Hold is path-local.** A QC checkpoint on one path does not set journey `Hold` and does not freeze other paths. Journey Hold still means the whole board waits. Absent checkpoints means the runtime behaves as it did before this pack.

AI permanent instructions: [`ai-instructions.md`](ai-instructions.md).

---

## 7. Evaluation harness & synthetic testing

Before relying only on real users, the system should run end-to-end against **synthetic** versions of the target customers. This is the backbone of **Ask**, then **Do at Build** as the product hardens.

The first serious harness is often the **light synthetic product sandbox** from the [next pack](operating-system.md#after-synthetic-ranking-the-next-pack): isolated, end-to-end, baseline scenarios, path roles only.

### What a good evaluation harness provides

- Realistic synthetic profiles for **customer groups** and other **path roles** (co-decider, provider, veto) with consistent constraints  
- Ability to run the full **thin slice** end-to-end in an isolated sandbox (no real side effects by default)  
- Clear pass/fail scoring against written success criteria  
- Decision traces for every run (why success or failure)  
- Ability to **re-run the same scenario ids** after changes to measure improvement  

### Synthetic continuity

The same synthetic personas used in early **Ask** should remain available in the product sandbox (still **Ask** / **Do at Filter or Build**) and later product evaluation (**Do at Build**).  

That creates continuity: the people you “talked to” in research are the same ones the product path is later tested against. Over time, real usage (**Do at Ground or Try**) refines these personas via **Write back** — it does not silently invent a second disconnected cast of characters.

Treat synthetic testing as a fast, repeatable **filter**. It does not replace real-world validation or real interest tests.

### Harness maturity ladder

| Level | What you have |
|-------|----------------|
| **0** | Manual checklist + one scripted walkthrough |
| **1** | Light synthetic product sandbox: baseline + path-role sample + multi-party/channel mess cases + pass/fail + capability verdict |
| **2** | Fixtures + automated unit/integration tests for the slice + versioned scenario ids |
| **3** | Multi-actor / multi-channel sim close to production shape |

Solo founders should not skip Level 1 while chasing Level 3 frameworks.  
The next pack’s sandbox **is** Level 1 — keep it light; grow depth only when the thin path already passes.

### Same schema: synthetic and real traces

Synthetic runs and real jobs should emit **decision traces with the same core fields** (inputs, action, observation, outcome, confidence/next-state as applicable). Label each run `synthetic` | `real` | `mixed`.

### High-value traces → stress scenarios and playbooks

Prioritize failures, novel objections, and successful recoveries:

1. Update reward/risk notes and persona attributes (**Write back**)  
2. **Seed a permanent stress scenario** in the eval harness when the failure is repeatable or high-cost. Same failure twice, patch the workflow here. Stop after two failures on the same problem. A checked harness failure first gets a short instruction or a denial at the step before the failure ([failure becomes a small runtime policy](operating-system.md#house-rule-failure-becomes-a-small-runtime-policy)). Rewrite the whole workflow only if that small fix fails.  
3. Promote successful patterns into playbooks / agent instructions only after the eval gate still passes. First time you do a repeatable task together: write a short skill; every later steer updates it ([skill-capture](operating-system.md#skill-capture-first-time--skill)).  

Do not let high-value traces die in chat history.

### Coupling Do at Build with EDD

```text
Do at Build   Spec + implement thin increment
Do at Build   Harness / synthetic + automated re-runs + cold-path (human eyes)
Do at Build   Gate on scores → founder Advance/Iterate/Hold/Kill (recommendation only)
```

See [Evaluation-Driven Development](operating-system.md#evaluation-driven-development-edd) and [Ready for human eyes](operating-system.md#ready-for-human-eyes-ship-gate-before-external-feedback).

### Ready for human eyes (runtime)

Before **Do at Try** product asks that depend on a **working URL** (mentor beta, “try this link,” interactive survey):

1. Founder states who + happy path + done-means + URL (plain language).  
2. Harness runs cold path (sandbox browser and/or NL synthetic first-time user).  
3. Set `readyForHumanEyes`: `blocked` (with blockers) or `green` (with evidence path).  
4. Only if **green** (or founder override + decision trace): draft external ask.  
5. Material path/deploy change → reset to `unknown` or re-run.

Checklist template: [`ready-for-human-eyes.md`](ready-for-human-eyes.md).

This is **not** Track A sandbox feasibility alone (sim capability). It is **cold deploy surface + happy path alive for a stranger**. This gate is not a crowd — [marketing volume cannot promote](operating-system.md#house-rule-marketing-volume-cannot-promote).

---

## 8. Minimum viable live OS (start here)

Before heavy agent frameworks, a solo founder can run an honest loop with:

1. Thesis + `research/` customer groups and personas (versioned by git)  
2. Market notes: what outside evidence supports vs does not establish  
3. `traces/` or `docs/decisions/YYYY-MM-DD-*.md`  
4. Scoreboard + loop cursor + **autonomy posture** (markdown is fine; default Strict)  
5. Learning rituals: weekly control-plane snapshot; Write back after real/heavy cycles; optional weekly scoreboard glance. Snapshot may end with automate / parallelize / delete.  
6. A weekly pass through Ask → Do → Write back with written outputs (even if Do is “no build this week”)  
7. After ranking: next pack — light synthetic product sandbox and/or real interest tests  
8. Product tests that encode pass/fail for the tiny slice (reuse sandbox scenario ids)  
9. **Ready for human eyes** field + cold-path check before external product-test asks ([checklist](ready-for-human-eyes.md))  
10. Reward/risk scorecards for top groups ([operating-system](operating-system.md#reward--risk-thinking--customer-group-ranking))  
11. Optional one-page virtual office: function cards (founder owns / AI helps / open); named human for external claims; primary partner may call jobs if useful  
12. Founder-day pack once real conversations exist (prep / close the call / post-talk / weekly admin drafts — drafts only)  
13. Calendar / inbox / meeting notes wired as **inputs** when you already use them — git remains memory  

**Then** add durable agent graphs when:

- Multi-step research/build/eval is too slow by hand, and  
- You already have clear schemas for personas, hypotheses, and scores.

---

## 9. Anti-patterns

| Anti-pattern | Why it fails |
|--------------|--------------|
| Loop with no real people at Ground or Try | Synthetic echo chamber |
| Do at Build before ranked Ask | Fast wrong product |
| Do without fixed thresholds | Endless storytelling |
| Write back as chat history only | Nothing versioned or auditable |
| New personas every eval week | No synthetic continuity; scores not comparable |
| Framework first | Months of glue, zero evidence |
| Auto-advance journey phase | Founder out of control |
| Default **Dangerous** posture | Harm without pauses |
| Channel expansion before thin slice works | Complexity without signal |
| Skip Write back + weekly snapshot | Chat logs, not a company |
| Simulated price tables treated as list prices | Fake demand; bad sales and bad fundraising stories |
| Capability-stage scores treated as current product proof | You measured a wish list, not a product |
| Green sandbox treated as product–market fit | Feasibility is not demand |
| Waitlist size treated as willingness to pay | Interest is not payment |
| Huge multi-role sim before thin baseline works | Complexity without a path |
| Paid ads scaled while sandbox baselines fail | Spend on a broken story |
| Growth pack without proof markers | Spend/reputation burn before the business is real ([growth pack](operating-system.md#after-proof-the-growth-pack)) |
| Multi-channel spray in the grow pack | Solo complexity without comparable signal |
| Vanity metrics as growth success | Optimizes noise; hides weak offer/channel |
| Daily content machine or follower count as grow-pack success | Personal brand is not product–market fit |
| Ask mentor/user to try product while human-eyes is not green | Wastes human attention on deploy/path debris |
| “Works in my chat / my cookies” as ready for eyes | Cold users hit different failures |
| Green human-eyes treated as PMF | Path alive ≠ people care or pay |
| Named bot roster as if staffed | Fake office; hides who approves ([virtual office](operating-system.md#virtual-office-how-company-work-is-divided)) |
| Overnight prospecting before proof | Growth machinery in disguise |
| “Where are we?” from git only while the week lives in chat | Control plane is stale |

---

## 10. Checklist: “Is our live OS real?”

- [ ] Personas and hypotheses are versioned; runs labeled synthetic / real / mixed  
- [ ] Important claims use evidence labels (outside facts / company signals / assumed capability / needs real-world proof)  
- [ ] Research personas are the same ids used in product eval (continuity)  
- [ ] Decision traces exist for last three strategy moves  
- [ ] Scores have numbers and thresholds, not only adjectives  
- [ ] Reward/risk scorecards exist for candidate customer groups (with demotions / hold)  
- [ ] After ranking, next pack artifacts exist: sandbox pass/fail and/or real interest tests with thresholds  
- [ ] Tests run in continuous integration or on a known command (scenario ids from sandbox when possible)  
- [ ] High-value failures have become stress scenarios or explicit “wontfix yet” notes  
- [ ] Ground or Try has at least one real (or clearly labeled pilot) input path  
- [ ] Write back updates personas, hypotheses, scores, and the next Ask question  
- [ ] Founder can answer “Where are we?” in under two minutes from state (journey rung + loop week + posture + gate)  
- [ ] If claiming “growth,” proof markers and a growth-round note exist — or explicit hold-scale ([growth pack](operating-system.md#after-proof-the-growth-pack))  
- [ ] Autonomy posture is written down (default Strict); standing deny list known  
- [ ] Weekly control-plane snapshot happened recently  
- [ ] Virtual office (if used) names who approves external claims — function cards stay, no fake bot titles  
- [ ] Weekly snapshot can see this week’s conversations (day tools as inputs) or explicitly notes “none this week”  
- [ ] Founder-day pack ran if real talks happened (prep / close the call / post-talk); skills updated when steered  
- [ ] `readyForHumanEyes` is tracked; external product-test asks only when **green** (or override + trace)  
- [ ] Cold happy path was run outside founder-only session before last mentor/user product ask  
- [ ] Open founder checkpoints (if any) are listed; empty is fine; QC Hold named by path  

---

*Implement with LangGraph, CrewAI, plain TypeScript, spreadsheets + scripts — whatever you will actually run weekly. The shape is the OS; the framework is furniture.*

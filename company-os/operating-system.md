# Company Operating System  
## For Solo Founders in Bootstrapping Mode

**Version:** 2.8.14  
**Last Updated:** 2026-09-19  
**Status:** Living guideline (blueprint — not any one company’s live runtime)  
**Audience:** Independent solo founders; mentors (e.g. Founder Institute, SCORE); AI helpers instructed to follow this system  
**Isolation:** Portable across startups. Each company keeps its filled instance outside this template (see `../templates/applied-here.md`).  
**Template changes:** Approval-gated — see root [README](../README.md#template-change-policy).  
**Live runtime (state + loop):** [`live-runtime.md`](live-runtime.md)

---

## True North

AI is the greatest leverage tool entrepreneurs have ever had.  
Today’s AI is the worst it will ever be.

This system helps a solo founder use that leverage to move fast, stay in control, and prove value with almost no money or team. It is written so a normal person — including a teenager — can understand and use it.

**AI without personal agency is not an edge.** Skillful tool use is table stakes. Real advantage comes from *your* insight and decisions — including contrarian ones — that most people and current AI still undervalue.

### How this OS may change (stability contract)

Founders adopt this for months. The OS must not be moving sand.

1. **Additive by default.** New packs sit beside existing ones. Names, clocks, gates, and deny-list items keep their meaning.  
2. **Optional until useful.** A new ritual is skippable until you have the situation it is for (no real conversations → skip the founder-day rows).  
3. **Rarely breaking.** We do not rename phases, restack the loop, or drop a gate without a named version note that says what to keep doing.  
4. **One mental model.** Two clocks. You stay in control. Evidence beats narrative. That sentence should still be true next year.  
5. **Say it once. Link. No filler.** Each idea lives in one place. Other files hyperlink. A short reminder is allowed on the page a founder actually opens (first-hour room line). Tests lock the source of truth and the pointers, not the same paragraph in eight files. High signal means only what changes a decision. Dense leftover text is good. A stream of novel riffs is not — house rules stay stable (see 1–3).  
6. **No instance secrets in the portable template.** This pack is process and control. Do not commit another company’s name, thesis, beachhead, scores, decision traces, or local paths. Example fixtures use fictional labels only. Live state stays in the founder’s instance. CI locks the absence.

A solid tool improves gradually. It does not ask you to relearn the desk every week.

---

## Who This Is For

Independent solo founders building something new with very limited time and money.

**Solo is a smart starting position** because you can move at the speed of AI without waiting for permission or coordination. It is not a rule that you must stay alone forever. When you find people who are genuine force multipliers — people who can use AI even better in an area of shared passion and skill — you should seriously consider bringing them on. That decision requires a clear comparison of the risks of hiring or taking co-founders versus the risks and limits of remaining solo.

Some principles may be useful inside larger companies. Those environments have additional politics, risk, and constraints. Adapt with the help of frontier AI — **never copy this system verbatim into a corporate context** without rethinking ownership, approvals, and incentives.

---

## Day 0: lifestyle or swinging for the fences

Answer this once, in the first hour: are you willing to work about ten years on a lifestyle / small good business, or did you decide up front you are swinging for the fences? Say it now so you do not grind three years on a popcorn stand and then notice it is not a company someone buys.

This is a Day 0 / Path 1 question. It is **not** a house rule and **not** a third clock. It does not set a price.

---

## How Mentors and Mentees Should Use This

| Role | Use |
|------|-----|
| **Mentor** | Point mentees here as a shared language for phases, gates, evidence, and control. |
| **Mentee** | Adopt the OS in *your* repo; replace every product example with *your* thesis and tests. |
| **AI (any host)** | Follow the blueprint + [`ai-instructions.md`](ai-instructions.md). Treat other folders in a host repo as that company’s product, not as universal law. |

**Golden rule for extraction:** Copy *process and control*. Do not copy another founder’s market, customer group, feature list, or “current hypothesis” as yours.

---

## Core Beliefs

1. **You supply the insight. AI supplies the speed.**  
   Using AI well is now normal. Real advantage comes from noticing and acting on opportunities that most people — and current AI — still undervalue or dismiss. (AI without personal agency is not an edge.)

2. **Do not fall in love with your first idea.**  
   The system exists to force an honest process: form a thesis, test it hard, learn, and be willing to change or kill it.  
   Several ideas are allowed. Each idea is its own thesis, instance, and scorecard. Do not hide a second idea to look focused. Rank and kill per board. Do not blend them into one story.

3. **Stay small until it works.**  
   Build the tiniest version that can prove people will pay or get clear value. Expand only after you have real proof.

4. **You stay in control.**  
   AI does the heavy work. You decide what is true, what to build, when to move forward, and when to stop. That includes staying in the decisions that shape the product — not only approving tickets or waiting on milestones from an agency, vendor, or bot. You do not need to write the code. When you hit a real knowledge boundary, hand off to a **named** human expert; do not pretend the tool closed the gap.

5. **Everything important must be visible and explainable.**  
   You should always be able to ask “Where are we?” and get a clear, honest answer.

6. **Evidence beats narrative.**  
   Time spent is not proof. Preference is not proof. Synthetic research is a filter. Real-world action is the gate.  
   House rule: [marketing volume cannot promote](#house-rule-marketing-volume-cannot-promote).  
   House rule: [a security program cannot promote](#house-rule-a-security-program-cannot-promote).  
   House rule: [there is no optimal price until people have paid and stayed](#house-rule-there-is-no-optimal-price-until-people-have-paid-and-stayed).  
   House rule: [do not automate a step that should not exist](#house-rule-do-not-automate-a-step-that-should-not-exist).  
   House rule: [legal paper cannot promote](#house-rule-legal-paper-cannot-promote).  
   House rule: [advisor ride-along is assumed, not observed](#house-rule-advisor-ride-along-is-assumed-not-observed).  
   House rule: [unpaid weeks cannot promote](#house-rule-unpaid-weeks-cannot-promote).

7. **Build evaluation-first when you build.**  
   Spec success criteria and a harness before (or with) the implementation — not after a big unmeasured build.

---

## Blueprint vs Live Runtime

| Layer | What it is | Example |
|-------|------------|---------|
| **Blueprint (this document)** | How a company OS *should* work: journey phases, gates, control rules | This file |
| **Live runtime** | Persistent state + continuous 7-stage learning loop + compute | Personas, hypotheses, scores, agents/graphs — see [`live-runtime.md`](live-runtime.md) |
| **Product runtime** | What customers touch | Your app, MCP, website |

The blueprint is **not** the running system. Do not confuse “we wrote the plan” with “we proved the business.”

### Two clocks (must stay distinct)

1. **Bootstrap journey (phases 1–9 below)** — slow, founder-gated “where is the company on prove-it?”  
2. **Live loop (stages 1–7)** — fast weekly/daily cycle: research → validate → build → test → eval → real feedback → memory update → back  

When speaking the board to a human, lead with the simple phase and loop names. Numbers stay in storage and in `get_journey`; use them in parentheses only if useful.

You can run many loop cycles inside one journey phase. Full detail, state stores, and the stage diagram: **[`live-runtime.md`](live-runtime.md)**.

The [founder-day pack](#founder-day-pack-how-the-week-actually-runs) is **not** a third clock. It is how *you* get through Tuesday (prep, close a conversation, drafts). The two clocks above still answer “where is the company?”

---

## Contrarian Insight as Edge

Before putting serious time into an idea, answer:

1. What do I believe about this problem or market that most smart people and current AI systems appear to disagree with or undervalue?
2. Is the disagreement about whether it *can* be done, *when* it should be done, or whether people will *care enough*?
3. If I am right, why has the opportunity not already been fully taken?
4. What is the upside if the view is correct versus the downside if it is wrong?
5. Can I test this belief with a **tiny, fast experiment** instead of a large bet?

You do not need rocket science. Many good companies win by acting on a simple truth others thought was too messy, too small, or not worth the effort.

If you later speak in public ([growth pack](#after-proof-the-growth-pack), after proof), that belief should still be **one unexpected observation from your experience** — short, same subject. It is not a content calendar and not Day-0 work.

---

## The Real Job of the Early Phases

The early phases are not a formality. They exist to stop you from building the wrong thing.

You must:

1. Form a clear thesis (what problem, for whom, why now, why you).
2. Generate several possible customer groups — not one favorite.
3. Test those groups with synthetic research (AI simulations of realistic people).
4. Rank them honestly by pain, willingness to act or pay, and how well you can reach them.
5. Do real-world conversations and small tests with actual people.
6. Only then choose a primary focus and a tiny first slice to build.
7. Keep testing. Be ready to change focus if the evidence is weak.

Any “current focus” in a real company is only a **hypothesis that has survived this process so far**. It is not assumed to be true forever.

---

## The 9 Phases (Simple View + Formal Aliases)

**Simple names are primary** (plain language). When you say where we are, lead with these names; the `#` column is storage and reference only.  
**Formal aliases** match common product-lifecycle language (FI decks, internal planning). They describe the **same journey**, not a second process.

| # | Simple phase (primary) | Formal alias | Exit signal (simple) |
|---|------------------------|--------------|----------------------|
| 1 | Form thesis and list possible customer groups | Ideation & Opportunity Framing | Written thesis + at least 3 customer-group candidates |
| 2 | Define what success looks like for each group | Vision, Mission & Customer Definition | Clear metrics / “done means…” per group |
| 3 | Synthetic research and first validation | Customer Discovery & Problem Validation *(synthetic leg)* | Ranked groups with written evidence notes; promote still **hold** |
| 4 | Real-world research and validation | Customer Discovery *(real leg)* + start of Solution & Monetization Validation | Real interest tests and/or conversations; weak groups demoted; see [next pack](#after-synthetic-ranking-the-next-pack) |
| 5 | Design the simplest system that can test the winner | Architecture & Agentic System Design | One tiny slice + pass/fail rules + human gates; light synthetic product sandbox often runs here in parallel with phase 4 |
| 6 | Build a tiny slice and test it hard | Build (Evaluation-Driven Development) | Slice runs end-to-end (fixture/sim OK); gate scores |
| 7 | Try it with real or realistic users | Test, Synthetic Evaluation & Early Launch | Observed behavior, not only compliments |
| 8 | Learn from what happens and improve | Traction, Feedback & Continuous Learning | Decision traces + score movement |
| 9 | Grow only after it clearly works | Scale & Expansion (after clear product–market fit) | Proof of value or payment; then [growth pack](#after-proof-the-growth-pack) — not spray-and-pray |

**Monetization stress** (will they pay / which path?) lives mainly in journey phases **4–5** and in ongoing reward/risk scorecards — not as a separate tenth phase.  
**Growth stress** (which channel, which message, when to spend) lives in journey phases **8–9** and the [growth pack](#after-proof-the-growth-pack) — not as a tenth phase and not before proof.

### Phase gates (structured)

Every move from one phase to the next is a **visible decision**. Recommended labels: **Advance**, **Iterate**, **Hold**, **Kill**.  
**You** make the final call. The AI never advances a phase by itself.

Record (or be able to produce) at least:

| Field | Meaning |
|-------|---------|
| **Entry criteria** | What had to be true to even consider the gate |
| **Evidence pack** | Synthetic and/or real artifacts (links, summaries, scores) |
| **System recommendation** | Advance / Iterate / Hold / Kill + short why |
| **Founder decision** | Your call, date, and any conditions |

How these phases sit on top of the continuous compute loop (and persistent state): [`live-runtime.md`](live-runtime.md) §5.

---

## How to Do Honest Research & Validation

Research has three jobs that must not be mixed up:

1. **Filter** cheaply with synthetic work (AI-modeled customers).  
2. **Ground** market claims in outside facts when you can.  
3. **Prove** with real people and real behavior before heavy building.

### Label every claim (what kind of evidence is this?)

Every important finding should carry **one** label. Use plain words so you never confuse a simulation with a sale.

| Label | Meaning | May be used as… |
|-------|---------|-----------------|
| **Outside facts** | Grounded in public or third-party sources (rules, filings, published data, on-the-record quotes) | Context for “why now” and market pressure |
| **Company signals** | Reaction to something true about *your* company (founder background, real pilots, real product behavior) | Trust and credibility tests only if the signal is real |
| **Assumed capability** | Valid **only if** a feature, security control, or process you do not fully have yet is treated as real | A build priority hypothesis — **not** proof you already have it |
| **Needs real-world proof** | Cannot be settled by AI-modeled people alone (demand, price they will pay, security approval, purchase) | Interview and pilot design only |

**Front-matter for any synthetic pack** (copy at the top of the file):

```text
What this is: AI-modeled customer responses used as a filter.
What this is not: proof of demand, willingness to pay, or a real purchase.
Outside facts are labeled separately. Everything else is a hypothesis to confirm or break with real people.
```

Older shorthand `synthetic` | `real` | `mixed` on traces is still fine for run type.  
For **claims inside a report**, prefer the four labels above so “assumed capability” cannot hide as “real.”

### Synthetic research (fast first filter)

Use AI to create realistic customer profiles and run conversations or scenarios with them.

Seed each profile from traces **outside the thesis** when you have them. No customers yet is normal for a new idea. Use **legal** adjacent traces: public forums, reviews of the substitute or a competitor, or the founder’s own prior-domain notes (no PII, nothing taken from a former employer’s private files). Do not import another company’s market or ICP list. If truly none, write **none yet**. A persona invented only from the pitch will confirm the pitch — use it to rank, not to promote. House rule: do not seed a persona from a demographic one-liner. Seed from traces of what they already do, pay for, or said in public. Demo-only role-play is the weak case.

Ask a **forced choice** that looks like the real decision, in the order they would face it. Also write down what they **say** (pain, substitute, objection, a yes). That is **stated** evidence. People are usually better at describing present pain than a future purchase — keep the words, do not treat a spoken yes as a sale. Do not ask the sim a 1–5 or a naked dollar WTP — a choice or a sentence, then map. Mapping may still produce a dollar figure. That is not the same as asking the sim for a price.

- What do they currently do instead?
- What do they say the pain is, in their words?
- If they must pick among this and that alternative, what do they choose?
- After one condition changes (price, time, or the thing they already use), do they still choose you?
- What would make them say no?

Do this for **several** customer groups, not just the one you like.  
Run the same few questions on a handful of real people before you trust the rank. If the rank order does not match, weigh the gap — do not throw out the words or the sim. If the sim answers are almost identical (too-tight variance) or the same prompt drifted versus the human handful, treat that synthetic pass as unusable. A new category with no prior survey in that category cannot be rescued by fine-tuning on some other survey — most Day-0 ideas are this case.  
Synthetic research is a useful **filter**. It may rank or kill. Weigh stated, synthetic, and observed. House rule (epistemology, not a paper): when they disagree, observed wins. A spoken yes cannot promote a group.

### Staged trust reveal (how synthetic trust actually moves)

If you score trust, adoption interest, or purchase interest with synthetic people, do **not** show them everything at once. Reveal in stages and score after each stage:

| Stage | What you show | Why |
|-------|----------------|-----|
| **1. Baseline** | Problem and offer only — no founder story, no traction claims, no product magic you do not have | Measures whether the idea is clear and relevant on its own |
| **2. Founder story** | Who you are and why you understand this problem (truthful only) | Isolates whether *you* earn attention |
| **3. Company signals** | Only real traction or proof you already have | Isolates whether the *company* earns a serious next step |
| **4. Assumed capability** | Features or controls you might build, clearly labeled as “if we had this” | Isolates what to build next — not what already exists |

**Reading rule:** Score **movement** between stages matters more than any single absolute score.  
A high final score that only appears after assumed capability means “build and re-test,” not “customers already want this.”  
Simulated prices and “I would buy” lines stay labeled **needs real-world proof**.

### Outside market facts (supports vs does not establish)

When you write or review market claims (deadlines, growth rates, competitor moves):

| Write explicitly | Purpose |
|------------------|---------|
| **What the evidence supports** | Claims that survive contact with sources (with links or citations) |
| **What the evidence does not establish** | Gaps, disagreements between sources, or leaps from “market is big” to “they will buy from me” |

Do not quote one vendor forecast as a hard fact when several sources disagree. Prefer a **range** and a **directional** claim you can defend.  
A strong market story is still not primary-focus promotion without customer evidence.

### Real-world research (required before heavy building)

- Talk to real people in the groups that looked strongest.
- Watch what they actually do, not only what they say.
- Run small tests (price conversations, manual “concierge” delivery, interest pages with waitlists, etc.).
- Look for clear signals that the problem is real and that people will take action.
- Carry forward open questions from synthetic work; design tests that can **break** your favorite story.

After you have a ranked synthetic research report, use the **next pack** below instead of jumping straight to a big build.

### Ranking rule

Only promote a customer group to **primary focus** if synthetic **and** observed evidence support it (weigh stated / synthetic / observed; observed wins a clash) **and** the reward/risk scorecard looks manageable for a solo founder at the current stage (see next section).  
If evidence is weak, keep looking or kill the idea. Do not protect an idea just because you have already spent time on it.  
Multi-group research is not multi-group go-to-market: **rank, demote, and hold** until promotion criteria are met.

---

## After Synthetic Ranking: The Next Pack

When user research has produced **ranked customer groups** (still with promote = **hold**), do **not** jump to a large product or a multi-cohort sales push.  
Run a **next pack** with two tracks. They answer different questions and may run **in parallel** or one after the other.

| Track | Question it answers | Evidence label |
|-------|---------------------|----------------|
| **A. Light synthetic product sandbox** | Is the product **capable enough yet** on a thin path under messy, multi-person conditions? | Synthetic product feasibility — **not** demand |
| **B. Real interest tests** | Will real people take a small step (waitlist, reply, book a call)? | Early real signal — **not** proof they will pay or stay |

Both are **filters**. Neither alone unlocks primary-focus promotion or “ship and scale.”

```text
Ranked synthetic groups (promote = hold)
        │
        ├──────────────────────────────┐
        ▼                              ▼
A. Light synthetic product         B. Real interest tests
   sandbox (feasibility)              (waitlist / outreach / …)
        │                              │
        └──────────────┬───────────────┘
                       ▼
              Founder gate (iterate / hold / deepen build)
                       │
                       ▼
              Tiny real slice + keep sandbox as eval harness
```

### Track A — Light synthetic product sandbox (feasibility)

A **completely simulated, isolated** run of a baseline product path. No real customers. No real outbound messages by default. No production side effects.

**Purpose:** answer *“Is the product capable enough yet?”* under realistic mess — not “Do people want this?” (that is Track B and later real proof).

This is **product feasibility evaluation**. You stress the thin slice the way the real world will: many steps, many people, imperfect information. A pretty demo that only works on a happy path is not a pass.

**What “feasible” means here**

The product (often including an AI assistant) must hold a **useful thread of work** to a defined end state **without** the founder silently fixing everything off-stage.

Typical stresses to encode as scenarios (pick what your product actually faces):

| Stress | What you are testing |
|--------|----------------------|
| **Long-running work** | Context survives hours or days, not one chat turn |
| **Multiple channels** | Email, SMS, chat, forms, or voice notes — same job, switched midstream |
| **Multiple people** | User, co-decider, provider/operator, and handoffs between their staff |
| **Different language styles** | Formal vs terse vs slang; incomplete sentences; mixed languages if relevant |
| **Handoffs and triage** | “I’ll pass you to scheduling” / new employee who lacks prior context |
| **Miscommunication** | Ambiguous replies, talking past each other, conflicting instructions |
| **Lost or wrong notes** | Missing thread, outdated address, wrong date, invented detail |
| **Recovery** | Product notices the gap, asks, escalates, or re-states truthfully |

*Domain example (not a required market):* an assistant helping a household manager coordinate a service job while the provider side triages and hands the thread between employees. The sandbox asks whether the assistant can stay coherent across channels and people — or whether it is **not ready yet**.

**Who you simulate**

1. **Each customer group still on the board** from the research report (same group ids as research — synthetic continuity).  
2. For every group, a **small cast of synthetic people** drawn from the **roles on the real product path** — not your whole company org chart forever.  
   Examples of path roles (rename for your domain): end user, second decision-maker, provider or operator, front-line employee, supervisor who takes a handoff, reviewer who can say no.  
3. Prefer a **sample** of each role type (one typical + one difficult), not dozens of near-duplicates.  
4. Sample **behavior styles** as well as job titles (careful, rushed, hostile, vague).

**Depth rule (stay light)**

| Group rank | Sandbox depth |
|------------|----------------|
| Top 1–2 test priority | Full baseline path + hard multi-person / multi-channel cases |
| Other groups still “hold” | Short baseline only: does the path apply? |
| Explicitly demoted / kill | Skip or one-line note why out of scope |

**What to run (per group you include)**

Define **one thin end-to-end baseline** (same shape as the first tiny slice):

```text
Trigger → core steps (may span time and channels) → clear next human action or terminal state
```

Then run at least:

1. Happy path  
2. Messy or incomplete input  
3. Stuck / needs human help  
4. One adversarial or “status quo is fine” case  
5. **Capability stress** (when the product is multi-party or multi-channel): handoff, context switch, or wrong/lost information  

Write **pass/fail** before you run — including what counts as “held the thread” vs “lost the plot.”  
Record decision traces. Re-use scenario ids later in the real evaluation harness ([`live-runtime.md`](live-runtime.md)).

**Sandbox rules**

1. **Isolated** — fake data only; dry-run by default; nothing that can email, charge, or change a real account.  
2. **End-to-end for the thin path** — not a full platform.  
3. **Same personas / group ids** as research when possible.  
4. **Assumed capability stays labeled** — if the sim pretends a feature exists, mark those results **assumed capability**.  
5. **Fail closed on capability** — if success needs constant founder interpretation, secret re-prompts, or ignoring bad handoffs, the product is **not capable enough yet**.  
6. **Honest scoreboard** — separate “path is clear” from “AI/product held up under mess.” A clear path with a weak assistant is still a fail for ship-readiness of that assistant.

**Outputs (minimum)**

```text
Sandbox id / date:
Customer groups covered:
Path roles simulated (and styles):
Channels and time span exercised:
Scenario ids + pass/fail:
Capability verdict: capable enough for thin path / not yet / unknown:
Where humans must approve:
Where context was lost, invented, or handed off badly:
What to change in product or slice before real build:
Evidence label: synthetic product feasibility (not demand)
```

### Track B — Real interest tests (waitlist and friends)

Small **real-world** steps that measure whether people will act at all — not whether they will pay forever.

**Purpose:** interest and channel signal under the **needs real-world proof** label for demand and price.

**Typical tools (pick what fits; mix is fine)**

| Means | Examples |
|-------|----------|
| **Page + waitlist** | Simple landing page; email or SMS list; friction (who they are, what problem) |
| **Organic** | Communities, content, personal network, referrals |
| **Social** | Posts with a clear next step |
| **In person** | Events, local boards, warm intros |
| **Paid** | Small, capped ad tests only after the offer text is clear |
| **Direct** | Outreach that asks for a reply, call, or pilot brief |

**Rules**

1. **One primary message per test group** — do not run five unrelated brand stories at once.  
2. **Measure behavior**, not compliments: signup, reply, booked call, submitted brief.  
3. **Write decision thresholds before you spend** (example: “if fewer than X qualified signups in Y days on Z spend, iterate message or demote channel”).  
4. **Cap paid spend** until a thin offer has passed at least one honest real conversation or sandbox feasibility check.  
5. **Waitlist ≠ willingness to pay.** Treat it as early interest. Price and payment stay open questions.  
6. **Lawful capture only** — consent, no spam, public-safe notes in public repos.  
7. **Marketing volume cannot promote** — this track is one real-interest test, not a calendar. Full rule: [marketing volume cannot promote](#house-rule-marketing-volume-cannot-promote).

**Outputs (minimum)**

```text
Test id / date:
Customer group targeted:
Channel(s) used:
Offer / page link (if any):
What people did (counts + examples, redacted):
Cost (time and money):
Pass / iterate / stop vs your pre-written thresholds:
Evidence label: real interest signal (not product-market fit)
```

### How to sequence A and B

| Pattern | When it fits |
|---------|----------------|
| **Parallel** (default for many solo founders) | Sandbox nights / AI time; interest tests when humans are reachable |
| **Sandbox first** | Path is unclear or multi-step; you would be embarrassed to show a broken story |
| **Interest first** | Message and channel are the open questions; the first offer is mostly concierge |

Do **not** wait for a perfect multi-actor simulated world before talking to anyone.  
Do **not** scale ads while the thin path fails every sandbox run.

### Founder gate before heavy build

After the next pack has produced artifacts, decide explicitly:

| Decision | Meaning |
|----------|---------|
| **Iterate** | Fix slice, message, or ranking; re-run A and/or B |
| **Hold** | Interesting but weak signal; no big build or big spend |
| **Deepen build** | Thin real slice + keep sandbox scenarios as the evaluation harness |
| **Kill** | Kill criteria hit for the hypothesis or the top group |

Primary-focus **promotion** still requires the full promotion rule (synthetic + real + manageable risk) — a green sandbox and a fat waitlist are helpful, not sufficient.

---

## After Proof: The Growth Pack

**When:** journey phases **8–9**, after proof — not a substitute for the [next pack](#after-synthetic-ranking-the-next-pack) (phases 3–5).  
**What:** capped experiments on the **same proven customer group** and thin path.  
**What not:** multi-channel acquisition machinery, channel-tooling folklore, a daily personal-brand calendar, or a tenth journey phase.

**Entry criteria (all required before growth machinery):**

1. Written proof of value **or** payment (founder-defined thresholds — not vibes).  
2. Thin path still passes its eval / sandbox gates (do not scale a broken story).  
3. Primary customer group is explicit; promote is no longer **hold** for that group.  
4. Pre-written **outcome** metrics for the next round (rule 1 below).

If any item fails → **Hold scale**. Stay in phases 7–8. List size and creative do not unlock entry.

```text
Proof markers + path still green
        │
        ▼
Entry gate: growth machinery allowed? (yes / hold)
        │
        ├─ A. Message / offer experiments (same group)
        └─ B. Channel experiments (one primary channel hypothesis)
        │
        ▼
Founder gate: iterate / promote channel / kill channel / hold scale
        │
        ▼
Write growth/ROUND_* + decision trace; only then expand spend or add a second channel
```

| Track | Question | Not proof of… |
|-------|----------|----------------|
| **A. Message / offer** | Does a clear offer get a **real next step** from the proven group? | Retention, lifetime value |
| **B. Channel** | Can **one** channel reach that group without burning trust or budget? | Product–market fit forever |

**Rules (portable):**

1. **Outcomes over vanity.** Count meetings held, paid starts, completed jobs, or retained use — thresholds written **before** the round. Opens, total replies, and list size are diagnostics only.  
2. **Audience quality before AI personalization.** Personalizing a bad or unproven list only scales noise.  
3. **One primary channel hypothesis at a time** (solo). Rank channels; demote; do not multi-GTM.  
4. **Pain owner, then budget owner** when the motion is a human conversation.  
5. **Reuse known history first** (closed-won patterns, champion continuity, churned power users) before buying cold volume — *if* that history exists.  
6. **Evidence labels still apply.** A reply is not retention. Spend is not product–market fit.  
7. **Overnight drafts after proof only.** The primary partner may batch research or message drafts for that one channel while you sleep. Outputs stay drafts. Live-send still waits for you. This is not a Day-0 ritual.  
8. **Insight quality before posting cadence.** If the channel is public writing, one unexpected observation from *your* experience, on the same subject, short. AI may draft; you own the insight. Follower count, streak length, and creator payouts are diagnostics — not phase-9 success. Skip this rule if the channel is not public writing.

**Founder gate after each growth round:**

| Decision | Meaning |
|----------|---------|
| **Iterate** | Fix message, offer, or audience quality; re-run with caps |
| **Promote channel** | Channel cleared thresholds; allow limited expansion |
| **Kill channel** | Fails cost, trust, or fit; stop |
| **Hold scale** | Interesting but weak; no spend expansion |

**Artifacts:** short notes under `growth/` (or equivalent) per round — hypothesis, cap, counts vs thresholds, decision, date. Live-loop stage 7 writes back scores and the next question.

**Not in this pack:** deliverability ops, data-vendor stacks, channel-specific tooling, posting calendars, or platform promotion promises. Optional private motion notes after a channel is chosen — never core OS law.

Efficiency or an exit after fences + proof: [`after-proof-efficiency.md`](after-proof-efficiency.md). Not Day 0. Not a third clock.

---

## Reward / Risk Thinking & Customer Group Ranking

Not every customer group is equally attractive for a bootstrapped solo founder.  
When ranking groups (sometimes called ideal customer profiles), write down **both** sides. A simple scorecard beats a vague feeling that “this group seems good.”

### Reward side

- How painful and frequent is the problem?
- How clearly will people pay or take action?
- How large is the **reachable** market for a solo founder (not a fantasy total-market slide)?
- How well does the solution fit the channels you can actually operate today?

### Risk side

- How hard is it to reach these people?
- How much customization or hand-holding will they need?
- How messy is the other side of the market (suppliers, partners, operators)?
- How much legal or operational complexity is involved?
- How long will it take to get a clear signal?

### Promotion rule

Only promote a group to primary focus when:

1. Synthetic **and** observed evidence support a real problem (weigh stated / synthetic / observed; observed wins a clash), and  
2. Reward looks real, and  
3. Risks look manageable for a solo founder **at this stage**

Improving scores on a **weak** hypothesis is less valuable than finding a stronger hypothesis.

### Scorecard (copy per customer group)

Use this for ranking and promotion. Messaging fields are optional; they do **not** replace reward/risk or kill criteria.

```text
Customer group:
Seed (own customers if any; else legal adjacent traces — public forums, substitute/competitor reviews, or the founder’s prior-domain notes with no PII. Not a former employer’s private customer list. If truly none, write none yet and treat as weaker):
Reward notes (pain, pay, reach, channel fit):
Risk notes (reach cost, hand-holding, messiness, legal, time-to-signal):
Forced choice (the decision in the order they would face it — not a 1–5 or a naked dollar WTP; choice or sentence, then map):
Condition changed (one of: price, time, or current alternative):
Stated evidence (date, their words — present pain, substitute, objection, or a yes; keep it, label it stated):
Synthetic evidence (date, who folded / who still chose you after the condition change):
Calibration (same 3 questions on a few real people? rank order match? too-tight variance or same-prompt drift vs the human handful → unusable; yes / no / not yet):
New category / no prior survey in this category? (yes = weaker — prior-survey calibration will not save it):
Gap (if stated, synthetic, and observed disagree — weigh them, do not discard any):
Observed evidence (date, time or money spent):
Rank (1 = best test priority) / Promote? (yes / no / hold):
Kill criteria for this group:

Optional — what to say (for interview and outreach tests only):
  Main pain (in their words):
  Language that seems to work:
  Main objection:
  Proof they would need:
  Clear next step to offer:
  Price or offer range to test (hypothesis — stated interest is a clue; observed time or money decides):

Optional — next pack (after ranking):
  Sandbox baseline path pass/fail (date):
  Real interest test result (date, channel, behavior counts):
```

---

## Founder Control Plane

This is how you stay in charge of the company operating system.

### What you must always be able to see

**Hard rule — transparency:** You must always be able to ask **“Where do we stand?”** and get a **crisp, plain-language company snapshot** in under two minutes. No cryptic dumps. No insider jargon as the only answer. Simple words a teenager can follow.

That snapshot must include, in everyday language:

- How far you are on **proving the business** (slow journey: step N of 9 + one plain sentence)
- What the **weekly learning loop** is doing (fast loop: step M of 7 + one plain sentence)
- Whether the next gate is open, waiting for you, blocked, or ready for review — **in plain words**
- How free the AI is (Strict / Auto / Dangerous) — **with what that means for you**
- Top open questions or risks
- Honest scores for the **active hypotheses and slices** (not only vanity product metrics)
- Last important action and why (plain language)
- Whether the weekly check-in and stage 7 memory write happened recently

### Natural language queries and Socratic dialogue

Ask the AI in normal language, for example:

- “Where are we right now?”
- “What is blocking the next step?”
- “What evidence do we actually have for this idea?”
- “Why do you think this customer group is strong?”
- “What should I decide today?”
- “Challenge the current ranking of customer groups.”
- “Show me the weakest assumptions we are still carrying.”

The AI must answer clearly, point to evidence, and accept challenge. Real back-and-forth about assumptions, trade-offs, and risks is expected.

### Strategic human interjection points

The system should surface moments where your judgment is especially valuable:

- Choosing or changing the primary customer group
- Setting or changing success thresholds
- Deciding whether weak evidence means “wrong idea” vs “needs more work”
- Deciding when to add people (hire / co-founder / contractor)
- Declaring that something has enough proof to grow (or enough weakness to kill)
- Choosing which **monetization path** to test next
- Setting or changing the **autonomy posture** (how much the system may do alone)
- Opening or clearing a [founder checkpoint](#founder-checkpoints-when-human-judgment-is-the-work) (QC, Bind, Clock, Alpha)

Most loop work can be delegated. These moments cannot. They do not add a tenth phase or a third clock.

### Founder checkpoints (when human judgment is the work)

Optional until you have the situation. Absent checkpoints means the company runs as it did on 2.8.9. Existing journey instances keep their phase, loop stage, and gate.

Two jobs get confused. Keep them apart.

**Trains.** Quality control when the bots cannot meet a human bar. Nothing creative. Better evals. Bugs out of the way. One path may Hold while the rest of the company keeps moving.

**Bets.** Occasionally the founder must take a contrarian position the system would call unreasonable or typical-to-avoid. High reward versus the risk, on a named horizon. If the judgment is right, the company can move ahead of the pack. If it is wrong, it can sink. That is why founders keep an order of magnitude more equity than any employee. Write the bet. Do not hide it in chat.

Four kinds. Do not invent a fifth on day one.

| Kind | When | What the founder does | What the system does |
|------|------|------------------------|----------------------|
| **QC** | This path is below human standard | Name the path. Clear only when the eval is honest | **Path-local Hold.** Other paths keep moving. Ready for human eyes stays the ship gate for external product-test asks |
| **Bind** | Sign, send, file, or spend that binds the company | Clear the draft, or refuse | Draft only. No live-send, no silent file |
| **Clock** | A date that will pass without the founder | Act, delegate to a *named* human, or write why it can slip | Surface the date. Do not let it expire in silence |
| **Alpha** | Founder rejects the default recommendation | Write the five fields below | Record the bet. Do not “fix” it back to typical |

**QC Hold is not journey Hold.** Journey Hold waits the whole board. QC Hold waits one path. A broken checkout does not freeze customer conversations.

**Alpha — five fields, or it is not an Alpha.**

1. **Bet** — the claim, in one sentence.
2. **Horizon** — by when this must be right or wrong.
3. **Falsifier** — what you will accept as proof you were wrong.
4. **Cap** — time or money you will spend to learn. No open-ended crusade.
5. **Default rec** — what the system recommended, that you are rejecting.

One open Alpha per idea unless the founder writes why two. Later mark the outcome: right / wrong / still open. A vague hunch is not Alpha. [Contrarian Insight as Edge](#contrarian-insight-as-edge) is how you *form* the view. The checkpoint is how you *bind* it to a date and a cap.

**Human Expert Brief** (when you hand a checkpoint to a named human): decision, evidence, assumptions, risk, the ask. Optional override line if the founder rejects the default rec. Name the person. A role title is not a person.

Soft moments stay soft: weekly snapshot, ranking challenge, “what should I decide today?” Those do not open a checkpoint.

Do not store another company’s deal, cap, or private instrument in this template. Instrument class only (sign, file, date, bet).

### How to say this

Desk labels (QC, Bind, Clock, Alpha) are for traces. They are not how you talk to a founder.

Speak in the founder's words when a founder-voice profile exists. If none exists yet, use these lines. Short. Calm. No acronyms. No pep talk. No "you should have known."

| Desk label | What the founder hears |
|------------|------------------------|
| QC | This path is not ready for a real person yet. We hold this path and write a better test. Other work can continue. |
| Bind | This would sign, send, or spend in the company's name. I will draft it. You decide whether it goes out. |
| Clock | There is a date that will pass. Someone with a name needs to act, or you write why it can wait. |
| Alpha | You want to go against what I would usually recommend. Write the claim, by when you will know, what would prove you wrong, and how much time or money you will spend to learn. |

If the founder already has a way of saying the same thing, use that. Update the skill. Do not correct their language into house jargon.

Never open a checkpoint by announcing the desk label first.

### Autonomy postures (how much the system may do alone)

Pick one default for the company this week. You can only get **stricter** in a narrower context — not looser.

| Posture | What AI / tools may do alone | What always waits for you |
|---------|------------------------------|---------------------------|
| **Strict** | Drafts, research notes, dry-runs only | Send, spend, journey advance, public claims, delete or change real accounts |
| **Auto** | Internal drafts + safe research loops | Same high-stakes list as Strict |
| **Dangerous** | Almost never. No pauses. Easy to hurt yourself. | You still own the outcomes |

Default for early solo founders: **Strict**.  
**Auto** is not “the AI runs the company.” High-stakes stay gated.

### Standing deny list (always on — every posture)

1. Never advance a journey phase without explicit founder OK.  
2. Never live-send, charge money, or change a real account without explicit OK.  
3. Never treat simulated prices or “I would buy” as demand.  
4. Never put secrets or personal customer data in public git or casual chat dumps.  
5. Never invent a fake staffed role (“Marketing Bot”) that hides who approves.  
6. Never skip stage 7 memory write after meaningful work if you claim you ran the loop.

### When solo vs add people (lightweight test)

Stay solo while AI + your judgment still outrun coordination cost.  
Consider adding someone when **all** of the following hold:

1. A clear force-multiplier skill gap you cannot cover with AI + small tools  
2. Shared passion and standards (especially how they use AI)  
3. The risk of staying bottlenecked exceeds the risk of dilution, misalignment, or burn rate  
4. You can still keep phase gates and final strategy under founder control  

Document the decision either way.

### Virtual office (how company work is divided)

You do not need a big team. You **do** need honest labels for who or what does each job today.  
This is about **company functions** (research, sales, product, finance), not product agents inside the app.

Keep **one primary operating partner** — the AI you talk to most.

For each important function, keep a short card (this card is the office; it does not go away):

```text
Function name:
Job (one sentence):
Who does it today:
  - Founder owns it
  - AI helps (drafts or research only — human still decides)
  - Open (not staffed yet — hire or fill later)
What goes in:
What comes out:
What we do this week:
Who must approve before anything goes external:
```

**Additive, optional:** the primary partner may call a **job** (a named kind of draft or research) when that finishes a card faster than one giant chat. A job is still “AI helps,” not a new employee. Skip this list until you have the situation.

| Job (examples — not a required roster) | What it hands back | When |
|-----|--------------------|------|
| **Conversation prep** | Short brief you can read on a phone | Before a real talk |
| **Close the call** | Next-step artifact from what they just said | Last minutes of a conversation |
| **Post-talk write-up** | Follow-up draft + traces / open questions | After a real talk |
| **Research** | Ranked notes with evidence labels | Live-loop stages 1–2 |
| **Outreach drafts** | Message in your voice, unsent | Interest tests; growth pack after proof |
| **Product-fact answers** | Customer-facing fact from *your* docs | When someone asks something technical |
| **Conversation coach** | What we learned, missed, and should ask next | After interviews exist |

The primary partner may run jobs in parallel. You still approve anything that goes external.

Rules:

1. **No fake staffing.** Do not label a box “Marketing Bot” or “Prospecting Bot” as if a person exists. If AI helps, say so and name the human who approves.  
2. **One human gate per external claim.** Market numbers, customer promises, and public posts need a named person (usually you).  
3. **Hire on a trigger, not a date.** Write what must be true before a hire makes sense (for example: “paid customers exceed white-glove founder time”), not only “hire in Q3.”  
4. **Outputs beat org charts.** Each function should hand something concrete to the next (brief, scorecard, pilot, decision trace).  
5. **Jobs do not replace cards.** A callable job is still “AI helps” on an existing function. Do not staff a roster of named bots.

A one-page virtual office plus the control plane answers “Where are we?” better than a title-heavy chart of empty roles.

---

## Decision Traces & Learning Loop

Important actions leave a simple record:

- **What** was done  
- **Why** (hypothesis or goal)  
- **What was observed**  
- **What happens next**  

These **decision traces** are the memory of the company. They serve three purposes:

1. **Honesty** — weak reasoning is harder to hide  
2. **Learning** — you and the AI improve from successes and failures  
3. **Feedback** — real usage flows back into the system  

When real users interact with the product, their decisions, approvals, rejections, and outcomes should feed back into:

- Customer profiles (groups / personas)  
- Success criteria and thresholds  
- Ranking of hypotheses  
- Improvement of the agents / product behavior itself  

Synthetic runs and real runs both produce traces. Over time the system should get better at predicting which actions lead to useful outcomes.  
Stage 7 of the live loop is where this write-back happens — see [`live-runtime.md`](live-runtime.md).

Suggested minimal template:

```text
Date:
Journey phase / loop stage:
Autonomy posture (Strict | Auto | Dangerous):
Decision:
Options considered:
Evidence used (run type: synthetic | real | mixed; claim labels if needed):
Choice:
Expected outcome:
Actual outcome (fill later):
Next review:
```

### Learning rituals (your “crons” without servers)

Recurring work that keeps the OS honest. Put it on a calendar or ask your AI every time. These are not product features.

| Ritual | When | Done means |
|--------|------|------------|
| **Control-plane snapshot** | Weekly | Journey phase, loop stage, posture, gate, top open questions — under two minutes. Optional last line: what to automate, parallelize, or delete. |
| **Stage 7 memory write** | After every real or heavy synthetic cycle | Scores, open questions, and hypothesis notes updated |
| **Scoreboard glance** | Weekly | The numbers you track still make sense (completion, willingness, escalation, …) |
| **Coordination-tax check** | Monthly, or after you almost hire | Three bullets: who else needs an agent? multiplayer work? pain if two people share one workspace? |

Skipping these is how you get chat logs instead of a company.  
Stage 7 is the **write-back**. The weekly snapshot is the **read-back**. Details: [`live-runtime.md`](live-runtime.md).

### Founder-day pack (how the week actually runs)

Learning rituals keep the **company** honest. The founder-day pack keeps **you** from spending the evening on admin after a day of conversations.

These are **drafts-only** under Strict. They are not a third clock and not a go-to-market machine.

| Ritual | When | Done means |
|--------|------|------------|
| **Conversation prep** | Before a real talk | Phone-skimmable brief: who, last trace, one question, one risk |
| **Close the call** | Last 5–10 minutes of a conversation | Next-step artifact from what they just said (follow-up, experiment, or one-pager) |
| **Post-talk write-up** | After a real talk | Unsent follow-up draft + traces / open questions updated |
| **Weekly admin drafts** | Weekly | Inbox and calendar sweep → drafts only; no send |

Overnight research or message-draft batches belong in the [growth pack](#after-proof-the-growth-pack) **after proof** — still no live-send.

If you have no real conversations this week, skip the first three rows. Do not invent meetings so the pack has work.

### Skill-capture (first time → skill)

Repeatable work should not live only in chat.

1. The **first time** you do a task with your AI, do it together once.  
2. Write a **short skill** — how you want it done, not only what.  
3. Every later steer **updates that skill**.  
4. Before any outreach draft: a **founder-voice** profile (from notes or sent mail you are proud of) and a standing **anti-slop** skill (plain language, no fake certainty, evidence labels).

Promote a skill into a playbook only after the eval gate still passes ([live runtime](live-runtime.md#high-value-traces--stress-scenarios-and-playbooks)).  
Skills are instance files in *your* repo (or your tool’s skill folder). Do not paste another founder’s market into a skill.

```text
ESTABLISHED (kept)                      ADDITIVE (optional until useful)
──────────────────                      ────────────────────────────────
FOUNDER (gates, send, spend)            same
two clocks (journey 1–9, loop 1–7)      same
virtual-office cards                    same
  founder owns / AI helps / open          + partner may call jobs for a card
primary AI partner                      same
learning rituals                        same four
  snapshot · stage 7                      snapshot may end with
  scoreboard · coordination-tax           “automate / parallelize / delete?”
git = company memory                    same
                                          + day tools may feed the snapshot
                                        founder-day pack (if real talks)
                                        skill-capture (first time → skill)
growth pack (after proof)               same
                                          + overnight drafts still unsent
                                          + insight quality before cadence
                                            (if the channel is public writing)

Nothing above on the left was removed. Two clocks stay two.
```

---

## Company-as-Code Thinking

In an AI-native company the repository (or single source of truth) is not just product code.  
It is the source of how the whole company thinks and acts: research, validation, product, evaluation, feedback, and learning.

Everything important lives in one place so both you and the AI agents can see the full picture. That is what makes the Control Plane work.

### Categories (names can evolve; categories should not)

| Category | Holds |
|----------|--------|
| **research/** | Customer profiles, interview notes, synthetic personas, validation results |
| **product/** | Working product pieces (app, agents, channels, flows) |
| **evals/** | Tests, scores, harnesses, pass/fail records, stress scenarios |
| **traces/** | Decision records from synthetic and real runs |
| **growth/** | Growth-pack round notes after proof ([growth pack](#after-proof-the-growth-pack)) — not pre-proof spray |
| **docs/** | This operating system, open questions, thesis, ADRs |
| **AGENTS.md** (root) | Thin always-on enforcement for the primary AI agent |
| *Optional:* **company/** | Policies, autonomy rules, workflow schemas |
| *Optional:* **skills/** | Founder-voice, anti-slop, and how-we-do-X skills (instance only) |
| *Optional:* **support/** | Escalation playbooks, exception handlers |
| *Optional:* **infrastructure/** | Shared synthetic tooling, persona/trace libraries |

Exact folder names can match your stack (`src/`, `docs/eval/`, etc.). The principle matters more than the labels: **one living source of truth** the founder and agents share. Nothing important should live only in chat history or in someone’s head.

### Example tree (adapt freely)

```text
your-startup/
  AGENTS.md               # Thin enforcement layer (see below)
  docs/
    company-os/           # Blueprint + live-runtime (or link)
    thesis.md             # Current thesis (hypothesis, not gospel)
    open-questions.md
  research/               # customer groups, personas, validation notes
  product/ or app/        # What you ship
  evals/ or tests/        # Automated + synthetic scenario tests
  traces/ or docs/decisions/
  growth/                 # After proof — growth-pack rounds
  company/                # Optional: policies, autonomy rules
  skills/                 # Optional: voice, anti-slop, how-we-do-X
  support/                # Optional: escalation playbooks
  infrastructure/         # Optional: shared synthetic tooling
  runtime/                # Optional: LangGraph/CrewAI/etc. company loop
```

Stage 7 of the live loop must write back into this tree (or an equivalent DB) so the next cycle is smarter.

**Frameworks:** LangGraph, CrewAI, and similar are **good options** for durable multi-step compute — not mandatory. Start with git + scripts if that is what you will actually run weekly. Details: [`live-runtime.md`](live-runtime.md).

Prefer public-safe language in public repos; keep real customer PII out of git history.

---

## Product Architecture Principles (Portable)

These are **company-design** principles, not a mandate to build any particular product (e.g. home services). Instance-specific architecture belongs in *your* product docs — fill `templates/applied-here.md` in your repo.

### Multi-agent thinking (keep simple)

Two different maps — do not mix them:

| Map | What it describes | Where |
|-----|-------------------|--------|
| **Virtual office** | Company functions and who runs them today | Control plane (above) |
| **Product roles** | Specialized jobs *inside* what customers use | This section |

Inside the product it is often useful to think in **specialized roles** rather than one giant agent. Example role *types* (rename for your domain):

| Role type | Job |
|-----------|-----|
| Researcher | Finds and ranks options/candidates |
| Outreach | Contacts people/systems and manages conversations |
| Extractor | Pulls structured facts from messy replies |
| Presenter | Turns results into something a busy person understands quickly |
| Escalator | Knows when to ask the human for help |

These can be separate agents or clear responsibilities inside a larger system.  
What matters: each role has **clear success criteria**, leaves **decision traces**, and escalates high-stakes steps to a human.

Do not mix this map with the virtual office. Product roles live *inside* what customers use. The virtual office’s primary partner and callable jobs are *company* work (prep, drafts, research). Same rule both places: no fake staffed titles.

### Channel principle

Start with the **smallest set of channels** that can produce real value.  
Add channels only when the core loop already works and evidence supports expansion.

### Human high-stakes gate

Escalate to the human when stuck or when the decision is high-stakes (money, irreversible actions, PII, legal). Default to dry-run / draft until approval when harm is possible. Prefer a typed [founder checkpoint](#founder-checkpoints-when-human-judgment-is-the-work) (QC / Bind / Clock / Alpha) over a vague “please review.”

---

## Evaluation-Driven Development (EDD)

When you **build** (journey phase 6 / live loop stages 3–5), prefer this factory loop over “code first, measure later”:

```text
Spec + success criteria
    → Harness ready (can fail the slice repeatedly)
    → Implement the smallest increment
    → Evaluation gate (scores vs thresholds)
    → Integrate + capture decision traces
```

- **Spec** includes pass/fail numbers, human gates, and expected artifacts.  
- **Harness** may be fixtures, scripts, or synthetic personas — see [`live-runtime.md`](live-runtime.md).  
- **Gate** is founder-visible; weak scores mean Iterate/Hold, not silent ship.  

The **next product increment** after a thin slice passes uses the **same discipline** (criteria, harness, stress cases, gate) — do not invent a looser process for “just the next feature.”

---

## Ready for Human Eyes (ship gate before external feedback)

**Problem this gate solves:** Solo founders (especially non-technical) often:

1. Build something that works in *their* session / private chat / logged-in browser  
2. Immediately ask a mentor or early user to “try it” or “beta test”  
3. Discover the happy path is broken for anyone else (permissions, JS errors, iframe/sandbox blocks, private-only deploys)

That wastes mentor time, erodes confidence, and slows learning. It is usually **not** “AI wrote bad code.” It is a **missing readiness gate** before asking humans for feedback.

This gate is the product-side twin of **Ready for real-world research** (ICP filter before real conversations). Different question:

| Gate | Question |
|------|----------|
| Ready for real-world *research*? | Have we filtered customer groups honestly enough to talk to real people about the *problem*? |
| **Ready for human *eyes* on the product?** | Can a **cold external person** complete the happy path without the founder in the room? |

### When it applies

Before any of these:

- Asking a mentor to beta-test or “click around”  
- Sending a product link to a prospect or survey respondent  
- Posting “try my app” publicly  
- Opening an interactive survey / waitlist that depends on working UI  

### Founder inputs (steering only — not a CS degree)

In plain language, the founder (or agent with founder confirmation) states:

1. **Who** — one-line customer / persona  
2. **Happy path** — e.g. “open link → sign in → complete main action → see success”  
3. **Done means** — e.g. “finish once without help; no red errors”  
4. **URL** — public or stable shareable preview (not only localhost / private chat)

### Required evidence (minimal, fail-closed)

| Evidence | Pass looks like | Typical failure this catches |
|----------|-----------------|------------------------------|
| **Cold URL** | Public or shareable preview strangers can open | “Works only in my session” |
| **Happy path complete** | Cold context finishes the path (sandbox browser and/or natural-language synthetic user) | Core flow dead |
| **Blocking console clean** | No uncaught JS / failed critical network on the path | Silent JS break on first external open |
| **Embed / frame policy OK** | Interactive surface actually runs where users land | iframe missing `allow-scripts` / sandbox killing UI |
| **Third-party auth / scopes** | Permission grant + return works once in a real browser | OAuth / Photos / cookie-domain denials |
| **Optional: founder cold confirm** | ~5 minutes on another device, phone, or incognito | Residual “only works for me” |

**Not required for this gate:** full browser matrix, load tests, deep SRE, high unit-test coverage %. Those can grow later. This gate is **mentor/user dignity** and honest learning — not production theater.

### How to check without becoming a mechanic

Use modern tools as the **vehicle**, not a curriculum:

| Tool class | Job | Founder experience |
|------------|-----|--------------------|
| Deployed / preview URL | Same surface strangers hit | “Here’s the link” |
| Sandbox browser E2E | Clicks path; catches JS / blank screens / iframe | Agent runs; founder sees pass/fail in English |
| Permission checks | OAuth scopes, cookies, third-party grants | Attempted in a real browser context |
| NL synthetic user (AI as cold user) | “You’re a first-time user. Complete …” | Stresses product language + flow |
| Console / network fail-closed | Blocking errors = gate red | No “looks fine to me” |

**Least-disruptive rule:** founders do **not** invent CI matrices. They state who + path + done-means + URL. The company OS harness (scripts, agents, sandbox browser) runs the cold path and reports blockers in plain language.

### Fail closed

- AI **must refuse** to draft “please test this” / beta-ask emails until the gate is **green** (or the founder explicitly overrides with a written decision trace: *why* they share a known-broken path).  
- Mark state: `readyForHumanEyes` = `unknown` | `blocked` | `green` (see [`live-runtime.md`](live-runtime.md)).  
- Prefer a short evidence artifact (e.g. `READY_FOR_HUMAN_EYES.md` or report path) with date, URL, path steps, pass/fail, blockers.  
- Green does **not** mean demand, payment, or product–market fit. It only means: *cold humans can exercise the path you want feedback on.* This gate is not a crowd — [marketing volume cannot promote](#house-rule-marketing-volume-cannot-promote).

### Mentor practice (shared language)

Mentors can say: *I only spend deep time on links that pass cold-stranger happy path.*  
Company OS makes that systemic so mentors are not the only backstop.

### Anti-patterns for this gate

- Localhost-only or founder-session-only “proof”  
- Private iframe / sandbox that kills scripts for external users  
- “Works in my AI chat” treated as shippable  
- Asking for feedback on a path never run outside the founder’s cookies  
- Treating green human-eyes as PMF or willingness to pay  

Portable checklist + evidence template: [`ready-for-human-eyes.md`](ready-for-human-eyes.md).

### House rule: marketing volume cannot promote

Someone saying you need marketing to prove the product, or to attract people who might buy, is asking for access to **observed** evidence — not a marketing department. After Ready for human eyes is green, run one real-interest test ([Track B](#track-b--real-interest-tests-waitlist-and-friends)): one channel, one ask, to people who already have the job, kill threshold written first. A calendar, SEO push, public launch week, marketing hire, or a pre-AI playbook someone is selling cannot promote. Impressions and “potential buyers” cannot promote. Observed use or pay can. The [growth pack](#after-proof-the-growth-pack) stays after proof (phases 8–9).

In this OS, **Ready for human eyes** means a stranger can finish the happy path on a cold link. It does not mean get a crowd looking. If the link is broken, marketing only advertises the breakage.

| | Do this | Not this |
|--|---------|----------|
| **Link first** | Signup works on a phone using only the public link. Text eight people who already pay for a messy workaround. Watch what they do. | A big public launch week, a 30-day content calendar, or an agency “to get eyes on it” while a stranger cannot create an account. |
| **One ask** | One post in the one place those people already complain. One ask (try the link, or book 15 minutes if you have this job this week). Kill line written first. | SEO blogs, lookalike ads, a waitlist of 400 with no constraint, or hiring a marketer to fill the top of the funnel. That is maybe, not use or pay. |
| **By hand** | Do the first three jobs by hand. If they come back or pay, then you can talk about a channel. | Email sequences, launch-week hour-by-hour, or buying last decade’s marketing stack (agency retainer, SEO package, “this used to work”) before anyone has used the thing twice. |

Same family: [a security program cannot promote](#house-rule-a-security-program-cannot-promote). [There is no optimal price until people have paid and stayed](#house-rule-there-is-no-optimal-price-until-people-have-paid-and-stayed). [Do not automate a step that should not exist](#house-rule-do-not-automate-a-step-that-should-not-exist).

### House rule: a security program cannot promote

Someone saying you must lock down the product so secrets do not leak to cloud vendors or AI labs, before anyone has used it, is asking for **one-hour hygiene** — not a security department. Same family as [marketing volume cannot promote](#house-rule-marketing-volume-cannot-promote): a program is not proof. The cutoff is not “paying customers.” The cutoff is: do you have someone else’s data, or a key that can spend money? Keys out of git, no live user text in AI chats, rotate if you already leaked a key. A waitlist of emails is already someone else’s data (small care, not SOC2). Idea theft by a frontier lab is not how a 0→1 company dies. SOC2, a vendor review of every model, refusing to use the AI tools you build with, or buying an enterprise DLP/compliance pitch cannot promote. Observed use or pay can.

| | Do this | Not this |
|--|---------|----------|
| **Hygiene first** | `.env` is gitignored. You used Cursor or Grok to build and did not paste a real user’s email thread into the chat. You concierge three people by hand. | Delaying the cold URL until every model has a vendor review. |
| **If you leaked** | If a key was committed, rotate it today, then get back to the interest test. | Refusing AI tools because “labs will train on my SaaS.” Hiring a security person or buying last decade’s compliance stack before anyone has used the thing twice. |

Same family: [there is no optimal price until people have paid and stayed](#house-rule-there-is-no-optimal-price-until-people-have-paid-and-stayed). [Do not automate a step that should not exist](#house-rule-do-not-automate-a-step-that-should-not-exist).

### House rule: there is no optimal price until people have paid and stayed

Someone saying you must find the optimal price from a handful-of-users survey, or stand up a CAC/LTV model before anyone has paid and stayed, is asking for **busy-looking fiction at 0→1** — not a price. Same family as a spoken yes cannot promote, [marketing volume cannot promote](#house-rule-marketing-volume-cannot-promote), and [a security program cannot promote](#house-rule-a-security-program-cannot-promote): a survey is not proof. There is no optimal price until people have paid and stayed. A survey of a handful of users will lie. Start with one price. Watch three numbers: how many start the trial, how many pay on day 31, how many are still paying on day 90. If almost everyone pays, raise it. If almost everyone leaves on day 31, the product is the problem or the price is. Do not optimize LTV until you have a year of that. Most 0→1 companies die; a long LTV model is fiction.

SaaS 1.0 playbooks may be outdated in the AI era. Stay current. Do not guide to where the puck has been. This OS does not host last decade's SaaS tables as the aim. If a later page ever cites numbers, they must be dated current-year AI sources, not old tables. That page: [`after-proof-efficiency.md`](after-proof-efficiency.md) — fences + proof + they asked. Not Day 0.

| | Do this | Not this |
|--|---------|----------|
| **One price** | Start with one price. Watch how many start the trial, how many pay on day 31, how many are still paying on day 90. | A handful survey for “optimal price” or willingness to pay. |
| **Then move** | If almost everyone pays, raise it. If almost everyone leaves on day 31, the product is the problem or the price is. | A CAC/LTV model before you have a year of people who paid and stayed. Last decade's SaaS playbook as the aim. |

This rule applies whenever a founder sets a price. It is **not** a third clock, **not** Day 0 homework, and **not** only a hosted MCP pin.

Same family: [do not automate a step that should not exist](#house-rule-do-not-automate-a-step-that-should-not-exist).

### House rule: do not automate a step that should not exist

Someone saying you must automate the playbook, or stand up an agent team to skip a step that has no named owner, is asking for **busy-looking machinery at 0→1** — not a process. Same family as [marketing volume cannot promote](#house-rule-marketing-volume-cannot-promote) and [a security program cannot promote](#house-rule-a-security-program-cannot-promote): a playbook is not a person. Do not speed up or automate a step that should not exist. Every requirement has a person's name, not "the program" or "the playbook." Delete the step before you simplify it. Automate last. An agent team is automation.

Name the one bottleneck this week and work that. It must be the problem that, if solved, unlocks the most — the honest biggest company bottleneck, the one stuck thing whose unlock this week would move the company the most. Preference and “this is interesting” cannot name it. Several ideas may attack that same bottleneck. A second ritual, channel, or agent team that does not attack it is busywork. The AI must challenge a fun side quest dressed as the bottleneck. Founder still decides, but the agent does not rubber-stamp. A new landing page is not the bottleneck when no one has talked to customers, unless the founder overrides with a written decision. Several ideas are still allowed — each its own board ([2.8.5](#core-beliefs)).

Teaching pictures, not extra law: the company only moves as fast as its weakest link. The platoon only moves as fast as the slowest soldier. Work that is not on that link is not progress.

| | Do this | Not this |
|--|---------|----------|
| **Name first** | The requirement has a person's name. If you cannot name who asked for the step, delete it. | "The playbook says" or "the program requires." Hiring an agent team to skip a step with no owner. |
| **Delete first** | Delete the step. If it remains, you may simplify it. Automate last. | Speeding up or automating a step that should not exist. An agent team is still automation. |
| **One bottleneck** | Name the one bottleneck this week and work that. It must be the problem that, if solved, unlocks the most. Several ideas may attack that same bottleneck. | Preference and “this is interesting.” A fun side quest dressed as the bottleneck. A new landing page when no one has talked to customers. A second ritual, channel, or agent team that does not attack it. |

This rule is **not** a third clock, **not** Day 0 homework, and **not** an accelerate or optimize law. Factory speed is not 0→1.

Same family: [there is no optimal price until people have paid and stayed](#house-rule-there-is-no-optimal-price-until-people-have-paid-and-stayed). [Legal paper cannot promote](#house-rule-legal-paper-cannot-promote). [Advisor ride-along is assumed, not observed](#house-rule-advisor-ride-along-is-assumed-not-observed).

### House rule: legal paper cannot promote

Someone saying you must finish the cap table, a SAFE, or a lawyer email thread before anyone has used or paid is asking for **paperwork**, not proof the product works. Same family as [a security program cannot promote](#house-rule-a-security-program-cannot-promote).

**Meaning.** Real proof = someone used the product, paid, came back, or referred a friend. Legal paperwork (cap table, SAFE, lawyer emails) does not prove the product works and does not move you to the next stage by itself.

| | Do this | Not this |
|--|---------|----------|
| **Paper later** | The founder points at [starter legal templates](#starter-legal-templates). They get one stranger through the happy path this week. File the paper on the side. | A lawyer emails that the SAFE is signed. Nobody has tried the product. The founder treats the signed paper as proof strangers can try the product. |
| **Stay put** | The paper gets filed. The company stays at the stage the product evidence supports. One stranger still finishes the product. | The week's only activity is lawyer emails. The founder still says the company moved to the next stage because the cap table is clean or a SAFE is signed. |

Same family: [advisor ride-along is assumed, not observed](#house-rule-advisor-ride-along-is-assumed-not-observed). [A security program cannot promote](#house-rule-a-security-program-cannot-promote).

### House rule: advisor ride-along is assumed, not observed

Someone saying an advisor's promise of exclusivity, or an Office Hours tip about price, proves customers will pay is mixing up a **tip** with real proof. Same family as a spoken yes: talk is not a sale.

**Meaning.** Real proof = someone used the product, paid, came back, or referred a friend. An advisor's opinion or an Office Hours tip is a tip — not proof customers will pay. A promise of exclusivity is not that either. Do not delay a customer who wants to pay just to keep an advisor happy or "exclusive."

| | Do this | Not this |
|--|---------|----------|
| **Paying customer first** | The advisor is helpful. A prospect asks to pay. The founder ships the pilot. Any exclusivity promise waits until there is a real reason. | An advisor says "don't take customers yet — stay exclusive to my introductions." A real prospect then asks to pay and start. The founder delays or turns them down so the advisor stays happy. The prospect's ask is the real signal; the advisor's exclusivity talk is only an opinion. |
| **Write who said it** | In Office Hours someone says "founders hate paying $X for this." The founder writes "Person N said this in Office Hours" and treats it as that person's opinion. Discovery still looks for a named buyer who acts. | In Office Hours someone says "founders hate paying $X for this." The board treats that tip as proof of what customers will pay and moves on. No named buyer ever said they would pay. A room tip is not a sale. |
| **Stay put** | Advisor notes stay in the notes. The company stays put until someone uses the product, pays, comes back, or refers a friend. | The week's only activity is advisor meetings, lawyer emails, or exclusivity talk. The founder still says the company moved to the next stage. Talk is not proof someone used or paid. |

**Implement.** Write down who said what. Check that first before you write exclusivity language. A week of only lawyer emails and advisor meetings = stay put. A named person who wants to pay can move you.

Same family: [legal paper cannot promote](#house-rule-legal-paper-cannot-promote). [There is no optimal price until people have paid and stayed](#house-rule-there-is-no-optimal-price-until-people-have-paid-and-stayed). [Unpaid weeks cannot promote](#house-rule-unpaid-weeks-cannot-promote).

### House rule: unpaid weeks cannot promote

Someone asking you to keep working for a company that has not paid, so the deal can close later, is asking for free work. That is not proof they will pay. Same family as [legal paper cannot promote](#house-rule-legal-paper-cannot-promote) and a spoken yes cannot promote.

**Meaning.** The first conversation is free. After that, time you spend doing work for that company needs a named paid offer, or a written job with a date the work stops. A long buying process is normal for a large company. A long buying process is not free custom work.

**Who buys.** Write the customer type on the existing customer-group card. It tells you how long a paid yes usually takes, and which follow-up questions to ask next. It does not create a second product or a second way of selling.

| Type | Who usually decides | Time to a first paid yes | Follow-up cue |
|------|---------------------|--------------------------|---------------|
| **Consumer** | One person, paying for themselves | Days to a few weeks | Listed price. They buy or they do not. |
| **Small business** | The owner or a small team | Weeks to a couple of months | BANT (see words below) |
| **Mid-market** | A department. A few people must agree | About one to three months | MEDDIC (see words below) |
| **Enterprise** | Many people. Purchasing, legal, often a security review | Several months, sometimes a year | MEDDPICC (see words below) |

Rank is still test priority. A slow enterprise group is not automatically the best group to work this week.

**Words used here.** These letters are a follow-up cue after the first conversation, for that customer type only. They are not Day 0 homework and not a second way of selling. Look them up when that type is live. Do not run all four methods on every group. Use these meanings only. Do not invent other expansions.

- Listed price — they buy the published offer or they do not.
- BANT — Budget (is there money), Authority (can this person say yes), Need (do they have the problem now), Timeline (when do they need it).
- MEDDIC — Metrics (what number makes this worth buying), Economic buyer (who owns the money), Decision criteria (how they will judge you), Decision process (the steps to a yes), Identify pain (the problem in their words), Champion (the person inside who wants this to happen).
- MEDDPICC — the same six, plus Paper process (purchasing, legal, security review) and Competition (including building it themselves or doing nothing).

A filled BANT or MEDDIC list is still stated interest. It cannot promote the group. They have to pay and stay.

**When this rule applies.** You already had a first conversation with a real person. They now want work from you: a custom plan, a build on their files, extra sessions, sitting with their team, or an unpaid trial.

**When this rule does not apply.**
- Day 0 (thesis, at least three customer groups, one snapshot).
- Ranking groups before you have talked to anyone.
- The first conversation itself.
- Building your own product.
- Public writing.
- Waiting while their purchasing process runs, as long as you are not producing custom work for them during the wait.

| | Do this | Not this |
|--|---------|----------|
| **First talk** | Take the first conversation. Learn if they have the problem and who decides. | Treat the first call as a promise to start unpaid work. |
| **Next session** | Price the next working session. A small paid trial, a paid setup, or a written job with a stop date. | A second unpaid working session so they can "see it first." |
| **Long cycle** | Send the price of a small first slice. Work other groups while they buy. | Spend the months of their process writing custom documents for free. |

A shop owner likes the first call and asks you to set up her three stores next week. That setup is paid, or you stop and talk to other owners.

An operations lead at a large company has a good first call. Purchasing will take four months. You send the price of a small paid trial they can run while purchasing works. You do not spend those four months writing custom reports for free.

A person tries your consumer app. They pay the listed price or they do not. There is no second unpaid strategy workshop.

This rule is **not** Day 0 homework, **not** a tenth phase, **not** a third clock, and **not** a sales course.

Same family: [legal paper cannot promote](#house-rule-legal-paper-cannot-promote). [There is no optimal price until people have paid and stayed](#house-rule-there-is-no-optimal-price-until-people-have-paid-and-stayed).

### Decision methods (aliases, not a third clock)

Two jobs. Do not mix them.

**This week’s company move (growth / constraint).** Use IESER, in this order, inside the house rules that already exist: Identify the one bottleneck; Exploit it with what already exists; Subordinate everything else; Elevate (spend, hire, extra paper, extra agents) only after Exploit is exhausted; Repeat when the constraint moves. Work the named bottleneck the way 2.8.9 already requires: every requirement has a person's name; delete the step before you simplify it; automate last. Legal paper, marketing volume, a security program, unpaid weeks, and advisor tips still cannot promote a journey phase.

Exploit is the live paid path or the first conversation. It is not free custom work after that talk. Elevate is guidance. It is not the growth pack. Channel spend stays behind proof.

**A document that binds the company.** Use FIRAC before anyone signs, files, or wires: Facts (observed, sourced); Issue (what this instrument actually does); Rule (the controlling paper + house SOP + any live Clock); Application (this company’s facts against that rule); Conclusion (sign / change / wait). FIRAC does not apply to routine receipts or clicking a website terms box. It applies to Bind checkpoints: board consent, plan/pool/SOPA, 83(b), SAFE or priced close, and any filing that starts a statute clock.

Paper still cannot advance a journey phase. Paper may be constraintThisWeek only while a Clock checkpoint is open (close date, 83(b) after exercise, customer date that expires this week). No Clock open → paper is a side file. Checkpoint kind Clock is not the same as the two clocks (journey + live loop). Do not rename either.

Where-are-we / recon card (plain words, put in why):
Bottleneck: …
Do this week with what we have: …
Wait / do not spend: …
Clock open?: none | 83(b) by DATE | close DATE | customer DATE

---

## Instructions for Your Main AI Helper

### Thin enforcement layer vs full constitution

| Artifact | Role |
|----------|------|
| **This Operating System** (+ live-runtime) | Full constitution: phases, gates, research rules, scores |
| **Root `AGENTS.md` / project rules / system prompt** | **Thin, always-loaded** enforcement so the primary AI does not drift |

Most founder tools (Cursor, Claude, Codex-style agents, Grok, Lovable, etc.) support a persistent instruction file. Common names: `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, custom instructions.

That file should stay **short and authoritative**. It points at the full plan, encodes non-negotiable invariants, and tells the agent how to talk to you. It does **not** replace the Operating System, control plane, phase gates, or evaluation harnesses.

Canonical paste block: [`ai-instructions.md`](ai-instructions.md). Also pasteable below. Update when focus or hard rules change. Tools change quickly. Principles last longer.

```
You are my main AI operating partner for this company.

Follow the Company Operating System (solo-founder bootstrap blueprint + live runtime loop).
I stay in final control of strategy, journey phase changes, and important decisions.

Hard rules you must follow:
1. Never advance a journey phase without my explicit approval.
2. Never treat an early idea or customer group as proven on stated preference or synthetic work alone. Weigh stated, synthetic, and observed. House rule: when stated and observed disagree, observed wins. A spoken yes cannot promote a group. Marketing volume cannot promote. A security program cannot promote. There is no optimal price until people have paid and stayed. Do not automate a step that should not exist.
3. Label claims honestly: outside facts, company signals, assumed capability, or needs real-world proof.
   Also label research inputs: stated (their words) | synthetic (sim after a condition change) | observed (time or money).
   Never treat simulated prices or a spoken “I would buy” as demand. Keep the words. They are stated evidence, not a sale.
   Never ask a synthetic user for a Likert or a naked dollar WTP; ask a choice or a sentence, then map. A mapped figure after a choice is allowed. If synthetic variance is too tight or the same prompt drifted versus a human baseline, discard that pass. A new category with no prior survey cannot be rescued by fine-tuning.
4. When I ask “Where are we?” or “Where do we stand?”, answer with a crisp plain-language
   company snapshot — journey and loop in everyday words, how free the AI is, gate in plain words,
   evidence, open questions, honest scores. No cryptic dumps.
5. The standing deny list applies in every posture (no silent live-send, spend, or fake staffing). One primary partner may call jobs; jobs are not employees.
6. When an important decision needs human judgment, say so directly.
7. Prefer small, honest tests and evaluation-driven increments (Spec → Harness → Implement → Gate) over big unmeasured builds.
8. After ranked synthetic research, prefer the next pack: light synthetic product sandbox and/or real interest tests before a heavy build.
9. Never draft or send a request for external human product testing (mentor beta, “try my link,” interactive survey) unless Ready for human eyes is green: cold URL, happy path completed in a non-founder context (sandbox browser and/or synthetic cold user), no blocking console/iframe/auth failures — or I explicitly override with a written decision trace.
10. Record the reason for important actions (decision traces); close stage 7 (memory update) after meaningful runs.
11. If stage 7 or the weekly control-plane snapshot is missing after meaningful work, say so.
12. Answer me in plain language I can understand. Avoid cryptic abbreviations.
13. Surface recommended human interjections when judgment is high-leverage
    (customer group, thresholds, hire/cofounder, grow/kill, monetization path, autonomy posture, ready-for-human-eyes).
14. Keep reward/risk thinking visible when ranking customer groups or monetization paths.
15. Do not import another company's product thesis or market as mine unless I explicitly adopt it.
16. Treat agent frameworks as optional implementors of the live loop — principles first, framework second.

If you are unsure, ask me. Do not guess on strategy or protect weak ideas.
```

---

## Current Working Hypothesis (Template Only)

**Do not fill this section with someone else’s business.**  
In *your* company runtime, keep a short hypothesis file (e.g. `docs/thesis.md`) with:

1. **Who** you help (primary customer-group candidate)  
2. **What pain** you address  
3. **How** you help (one sentence)  
4. **Why now / why you**  
5. **Contrarian edge** (what others undervalue)  
6. Explicit label: **This is a hypothesis subject to evidence**

For how a real project states its hypothesis under this OS, see that product's `applied-here.md` (or `docs/company-os/applied-here.md`) — **example only, not your market**.

### First tiny slice (template)

For the primary customer group, define **one** slice that can fail fast. Before building, write:

| Artifact | Content |
|----------|---------|
| **End-to-end goal** | What a successful run produces |
| **Success criteria** | Pass/fail numbers, not vibes |
| **Harness reference** | How you re-run the slice (command, scenario ids) |
| **Expected artifacts** | Outputs that must exist (comparison, traces, state) |
| **Human gates** | What requires approval; what “stuck” means |
| **Synthetic runnable?** | Same personas as research can exercise the path |

Every run should leave decision traces.

If the slice works **and** the customer hypothesis still holds, define the **next small increment** with the **same checklist** (do not drop evaluation-driven discipline).

---

## Scoring Metrics We Watch

These scores help decide when something is good enough to move forward — or when to stop.  
Adjust names to your domain; keep them honest. Track them over time. Prefer **stable definitions** so comparisons stay meaningful across weeks.

### Evidence strength

| Score | What it asks |
|-------|----------------|
| **Problem evidence** | Is the pain real and frequent for this group? |
| **Willingness** | How often do people show clear willingness to act or pay? Label the number **stated**, **synthetic**, or **observed**. |

### Operational performance

| Score | What it asks |
|-------|----------------|
| **Completion** | % of runs that reach a defined terminal success state without unplanned escalation |
| **Extraction / quality** | % of contacts/sources that yield usable structured information |
| **Escalation** | % of runs needing human intervention (optionally by reason) |
| **Time-to-resolution** | Distribution of elapsed time from start to terminal state |
| **Trace completeness** | % of major steps that emit a valid decision trace |

### Experience & trust

| Score | What it asks |
|-------|----------------|
| **Trust / friction** | Does it feel trustworthy and low-friction? |
| **Approval friction** | How often / how many approval gates; acceptance vs rejection |
| **Re-engagement need** | How often the user must send extra clarifying input |
| **Channel success distribution** | Success rate by channel (email vs SMS vs form vs other) |

### Economic attractiveness

| Score | What it asks |
|-------|----------------|
| **Reward vs risk** | Overall attractiveness of the current primary customer group (scorecard) |
| **Early-revenue attractiveness** | Rank derived from reward vs risk for prioritization |
| **Willingness to pay (early)** | Signals for price / fee / subscription (as applicable; real-world proof when claimed) |

Use scores to decide **Advance / Iterate / Hold / Kill** — not to decorate a pitch deck.  
Thin-slice gates should set numeric thresholds on at least Completion, Extraction, Escalation, and Trace Completeness under normal (and selected stress) conditions.  
**Improving scores on a weak hypothesis is less valuable than finding a stronger hypothesis.**

---

## Near-Term Checklist (Any Startup)

1. Confirm the primary focus and contrarian edge still feel right to **you** (soft human check).  
2. Write down the current thesis and the main customer groups under consideration.  
3. For market claims, write **what the evidence supports** and **what it does not establish**.  
4. Run honest synthetic research across several groups (not just the favorite), with evidence labels and a staged trust reveal when you score trust or price interest.  
5. Create **reward/risk scorecards** for the top candidates (optional “what to say” fields only after rank/hold is clear).  
6. Rank them by evidence, not by preference; demote weak groups explicitly; keep promote = **hold**.  
7. Run the **next pack**: light synthetic product sandbox (Track A) and/or real interest tests such as waitlists (Track B) — parallel is fine. See [marketing volume cannot promote](#house-rule-marketing-volume-cannot-promote).  
8. Founder gate on sandbox + interest results before a heavy build.  
9. Do deeper real conversations and small paid or concierge tests with the strongest groups.  
10. Only then lock a primary focus and a tiny first slice (with the slice artifact checklist).  
11. Sketch a **virtual office**: function cards (founder owns / AI helps / open) and who approves external claims. The primary partner may call jobs if useful — not a named-bot org chart.  
12. Pick an **autonomy posture** this week (default **Strict**) and keep the standing deny list visible.  
13. Put the thin AI instructions into root `AGENTS.md` / your main tool.  
14. Define clear **numeric** pass/fail thresholds for the first slice **before** building further.  
15. Keep sandbox scenario ids as the seed of a **minimal evaluation harness** ([`live-runtime.md`](live-runtime.md)).  
16. Run evaluation-driven increments (Spec → Harness → Implement → Gate).  
17. Keep asking: “What evidence do we actually have?” and “What would make us kill this hypothesis?”  
18. Keep decision traces for anything that changes phase, customer group, monetization path, autonomy posture, or spend.  
19. Run the **learning rituals**: weekly control-plane snapshot; stage 7 after every real or heavy synthetic cycle. The snapshot may end with what to automate, parallelize, or delete.  
20. Once real conversations start, run the **[founder-day pack](#founder-day-pack-how-the-week-actually-runs)** (prep / close the call / post-talk / weekly admin drafts). Capture skills the first time; update them when you steer.  
21. When proof markers exist, run the **[growth pack](#after-proof-the-growth-pack)** before multi-channel spend. Overnight draft batches are allowed then — still no live-send.  
22. Keep growth round notes under `growth/`; vanity metrics are not phase-9 exit.

---

## Open Questions (Starter Set)

Every company should maintain its own list. Starter prompts:

- Which customer groups currently have the strongest **combined reward/risk** profile?  
- Did the light synthetic product sandbox pass baseline paths for the top groups?  
- Did real interest tests clear pre-written thresholds (waitlist, replies, calls)?  
- What exact price (if any) are people willing to pay? (real-world proof only — not simulated tables). A handful survey is not that proof — [there is no optimal price until people have paid and stayed](#house-rule-there-is-no-optimal-price-until-people-have-paid-and-stayed).  
- What are the **numeric pass thresholds** for the current thin slice?  
- What **autonomy posture** are we on this week (Strict / Auto / Dangerous)?  
- How often should the system ask the human for approval versus acting within a safe draft/dry-run band?  
- Did we run the weekly control-plane snapshot and close stage 7 after the last real cycle?  
- Did this week’s snapshot see the actual conversations (calendar / inbox / notes as inputs), or only last week’s markdown?  
- Which founder-day rituals ran (prep / close the call / post-talk / admin drafts)?  
- What skills did we capture or update? Is there a founder-voice profile before outreach drafts?  
- Optional last snapshot line: what should we further automate, parallelize, or delete?  
- What legal and ethical rules apply to outreach in our channels? Starter drafts: [starter legal templates](#starter-legal-templates).  
- When do the risks of staying solo become larger than the risks of adding help?  
- What is the **smallest set of channels** that still produces real value?  
- How aggressively should multi-party outreach run in **parallel** vs building trust one step at a time?  
- How will real usage data be captured and fed back into synthetic personas and decision traces?  
- Which failures become permanent **stress scenarios**?  
- What would make us **kill** the current hypothesis cleanly?  
- Do we have **proof markers** that unlock the growth pack, or are we still in hold-scale?  
- What is the **one** primary channel hypothesis for the next growth round, and what outcome threshold kills it?  
- If that channel is public writing: is the message one lived insight, or a content calendar?
- Is **Ready for human eyes** green before we ask mentors or users to try a product link?  
- What blockers (iframe, auth, JS, private URL) still kill the cold happy path?

---

## What This System Explicitly Avoids

- Treating a polished deck or long roadmap as proof  
- Building a platform before a single complete user loop works  
- Protecting a favorite customer group when scores are weak  
- Treating simulated prices or “I would buy” lines as demand  
- Treating “if we had this feature” scores as proof the product already works  
- Treating a green synthetic product sandbox as demand or product–market fit  
- Treating waitlist size alone as willingness to pay  
- Building a huge multi-role simulated world before a thin baseline path works  
- Scaling paid ads while the thin path fails sandbox runs  
- Optimizing operational scores while ignoring a weak hypothesis  
- Letting AI silently change strategy or phase  
- Defaulting to **Dangerous** autonomy (no pauses) just to “move faster”  
- Building without an evaluation harness or numeric gate  
- Copying another startup’s product because their OS docs lived in the same monorepo  
- Expanding channels or multi-agent complexity before the thin slice works  
- Fake org charts (generic bot labels, empty roles with no outputs or human gates)  
- A roster of named bots treated as staff (Prospecting Bot, Forecasting Bot, one agent per account)  
- Overnight prospecting or message-batch machinery before proof  
- Skipping weekly snapshot and stage 7 while claiming the company OS is “running”  
- Letting “Where are we?” see only git while the week’s conversations live only in chat  
- Silently rewriting this template every time one product ships a feature  
- Moving sand: renaming clocks, restacking the loop, or dropping a gate so last month’s snapshot no longer maps  
- Running multi-channel growth machinery before proof of value or payment  
- Treating opens, total replies, list size, or follower count as growth success  
- A daily personal-brand machine, or AI insight spray, as a substitute for a lived observation  
- AI personalization on an unproven audience as a substitute for offer/channel fit  
- Asking mentors or users to “try it” before **Ready for human eyes** is green  
- Treating “works on my machine / in my chat” as ready for external feedback  
- Treating green human-eyes as demand or product–market fit  
- Marketing volume as proof — see [marketing volume cannot promote](#house-rule-marketing-volume-cannot-promote)  
- A security or compliance program as proof — see [a security program cannot promote](#house-rule-a-security-program-cannot-promote)  
- A handful survey as optimal price, a CAC/LTV model at 0→1 as proof, or last decade's SaaS playbook as the aim — see [there is no optimal price until people have paid and stayed](#house-rule-there-is-no-optimal-price-until-people-have-paid-and-stayed)  
- Automating the playbook, or an agent team to skip a step with no named owner — see [do not automate a step that should not exist](#house-rule-do-not-automate-a-step-that-should-not-exist)  
- Cap table, SAFE, or lawyer emails as proof the product works — see [legal paper cannot promote](#house-rule-legal-paper-cannot-promote)  
- An advisor says stay exclusive, then a prospect asks to pay, and the founder delays them — see [advisor ride-along is assumed, not observed](#house-rule-advisor-ride-along-is-assumed-not-observed)  
- Free work for a company after the first conversation — see [unpaid weeks cannot promote](#house-rule-unpaid-weeks-cannot-promote)
- Commissioning custom legal agreements before revenue — see [starter legal templates](#starter-legal-templates)

---

## Resources

### Starter legal templates

Do not commission custom paper before revenue. Point at these starting drafts. Hyperlink only.

- [General Legal library](https://general.legal/library)
- [General Legal templates](https://github.com/General-Legal/legal-templates)

- Templates, not advice. Not a substitute for counsel.
- Use the .docx, not the markdown.
- NDA, terms, US privacy: fine starting drafts.
- Do not hand the MSA unless they are that kind of on-prem AI vendor.
- Do not use BAA/GDPR as a reason to stall before a paying customer.
- Formation, SAFE, hiring, CIIAA: [Cooley GO](https://www.cooleygo.com/documents/), [YC](https://www.ycombinator.com/documents/), [Orrick](https://www.orrick.com/en/tech-studio/forms) — not the General Legal repo.
- This OS does not host copies, draft, or customize.

### Cap-table modeler

Hyperlink only. This OS does not host copies.

- [Startup finance](https://startup-finance.1984.vc/)
- [1984vc cap-table](https://github.com/1984vc/cap-table)

- Companion, not a second modeler — what % does this one SAFE sell?: [YC SAFE calculator](https://www.ycombinator.com/safe/calculator).
- Agent path is CLI/skill only: `npx skills add 1984vc/cap-table` then `npx @1984vc/cap-table`.
- Educational modeler, not legal or tax advice.
- Not the official cap table of record (Carta / Pulley / counsel later).
- For founders who have SAFEs or a priced-round term sheet. One upcoming financing.
- Pro-rata not modeled. No prefs/waterfall.
- If an AI models ownership, point it at that repo so the math is tested.

### After-proof efficiency (fences)

Not a house rule. Not Day 0. Hyperlink only.

Open only if they chose fences, they have proof, and they asked about efficiency or an exit: [`after-proof-efficiency.md`](after-proof-efficiency.md). Otherwise two clocks.

---

## Sources (vintage)

Accuracy numbers perish with the model checkpoint. Mechanism findings last until the **same task** is re-run on a current model. “Models got better” is not enough to drop them. House rules do not expire on a checkpoint.

**Load-bearing for a hard rule** (date, model/task as published):

- Bisbee et al., 2024, *Political Analysis*. Task: silicon sampling / prompt variance and drift. Finding: too-tight variance and same-prompt drift make a pass unusable.
- Brand, Israeli, and Ngwe, HBS 23-062 rev. 2026, §3.3. Task: willingness-to-pay and cross-category fine-tune (laptop → tablet). Finding: direct dollar WTP from GPT was useless; fine-tune failed on a new category. They still used conjoint with prices in the profile and reported $. They did not write “never produce a dollar” or “one condition change.”

Everything else in the research method is adjacent literature or a **house rule**. House rules (epistemology, not a paper): observed wins a clash; a spoken yes cannot promote; do not seed from a demographic one-liner (demo-only role-play is the weak case); several ideas are allowed (each its own board; do not hide a second idea to look focused); [marketing volume cannot promote](#house-rule-marketing-volume-cannot-promote); [a security program cannot promote](#house-rule-a-security-program-cannot-promote); [there is no optimal price until people have paid and stayed](#house-rule-there-is-no-optimal-price-until-people-have-paid-and-stayed); [do not automate a step that should not exist](#house-rule-do-not-automate-a-step-that-should-not-exist); [legal paper cannot promote](#house-rule-legal-paper-cannot-promote); [advisor ride-along is assumed, not observed](#house-rule-advisor-ride-along-is-assumed-not-observed); [unpaid weeks cannot promote](#house-rule-unpaid-weeks-cannot-promote).

## Changelog (high level)

| Version | Notes |
|---------|--------|
| 1.9 | Draft used in mentoring conversations |
| 2.0 | Isolated as portable blueprint; product hypothesis moved to application example; mentee/AI extraction rules; solo-vs-add test; company-as-code layout |
| 2.1 | Live runtime: persistent state + 7-stage continuous loop; two clocks (journey vs loop); framework-agnostic compute (LangGraph/CrewAI as examples) — see `live-runtime.md` |
| 2.2 | Reward/risk ICP scorecards; learning-loop feedback into personas/agents; company-as-code categories; portable multi-agent + channel principles; eval harness continuity (see live-runtime); refined score groups; monetization interjection |
| 2.3 | Enhance-only recovery from earlier drafts: formal lifecycle aliases; EDD loop; AGENTS.md thin enforcement; structured phase gates; TTR / channel distribution / early-revenue metrics; thin-slice artifact checklist; autonomy interjection; optional company/support/infrastructure leaves; template change policy pointer |
| 2.4 | Evidence labels (outside facts / company signals / assumed capability / needs real-world proof); staged trust reveal; market “supports vs does not establish”; optional “what to say” fields on scorecards; virtual office cards + hire triggers; plain-language pass on ranking section |
| 2.5 | Next pack after synthetic ranking: light isolated synthetic product sandbox (capability/feasibility under multi-party mess) + real interest tests; parallel/sequence rules; founder gate before heavy build |
| 2.6 | Autonomy postures (Strict / Auto / Dangerous); standing deny list (always on); learning rituals (weekly snapshot, stage 7, scoreboard glance, coordination-tax check) |
| 2.7 | After proof: growth pack (entry gate; message/channel experiment tracks; outcome metrics; founder promote/kill/hold; growth/ artifacts). Phase 9 pointer. No new phase; no channel-tooling folklore. |
| 2.8 | **Ready for human eyes** ship gate before external product feedback; cold URL + happy path + console/iframe/auth evidence; fail-closed ask-for-feedback; sandbox browser / NL synthetic user as vehicle (not founder CS homework); state field + checklist. |
| 2.8.1 | Evidence labels stated / synthetic / observed; forced-choice + one condition change; no Likert/dollar from sims; optional Grok Build workflows (path 2). |
| 2.8.2 | Honesty pass: label observed-wins / spoken-yes-cannot-promote as house epistemology; qualify naked dollar/Likert (mapped $ after a choice is allowed); short sources note (Bisbee 2024 + Brand 2026 §3.3 load-bearing only). |
| 2.8.3 | House rule: do not seed a persona from a demographic one-liner; demo-only role-play is the weak case (sharpening of thesis-only-is-weaker). |
| 2.8.4 | Additive only. Stability contract (additive, optional-until-useful, rarely breaking). Founder-day pack and skill-capture sit beside existing rituals. Virtual-office cards stay; partner may call jobs for a card. Day tools may feed the snapshot; git remains memory. Growth pack: overnight drafts after proof; insight quality before posting cadence (one lived observation, short — not a content calendar). No clocks, gates, or deny-list items removed. |
| 2.8.5 | House rule: several ideas are allowed; each is its own thesis/instance/scorecard; do not hide a second idea to look focused; rank and kill per board. |
| 2.8.6 | House rule: [marketing volume cannot promote](#house-rule-marketing-volume-cannot-promote). Writing: [Say it once. Link. No filler.](#how-this-os-may-change-stability-contract). Resource pointers (not house rules): [starter legal templates](#starter-legal-templates); [cap-table modeler](#cap-table-modeler). |
| 2.8.7 | House rule: [a security program cannot promote](#house-rule-a-security-program-cannot-promote). Same family as 2.8.6; do not merge. Writing: [Say it once. Link. No filler.](#how-this-os-may-change-stability-contract). Resource pointer (not a house rule): preview plugin [`plugin/`](../plugin/) — skills hyperlink this pack; hosted MCP is a read adapter only, not mentee-ready boards, not a marketplace. |
| 2.8.8 | House rule: [there is no optimal price until people have paid and stayed](#house-rule-there-is-no-optimal-price-until-people-have-paid-and-stayed). Same family as 2.8.6 / 2.8.7; do not merge. SaaS 1.0 playbooks may be outdated; stay current; do not guide to where the puck has been. Day 0 / Path 1 question (not a house rule; not a third clock): [lifestyle or swinging for the fences](#day-0-lifestyle-or-swinging-for-the-fences). Writing: [Say it once. Link. No filler.](#how-this-os-may-change-stability-contract). |
| 2.8.9 | House rule: [do not automate a step that should not exist](#house-rule-do-not-automate-a-step-that-should-not-exist). Same family as 2.8.6 / 2.8.7 / 2.8.8; do not merge. Every requirement has a person's name. Delete the step before you simplify it. Automate last. An agent team is automation. Name the one bottleneck this week and work that. Several ideas may attack that same bottleneck. [Several ideas are allowed](#core-beliefs) (2.8.5) still stands. Not Day 0 homework. Not a third clock. Not an accelerate or optimize law. Writing: [Say it once. Link. No filler.](#how-this-os-may-change-stability-contract). |
| 2.8.10 | House rule: [legal paper cannot promote](#house-rule-legal-paper-cannot-promote). Same family as 2.8.6 / 2.8.7 / 2.8.8 / 2.8.9; do not merge. Cap table, SAFE, and lawyer emails do not prove the product works. Writing: [Say it once. Link. No filler.](#how-this-os-may-change-stability-contract). |
| 2.8.11 | House rule: [advisor ride-along is assumed, not observed](#house-rule-advisor-ride-along-is-assumed-not-observed). Same family as 2.8.6–2.8.10; do not merge. An advisor's opinion is a tip, not proof. Write down who said it. Do not delay a paying customer. Writing: [Say it once. Link. No filler.](#how-this-os-may-change-stability-contract). |
| 2.8.12 | Additive pack: [founder checkpoints](#founder-checkpoints-when-human-judgment-is-the-work) (QC, Bind, Clock, Alpha). Optional until useful. Absent checkpoints = 2.8.9 behavior. QC Hold is path-local; it does not freeze the journey. Alpha is a written five-field bet against the default recommendation. Founder-facing speech uses the [plain lines](#how-to-say-this); desk labels stay in traces. No tenth phase. No third clock. No schema bump. Writing: [Say it once. Link. No filler.](#how-this-os-may-change-stability-contract). |
| 2.8.13 | House rule: [unpaid weeks cannot promote](#house-rule-unpaid-weeks-cannot-promote). Same family as 2.8.6–2.8.11; do not merge. First conversation is free. Next working session is paid or you stop. Customer type lives on the existing group card (consumer / small business / mid-market / enterprise) with a follow-up cue (listed price / BANT / MEDDIC / MEDDPICC). A long buying cycle is not free custom work. Not Day 0. Not a tenth phase. Not a sales course. Writing: [Say it once. Link. No filler.](#how-this-os-may-change-stability-contract). |
| 2.8.14 | Additive: [Decision methods](#decision-methods-aliases-not-a-third-clock) (IESER for this week’s company move; FIRAC for Bind-class paper). Aliases, not a third clock. Not a house rule. Not a phase rename. No schema bump. Speaking rule: lead with descriptive labels; numbers in parentheses. Writing: [Say it once. Link. No filler.](#how-this-os-may-change-stability-contract). |

---

*AI tools change fast. Principles last longer.*  
*Goal: help a solo founder use AI to move faster than ever while staying honest, in control, and unwilling to protect weak ideas.*

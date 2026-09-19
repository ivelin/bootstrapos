# First hour (Day 0)

Day 0 is **~60 minutes**. Official slices: thesis ~20, at least three customer groups ~25, first “Where are we?” ~15.

This hour: write the thesis, name at least three customer groups, and produce one honest “Where are we?”  
**Do not build product in this hour.**

Path 1 is chat plus a weekly “Where are we?” ritual. You do **not** need to copy files first. Point an AI at the Bootstrap OS and do this in chat. Paths below are for when you have instantiated a blank instance in your company repo.

The **two-minute** figure is how long a good “Where are we?” answer takes to **read**. It is not this hour.

Full constitution: [`operating-system.md`](https://github.com/ivelin/bootstrap/blob/main/company-os/operating-system.md) · live loop: [`live-runtime.md`](https://github.com/ivelin/bootstrap/blob/main/company-os/live-runtime.md).  
Hard rules: [`ai-instructions.md`](https://github.com/ivelin/bootstrap/blob/main/company-os/ai-instructions.md). If you instantiated, they should already be in `AGENTS.md`.

---

## 1. Write the thesis (~20 minutes)

Write it in the chat (or any note you keep). If you instantiated, also edit `docs/company-os/instance/thesis.md` and put the one-sentence line into `docs/company-os/applied-here.md` and `company/state/company-state.json`.

You need:

1. **Who** you might help (candidates — not a locked primary yet)
2. **What pain**
3. **How** you help (one sentence)
4. **Why now / why you**
5. **Contrarian edge** — what others undervalue
6. The label: **this is a hypothesis subject to evidence**
7. **What would kill or demote** this thesis

If you cannot write a kill line, you are already protecting the idea.

> Lifestyle / small good business for about ten years, or swinging for the fences? Say it now so you do not grind three years on a popcorn stand.

[Day 0: lifestyle or swinging for the fences](https://github.com/ivelin/bootstrap/blob/main/company-os/operating-system.md#day-0-lifestyle-or-swinging-for-the-fences).

If you have **more than one idea**, write each as its own thesis. Do not fold the second into the first to look focused. Rank and kill per board. Path 1 (chat) is enough for one idea; optional path 3 (local MCP) keeps several ideas isolated.

---

## 2. At least three customer groups (~25 minutes)

Name at least three groups in chat and write a **reward/risk** note for each. If you instantiated, copy `research/icps/TEMPLATE.md` to `research/icps/icp-01.md`, `icp-02.md`, `icp-03.md` (rename the titles) and fill a scorecard for each.

- Rank is **test priority**, not “we will sell to all three.”
- **Promote = hold** until synthetic **and** observed evidence exist (weigh stated / synthetic / observed; house rule: observed wins a clash) plus a manageable scorecard.
- Do not turn three research groups into three go-to-market motions.
- Seed each group from whatever is **outside the pitch**, even if thin. No customers yet is normal: use **legal** adjacent traces (public forums, reviews of the substitute or a competitor, the founder’s own prior-domain notes with no PII). Do not take a former employer’s private list. Do not import another company’s ICP. If truly none, write **none yet** — a thesis-only persona is weaker, not forbidden. House rule: do not seed a persona from a demographic one-liner. Seed from traces of what they already do, pay for, or said in public. Demo-only role-play is the weak case.
- Same **forced choice** for all three, in the order they would decide, then change **one** condition (price, time, or current alternative). Write down what they **say** too (pain, substitute, objection). That is **stated** evidence — useful, not proof.
- Do not ask the sim a 1–5 or a naked dollar WTP — a choice or a sentence, then map. Mapping may still produce a dollar figure.
- Weigh stated, synthetic, and observed. A spoken yes is a clue. House rule: when they disagree, **observed** wins. Synthetic may **rank or kill**. Promote stays hold until someone spends **time or money**. If the sim is too uniform or drifted versus a few real people, do not trust the rank. New-category / none-yet is the weak case.

Then list the three (name only + rank) in the same place as the thesis — chat is enough; if you instantiated, also `docs/company-os/applied-here.md` and `docs/company-os/instance/thesis.md`.

---

## 3. First “Where are we?” (~15 minutes)

Ask your AI: **“Where are we?”**  
A good answer is a company snapshot you can **read in about two minutes**, not a dump. Writing that first snapshot is this ~15-minute slice. The two-minute figure is the read, not Day 0.

If you instantiated, also copy `docs/company-os/instance/snapshots/TEMPLATE.md` to `docs/company-os/instance/snapshots/YYYY-MM-DD.md` and fill it in everyday words. Optional machine read (does **not** replace the dated snapshot):

```text
python3 company/state/where-are-we.py
```

That read uses `company/state/company-state.json` (and its schema).

On Day 0 you should hear something like: **Write the bet**, **Ask**, gate open, autonomy **Strict**, Ready for human eyes **unknown**, three groups on **hold**, no proof.

---

## Done when

- [ ] Thesis written and labeled a hypothesis
- [ ] ≥3 customer groups with reward/risk notes (chat is enough; `research/icps/` if instantiated)
- [ ] One “Where are we?” (chat is enough; dated snapshot file if instantiated)
- [ ] Your AI is following the Bootstrap OS hard rules (pointed at this pack, or pasted into `AGENTS.md`)
- [ ] You did **not** import another founder’s market, ICP list, or roadmap

**Not** done: a deck, a repo full of features, or a favorite customer declared “the one.”

---

## After this hour

### Standing rules

Not another Day 0 checkbox. This hour stays thesis, ≥3 groups, one snapshot.

After First Hour, query the published OS on GitHub, [install-os](https://pirin.ai/install-os), or local. Free Path 1 does not use a hosted MCP connector. Invite-only collab / Grok / whoami: `https://mcp.bootstrap.pirin.ai/mcp` ([hosted identity](https://github.com/ivelin/bootstrap/blob/main/mcp/docs/HOSTED_IDENTITY.md)).

Do **not** upload mentee work to Ivelin's GitHub.

Path 1 is still `https://github.com/ivelin/bootstrap` as the free install source. Team Import from Repo is optional. Invite-only collab uses that MCP pin. **Not** a public catalog submit. **Not** mentee boards on our host. **Not** a Grok Bot marketplace bot.

Follow the [near-term checklist](https://github.com/ivelin/bootstrap/blob/main/company-os/operating-system.md#near-term-checklist-any-startup). Next real work is usually honest research across those groups — not a platform.

Once real conversations start (later — not this hour), use the [founder-day pack](https://github.com/ivelin/bootstrap/blob/main/company-os/operating-system.md#founder-day-pack-how-the-week-actually-runs): prep, close the call, write up. Do not add those rituals to Day 0.

If you already have a product URL and want a mentor or stranger to click it, that is a **later** gate ([portable rules](https://github.com/ivelin/bootstrap/blob/main/company-os/ready-for-human-eyes.md)). If you instantiated, fill `product/READY_FOR_HUMAN_EYES.md`. Green eyes ≠ demand.

When someone says you need marketing to prove the product, or to attract people who might buy:

> I don't need marketing to attract people who might buy. I need a cold URL that works and one path to people who already have this job. Eyeballs aren't buyers.

House rule: [marketing volume cannot promote](https://github.com/ivelin/bootstrap/blob/main/company-os/operating-system.md#house-rule-marketing-volume-cannot-promote).

When someone says you must lock down the product so secrets do not leak, before anyone has used it:

> I don't need a security department before anyone uses this. I need keys out of git and no live user data in chats. Idea theft by a lab is not how this dies.

House rule: [a security program cannot promote](https://github.com/ivelin/bootstrap/blob/main/company-os/operating-system.md#house-rule-a-security-program-cannot-promote).

When someone says you must find the optimal price from a handful of users, before anyone has paid and stayed:

> There is no optimal price until people have paid and stayed. A survey of a handful will lie. Start with one price.

House rule: [there is no optimal price until people have paid and stayed](https://github.com/ivelin/bootstrap/blob/main/company-os/operating-system.md#house-rule-there-is-no-optimal-price-until-people-have-paid-and-stayed).

When someone says you must automate the playbook, or add an agent team to skip a step that has no named owner:

> I don't automate a step that should not exist. Name the person first, or delete it. An agent team is automation. Name the one bottleneck this week and work that. Several ideas may attack that same bottleneck.

House rule: [do not automate a step that should not exist](https://github.com/ivelin/bootstrap/blob/main/company-os/operating-system.md#house-rule-do-not-automate-a-step-that-should-not-exist).

When someone names a new landing page as the bottleneck, and no one has talked to customers:

> That is a fun side quest dressed as the bottleneck. Challenge it. Founder may override in writing.

House rule: [do not automate a step that should not exist](https://github.com/ivelin/bootstrap/blob/main/company-os/operating-system.md#house-rule-do-not-automate-a-step-that-should-not-exist).

When someone treats a signed SAFE, a clean cap table, or a lawyer email as proof the product works:

> Legal paper cannot promote. File it on the side. Get one stranger through the happy path this week.

House rule: [legal paper cannot promote](https://github.com/ivelin/bootstrap/blob/main/company-os/operating-system.md#house-rule-legal-paper-cannot-promote).

When someone treats an advisor's promise of exclusivity or an Office Hours tip as proof customers will pay:

> An advisor's opinion is a tip, not proof customers will pay. Write down who said it. Do not delay a customer who wants to pay.

House rule: [advisor ride-along is assumed, not observed](https://github.com/ivelin/bootstrap/blob/main/company-os/operating-system.md#house-rule-advisor-ride-along-is-assumed-not-observed).

When a company or person asks for more work after the first conversation, and they have not paid for that next session:

> The first conversation is free. The next working session is paid, or you stop. A long buying cycle is not a reason to keep working for free.

House rule: [unpaid weeks cannot promote](https://github.com/ivelin/bootstrap/blob/main/company-os/operating-system.md#house-rule-unpaid-weeks-cannot-promote).

### SoR / buy vs build / advice (not this hour)

Not Day 0 homework. The hour stays thesis, ≥3 groups, one snapshot.

**SoR index** — living list of where the real copy lives. Append, do not silently rewrite. Four starters: live site; main git repo; one working folder; where leads live.

If they ask where the company lives, or they instantiate: if the git URL is unknown, finding it is the first chore. Until then chat is enough. Do not start this chore from an advice pile or a CRM ask.

Play list: new tools and agents are allowed. Play may not hold customer or company truth. A tool joins SoR only on observed use (it actually became the record), not a demo or a vendor story.

Chat is enough. If you instantiated, write the list in `docs/company-os/applied-here.md`.

**Buy vs build, 0-1 default.** Do not buy a new category. Do not spend a week evaluating one. Exceptions (commodity you already need): domain, email, git host, payments, the AI harness. Not exceptions: CRM, lead-gen suites, a second workspace.

**Advice filter.** When a mentor, investor, or seminar says do X: what evidence would make this true for **this company this week**? Does it change SoR, or is it Play? Does it buy a category or spread data? Does it advance a journey phase without observed proof? Are they optimizing for their fund (fences) or the founder’s stated Day 0 (lifestyle vs fences)? If it fails: keep the weekly snapshot. Do not add a tool.

When a path is not ready for a real person, or you want to go against the usual advice:

> Hold that path and write a better test. Other work can continue. If I am betting against the usual advice, I write the claim, the date, what would prove me wrong, and how much I will spend to learn.

[Founder checkpoints](https://github.com/ivelin/bootstrap/blob/main/company-os/operating-system.md#founder-checkpoints-when-human-judgment-is-the-work). Optional until you have the situation. Not this hour. A founder checkpoint, not a new clock. Talk in the founder's words. Desk labels stay in the notes.

---

*You supply the insight. AI supplies the speed.*

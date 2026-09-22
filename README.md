# Bootstrap OS

**Portable company operating system for solo founders in the 0→1 journey.**

Not the Bootstrap CSS / UI framework ([getbootstrap.com](https://getbootstrap.com)). This repo is process and control for a company: two clocks, founder gates, honest evidence.

Use this repo as the **source of truth** for process and control. Point your AI here and apply what fits *your* startup. Instantiate blank files in *your* product repo only when you want them — fill only *your* thesis, customer groups, scores, and open questions.

| | |
|--|--|
| **Version** | Blueprint + live runtime **v2.8.19** · optional local MCP **v0.2** (path 3) |
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
  founder gates + honest evidence        weekly quality bar → Write back → Ask again
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
| [`company-os/live-runtime.md`](company-os/live-runtime.md) | **Live OS shape** — durable state + three-week loop + eval harness ideas |
| [`company-os/ready-for-human-eyes.md`](company-os/ready-for-human-eyes.md) | **Ship gate checklist** — cold URL + happy path before external product-test asks |
| [`company-os/ai-instructions.md`](company-os/ai-instructions.md) | Thin enforcement layer — paste into `AGENTS.md` / Cursor / Claude / Grok |
| [`company-os/first-hour.md`](company-os/first-hour.md) | **Day 0 (~60 minutes)** — thesis, ≥3 ICPs, first “Where are we?” (chat or instance files). The two-minute figure is the snapshot *read*, not this hour. |
| [`company-os/clock-examples.md`](company-os/clock-examples.md) | **Teaching 5 × 3** — fictional household jobs only. Not a live board. |
| [`templates/`](templates/) | Blank files to copy into *your* company repo when you instantiate |
| [`examples/`](examples/) | Pointers to public live instances (illustration only) |
| [`.grok/workflows/`](.grok/workflows/) | Optional Grok Build workflows (path 2) — company-operating-loop, user-research, ready-for-human-eyes |
| [`mcp/`](mcp/) | **Optional path 3** — local MCP adapter (one connector, isolated instances). Not a second OS. HTTP read transport is preview only. |
| [`plugin/`](plugin/) | **Preview** Cursor/Grok Agent Plugin — skills hyperlink this pack. Team Import from Repo only — not a public catalog submit. |

This repo is **template only**. Filled company state never lives here.

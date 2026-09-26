---
name: Bootstrap board status visualization
description: >-
  Use for every where-are-we / company board card — locked table
  Work|State|When|Who; spoken label customer bet (schema customer_check); live
  get_journey first; no invent.
---
Use for every “where are we with COMPANY” and every “company board card” request. Locked 2026-09-22 — do not weaken; do not invent a second format.

## Source of truth

1. Live `get_journey` / `initiatives[]` for that company first. SoR (Gmail / Drive / Calendar) only to fill **Who** / **When** when the board is silent. Do not invent rows.
2. Spoken voice: start at Bottleneck #1 in the company’s language. Hide unless asked (“show clocks” / “show schema”): OS version, journey integers, loop labels, autonomy, Ready-for-human-eyes, “NDA is not Try”, kind slugs, idea slugs. Keep those rules internal.
3. Company = team. Idea = one customer bet. Never print the storage slug `default` as a node. Nested engagements are children of that bet (`parentId`). Capital / legal / advisor = Footer. Paper cannot promote.

## Spoken label: customer bet

Founder-facing name for schema kind `customer_check` is **customer bet**. When a heading is shown, use **CUSTOMER BETS** (or table section **Bet**). Do not say “customer check” to founders. Do not rename the stored enum. Do not treat it as a checkbox or a to-do next to an account. Accounts nest under the customer bet. WIP still 1 on that kind until paid use.

## Format (copy this shape)

Title line: **Company** — one-sentence bet. Optional second short constraint in company words.

Then one markdown table with exactly four columns: `Work | State | When | Who`

Hierarchy lives inside the Work cell. Do not use a separate first column for arrows or dots (it wraps and breaks the tree).

Rows:

- A section row **Bet** (or **Bet: NAME** when two live ideas exist)
- `🟢 P0 <bottleneck title>` | ACTIVE | this week | owner
- Child engagements indented with leading `· · ` then their own dot
- If two live ideas: a second **Bet:** block, same pattern
- A section row **Footer**
- Footer rows with 💵 capital, 📄 advisor/FAST, ⚖️ legal, ⚪ closed
- If an idea is killed: section **Killed** with 🔴

Dots (locked):

- 🟢 open / in play (active work, not an all-clear)
- 🟡 next but blocked, or waiting on a parent / confirm
- ⚪ parked, proposed, or closed
- 🔴 fail, overdue kill line, or killed idea

Do not use blue or red for “active.”

After the table, one legend line. Then **Next:** one sentence naming the human and the P0 move.

Who column: short names only. Split send vs approve only when both are real.

## Anti

- No mermaid, no Gantt, no BPMN, no side-by-side schema diagrams unless the founder asks for schema.
- No “idea default” folder.
- Do not Advance, Hold-write, email, or create a new idea as part of rendering the card.
- If several companies are asked, one card each, same format.
- No board writes from this skill.

## Internal (never print)

Paper cannot promote; NDA ≠ Try; Ask/Do is not a card; unpaid weeks cannot promote; no invented Impact/Evidence/Leverage. Schema kind remains `customer_check`.

---
name: Bootstrap board status visualization
description: >-
  Use for every where-are-we / company board card: a bold biggest-problem
  headline, then one plain-words table. Live get_journey first; never invent.
---
Use for every “where are we with COMPANY” and every “company board card” request, for every founder. Locked 2026-10-02. If a reader has to ask what a word means, rewrite it. Do not invent a second format.

## Source of truth

1. Read the live `get_journey` / `initiatives[]` first. Use the system of record only to fill in who and when where the board is silent. Never invent rows, moves, owners, or dates.
2. Write in the company's own words. Unless the reader asks (“show clocks” / “show schema”), hide the OS version, journey integers, loop labels, autonomy, Ready-for-human-eyes, kind slugs, idea slugs, and the storage slug `default`.
3. Describe each try as the plain thing being tried ("Get one plant to hire alpha"). The stored kind stays `customer_check`.
4. Plain words for any average person. Do not write P0, GC/PM, FAST, SOPA, engagement, or customer bet. Say what they mean.
5. The headline names the company's biggest problem in terms of what it sells and who buys it. Do not use a compressed phrase when a plain sentence will do.
6. Column headers are exactly `What we're working on | Where it stands | What happens next | Who`.
7. The first time a person or company name appears, say who they are ("bravo, a plant").

## Card shape

1. **Headline (always first, bold).** `**<Company>'s biggest problem right now: <the plain fact that is stuck>.**` Then `To fix it, <who does what next>.` The reader should know the problem from this line alone.
2. **One table** in this order:
   - The stuck try first. Use 🟢 and **bold** the work text. Its “what happens next” cell says what done looks like.
   - Nested rows and follow-on tries, indented with `· ·` per level. The dot stays in the work cell, not its own column.
   - Other live tries.
   - Past tries (⚪ closed, 🔴 killed).
   - Background items (money 💵, advisor paperwork 📄, legal ⚖️, filings).
3. **One italic legend, last:** `*🟢 working on it now · 🟡 waiting · ⚪ stopped or not started · 🔴 killed*`

There is no trailing Next line.

Fixture shape (alpha / bravo / founder@example.test only):

**alpha's biggest problem right now: no plant has hired alpha to run dispatch yet.**
To fix it, founder@example.test, the founder, talks with bravo plant this week.

| What we're working on | Where it stands | What happens next | Who |
|---|---|---|---|
| 🟢 **Get one plant to hire alpha for dispatch** | Talks started, no yes yet | Done when one plant pays for a weekly report | founder@example.test, the founder |
| · · bravo plant | 🟡 Asked, no answer yet | Call them | founder@example.test, the founder |
| ⚪ A page where plants sign up themselves | Stopped | Plants would not fill in the form | — |
| ⚖️ Register alpha to do business | Not filed yet | File the form | founder@example.test, the founder |

*🟢 working on it now · 🟡 waiting · ⚪ stopped or not started · 🔴 killed*

## Dots

- 🟢 working on it now
- 🟡 waiting
- ⚪ stopped or not started
- 🔴 killed

## Anti

- Never put the biggest problem anywhere but the first line.
- No mermaid, Gantt, or schema diagrams unless asked.
- This skill makes no board writes.
- If several companies are asked about, give one card each, in this shape.

## Internal (never print)

Paper cannot promote. A confidentiality promise is not proof someone used the product. Ask/Do is not a card. Unpaid weeks cannot promote. Never invent Impact/Evidence/Leverage. The stored kind stays `customer_check`.

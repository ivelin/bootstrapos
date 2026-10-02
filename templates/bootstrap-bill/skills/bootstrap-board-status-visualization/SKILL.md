---
name: Bootstrap board status visualization
description: >-
  Use for every where-are-we / company board card: a bold company name, what it
  sells and to whom, the goal, then one table. Live get_journey first; never invent.
---
Use for every “where are we with COMPANY” and every “company board card” request, for every founder. Locked 2026-10-02 at 4:55 PM CT. If a reader has to ask what a word means, rewrite it. Do not invent a second format.

## Source of truth

1. Read the live `get_journey` / `initiatives[]` first. Use the system of record only to fill in who and when where the board is silent. Never invent rows, moves, owners, or dates.
2. Write in the company's own words. Unless the reader asks (“show clocks” / “show schema”), hide the OS version, journey integers, loop labels, autonomy, Ready-for-human-eyes, kind slugs, idea slugs, and the storage slug `default`.
3. Describe each try as the plain thing being tried ("Get one plant to hire alpha"). The stored kind stays `customer_check`.
4. Plain words for any average person. Do not write P0, GC/PM, FAST, SOPA, SAFE, Apollo, MLS, tenancy, engagement, or customer bet. Say advisor agreement, stock option paperwork, and investment.
5. The first line is the bold company name, then one plain sentence on what it sells and to whom, plus the goal.
6. Column headers are exactly `Work | State | When | Who`.
7. The first time a person or company name appears, say who they are ("bravo, a plant we're talking with").

## Card shape

1. **Title (always first).** `**<Company>**: <what it sells and to whom>. The goal is <goal>.`
2. **One table** with bold section rows, in this order. Other cells on a section row stay empty. Omit a section that has no rows, except Bet.
   - **Bet**. The top row starts with 🎯 plus a fitting icon and a **bold** title. Nested rows indent with `· ·` and start with their own icon.
   - **Other paths (not the main bet)** when another live try exists.
   - **Past bets**.
   - **Background** (money 💵, advisor agreement 📄, legal ⚖️).
3. The status dot sits at the start of the State cell: 🟢 working on it, 🟡 waiting, 🔴 dropped, ⚪ closed.
4. **Legend, then Next.** `*🎯 the one thing that matters most · 🟢 working on it · 🟡 waiting · 🔴 dropped · ⚪ closed*` then `**Next:**` one plain sentence on who does what next.

Fixture shape (alpha / bravo / charlie / founder@example.test only):

**alpha**: alpha sells dispatch help to plants that already pay for it. The goal is one plant paying for a weekly report.

| Work | State | When | Who |
|---|---|---|---|
| **Bet** | | | |
| 🎯 🤝 **Get one plant to pay alpha for a weekly dispatch report** | 🟢 No plant has paid yet | Talk with bravo this week | founder@example.test, the founder |
| · · 🏢 bravo, a plant we're talking with | 🟢 Asked, time not set | Book the call | founder@example.test |
| **Other paths (not the main bet)** | | | |
| 🤝 charlie, a company we're talking with, might license the notes | 🟡 Parked | Reopen only if they come back | — |
| **Past bets** | | | |
| 🔎 A page where plants sign up themselves | ⚪ Plants would not fill in the form | — | — |
| **Background** | | | |
| 💵 An investment, not yet signed | 🟡 Unsigned | — | — |
| 📄 Advisor agreement | 🟡 Stock option paperwork not set up yet | — | — |

*🎯 the one thing that matters most · 🟢 working on it · 🟡 waiting · 🔴 dropped · ⚪ closed*

**Next:** founder@example.test, the founder, talks with bravo this week.

## Dots

- 🎯 the one thing that matters most
- 🟢 working on it
- 🟡 waiting
- 🔴 dropped
- ⚪ closed

## Anti

- Never put the goal anywhere but the first line and the Next line.
- No mermaid, Gantt, or schema diagrams unless asked.
- This skill makes no board writes.
- If several companies are asked about, give one card each, in this shape.

## Internal (never print)

Paper cannot promote. A confidentiality promise is not proof someone used the product. Ask/Do is not a card. Unpaid weeks cannot promote. Never invent Impact/Evidence/Leverage. The stored kind stays `customer_check`.

---
name: Bootstrap board status visualization
description: >-
  Use for every where-are-we / company board card: a bold company name, a
  founder line, one sentence on what it sells and to whom, then one table.
  Live get_journey first; never invent.
---
Use for every “where are we with COMPANY” and every “company board card” request, for every founder. Locked 2026-10-02 at 4:55 PM CT. If a reader has to ask what a word means, rewrite it. Do not invent a second format.

## Source of truth

1. Read the live `get_journey` / `initiatives[]` first. Use the system of record only to fill in who and when where the board is silent. Never invent rows, moves, owners, or dates.
2. Write in the company's own words. Unless the reader asks (“show clocks” / “show schema”), hide the OS version, journey integers, loop labels, autonomy, Ready-for-human-eyes, kind slugs, idea slugs, and the storage slug `default`.
3. Describe each try as the plain thing being tried ("Get one plant to hire alpha"). The stored kind stays `customer_check`.
4. Plain words for any average person. Do not write P0, FAST, SOPA, SAFE, engagement, or customer bet. Say advisor agreement, stock option paperwork, and investment. Short names the founder wrote stay as written.
5. The first line is the bold company name. Then a founder line when a display name is on the board. Then one plain sentence on what it sells and to whom.
6. Column headers are exactly `Work | State | When | Who`.
7. The first time a person or company name appears, say who they are ("bravo, a plant we're talking with").

## Card shape

1. **Title (always first).** `**<Company>**`, then `Founder: <name>` when a display name is on the board, then one plain sentence on what it sells and to whom.
2. **One table** with bold section rows, in this order. Other cells on a section row stay empty. Omit Other paths and Past bets when they have no rows. Print Background on every card. Print Bet when a live bet is on the board. A killed company has no Bet. Its stopped bet is under Past bets.
   - **Bet**. The top row starts with 🎯 plus a fitting icon and a **bold** title. Nested rows indent with `· ·` and start with their own icon.
   - **Other paths (not the main bet)** when another live try exists.
   - **Past bets**.
   - **Background** (money 💵, advisor agreement 📄, legal ⚖️).
3. The status dot sits at the start of the State cell: 🟢 working on it, 🟡 waiting, 🔴 dropped, ⚪ closed.
4. **Legend, then Next.** `*🎯 the one thing that matters most · 🟢 working on it · 🟡 waiting · 🔴 dropped · ⚪ closed*` then `**Next:**` one plain sentence on who does what next.

Fixture shape (alpha / bravo / charlie / founder@example.test only):

**alpha**
Founder: Sam
alpha sells dispatch help to plants that already pay for it.

| Work | State | When | Who |
|---|---|---|---|
| **Bet** | | | |
| 🎯 🤝 **Get one plant to pay alpha for a weekly dispatch report** | 🟢 No plant has paid yet | Talk with bravo this week | Sam |
| · · 🏢 bravo, a plant we're talking with | 🟡 Asked, time not set | Book the call | Sam |
| **Other paths (not the main bet)** | | | |
| 🤝 charlie, a company we're talking with, might license the notes | 🟡 Parked | Reopen only if they come back | — |
| **Past bets** | | | |
| 🔎 A page where plants sign up themselves | ⚪ Plants would not fill in the form | — | — |
| **Background** | | | |
| 💵 An investment, not yet signed | 🟡 Unsigned | — | — |
| 📄 Advisor agreement | 🟡 Stock option paperwork not set up yet | — | — |

*🎯 the one thing that matters most · 🟢 working on it · 🟡 waiting · 🔴 dropped · ⚪ closed*

**Next:** Sam talks with bravo this week.

## Dots

- 🎯 the one thing that matters most
- 🟢 working on it
- 🟡 waiting
- 🔴 dropped
- ⚪ closed

## Anti

- Do not print a "The goal is" sentence. The Next line is the only place for the next step.
- No mermaid, Gantt, or schema diagrams unless asked.
- This skill makes no board writes.
- spoken, markdown, and spokenLead are display text. Never write them back. put_journey and create_idea take the stored fields.
- If several companies are asked about, give one card each, in this shape.

## Internal (never print)

Paper cannot promote. A confidentiality promise is not proof someone used the product. Ask/Do is not a card. Unpaid weeks cannot promote. Never invent Impact/Evidence/Leverage. The stored kind stays `customer_check`.

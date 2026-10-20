---
name: Bootstrap board status visualization
description: >-
  Use for every where-are-we / company board card: a bold #1 bottleneck
  sentence, a bold company name, a founder line, one sentence on who buys,
  then one table. Live get_journey first; never invent.
---
Use for every “where are we with COMPANY” and every “company board card” request, for every founder. Locked 2026-10-02 at 4:55 PM CT. If a reader has to ask what a word means, rewrite it. Do not invent a second format.

## Source of truth

1. Read the live `get_journey` / `initiatives[]` first. Use the system of record only to fill in who and when where the board is silent. Never invent rows, moves, owners, or dates.
2. Write in the company's own words. Unless the reader asks (“show clocks” / “show schema”), hide the OS version, journey integers, loop labels, autonomy, Ready-for-human-eyes, kind slugs, idea slugs, and the storage slug `default`.
3. Describe each try as the plain thing being tried ("Get one plant to hire alpha"). The stored kind stays `customer_check`.
4. Plain words for any average person. Do not write P0, FAST, SOPA, SAFE, engagement, or customer bet. Say advisor agreement, stock option paperwork, and investment. Short names the founder wrote stay as written.
5. Open with one bold sentence that names the #1 bottleneck.
6. Then the bold company name, a founder line, and one plain sentence on who buys. The sells sentence names the buyer. It is not the bet title.
7. Column headers are exactly `Work | State | When | Who`.
8. The first time a person or company name appears, say who they are ("bravo, a plant we're talking with").

## Card shape

1. **Opener (always first).** `**The #1 bottleneck is <what is stuck>.**`
2. **Title.** `**<Company>**`, then `Founder: <first name>`. When no name is stored, the founder line uses the email local part. When nobody is stored, the line is `Founder: not named yet`. Then `<Company> sells to <buyer>.`
3. **One table** with bold section rows, in this order. Other cells on a section row stay empty. Omit Other paths, Past bets, and Background when they have no rows. Print Bet on every card, including a board with no live target bet. That row is still the 🎯 bet.
   - **Bet**. On a live board, exactly one 🟢 row, and it is this 🎯 row. On a stopped board the same row is ⚪ and the next step is to leave it stopped. Nested rows indent with `· ·` and start with their own icon. They are not green.
   - **Other paths (not the main bet)** when another live try exists.
   - **Past bets**. Every past bet shows its start date, its end date, and the reason it ended: `start to end: reason`.
   - **Background**. When `scoreboard.pnl` exists, one plain `Money` row sits under Background. Other money paperwork keeps its own icon.
4. The status dot sits at the start of the State cell: 🟢 working on it, 🟡 waiting, 🔴 dropped, ⚪ closed. Only the 🎯 bet is 🟢.
5. **Legend, then Next.** `*🎯 the one thing that matters most · 🟢 working on it · 🟡 waiting · 🔴 dropped · ⚪ closed*` then `**Next:**` one plain sentence on who does what next.
6. **Who.** First names. If no name is stored, the email local part. Rendered card text (spoken and markdown) never shows an email address. JSON `principal` and `who` stay the stored address.

Fixture shape (alpha / bravo / charlie / founder@example.test only):

**The #1 bottleneck is dispatch help for plant operators.**

**alpha**
Founder: Sam
alpha sells to plant operators who already pay for dispatch help.

| Work | State | When | Who |
|---|---|---|---|
| **Bet** | | | |
| 🎯 🤝 **dispatch help for plant operators** | 🟢 Two shops looked, none has paid (Oct 1) | Send the price list this week | Sam |
| · · 🏢 the confidentiality promise for bravo plant was sent | 🟡 Asked Sep 30 | Wait for a paid week | Sam |
| **Other paths (not the main bet)** | | | |
| 🤝 sell bottles in grocery stores | 🟡 Parked until one shop pays | Revisit in December | Sam |
| **Past bets** | | | |
| 🔎 sell online direct to home buyers | 🔴 2026-09-01 to 2026-09-10: Shipping cost too high | — | Sam |
| **Background** | | | |
| Money | last 30 days: $0 revenue; about $4 measured costs, some unknown (Oct 2) | Updated weekly | Sam |
| 💵 investment from an angel | 🟡 Not signed yet | — | Sam |

*🎯 the one thing that matters most · 🟢 working on it · 🟡 waiting · 🔴 dropped · ⚪ closed*

**Next:** Sam — Send the price list this week.

A board with no stored name prints `Founder: founder` when the stored principal is `founder@example.test`. The card text has no `@`. The JSON principal stays `founder@example.test`.

## Dots

- 🎯 the one thing that matters most
- 🟢 working on it. On a live board, exactly one row, and it is the 🎯 bet. A stopped board uses ⚪ on that row.
- 🟡 waiting
- 🔴 dropped
- ⚪ closed

## Anti

- Do not print a "The goal is" sentence. The Next line is the only place for the next step.
- No mermaid, Gantt, or schema diagrams unless asked.
- This skill makes no board writes.
- spoken, markdown, and spokenLead are display text. Never write them back. put_journey and create_idea take the stored fields.
- A display read masks an email address and an sk_live_ or sk_test_ token inside why, note, and premise. principal, who, and the email field stay the stored address. subscribe_board and unsubscribe_board need that principal. The rendered card never prints the address.
- If several companies are asked about, give one card each, in this shape.

## Internal (never print)

Paper cannot promote. A confidentiality promise is not proof someone used the product. Ask/Do is not a card. Unpaid weeks cannot promote. Never invent Impact/Evidence/Leverage. The stored kind stays `customer_check`.

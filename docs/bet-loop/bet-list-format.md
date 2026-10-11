# Bet list

Every bet, tested or not, with its outcome. Roadmap decisions start here. Sort by durable impact first: lasting retention, and revenue that compounds. Effort breaks ties inside the same impact band. A cheap bet that barely moves either one ranks below a high-impact bet.

The Bang vs Buck quadrant is in [roles](roles.md#bang-vs-buck). Apply the [kill-rate rule](study-standards.md#kill-rate) to pass/fail verdicts.

A study verdict does not move the roadmap until Cos signs it. The trace names who decided and the date. Never edit a verdict later. A rerun is a new row or a dated note. Say what the result does not prove. No personal details in the table or the links.

**Tier** is `synthetic`, `smoke`, `organic`, `warm-list`, or `workshop`.

**Status** is where the bet sits: `untested`, `running`, `passed`, `killed`, `held`, or `shipped`.

**Verdict** is the frozen call: `Untested`, `Pass`, `Fail`, `Inconclusive`, `Hold`, or `Drop`. FRAGILE and VOID are flags on the study, recorded in the links, and they are not a pass.

## First bet

The one thing to prove in the next 30 days. One row. The founder writes it. If this slot is empty, do not open a real-world tier.

| id | hypothesis | north-star behavior | tier | status | verdict | links |
| --- | --- | --- | --- | --- | --- | --- |
| B1 | _Fill in._ | _The one real behavior. Liking does not count._ | synthetic | untested | Untested | |

## Open bets

| id | hypothesis | north-star behavior | tier | status | verdict | links |
| --- | --- | --- | --- | --- | --- | --- |
| | _Fill in._ | | | | | |

The links cell points at the pre-registration, the results pinned to a commit, and the decision trace.

## Past bets (killed)

What you tried that failed, and why. Killed bets stay here. Do not delete them. A new variant that repeats a row here is rejected at the CTO design gate.

When a failure shows a move that must never be tried again, add a candidate row to the [blocked list](blocked-list.md).

| id | hypothesis | north-star behavior | tier | status | verdict | links |
| --- | --- | --- | --- | --- | --- | --- |
| | _What was tried._ | | | killed | Fail | _Why it died, and the trace._ |

## How to add a result

1. Pre-register before the run. The study folder holds the pre-registration, amendments, run notes, and results.
2. When it ends, fill the verdict exactly as the frozen rule gave it. Link the results pinned to a commit. Name the next step, or the kill.
3. Record what the result does not prove: synthetic personas, a simulation, or a desk call.
4. Do not copy sealed material. Do not copy personal details.
5. One docs change for the bet-list update. Never edit a past verdict in place.

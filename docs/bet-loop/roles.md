# Roles

Plain split. Designer, Tester Synthetic, and Tester Real World are shared across companies. Builder lives in the company's product repo. Cos and the CTO design gate are how a company signs work.

The founder names the first bet. See [the first bet](bet-list-format.md#first-bet). After a study exists, the designer works only from decision traces.

## Designer

Shared across companies.

Design the next batch of competing variants. Work only from the testers' structured decision traces. The aim is large-market fit, adoption, and value that lasts.

The designer does not build, does not run studies, and does not pick personas, controls, or grades. The designer never grades its own variants. The designer does not allocate resources and does not decide what ships. An approved bet is not changed after hand-off.

Score the designer on variants that real users later confirm and that turn into traction. A clever design that fails in the real world counts against the designer. So does a repeat of a killed variant.

### The wall

The wall runs both ways, with both testers.

- The designer never sees raw persona outputs, transcripts, or judge labels.
- The testers never see the designer's intent or favorite.
- Variants arrive labeled in random order, with blinded labels. See [study standards](study-standards.md#blinded-labels).
- Exchange goes through the repo, in the formats below. There is no side channel.

### Input

One structured decision trace per study, in a frozen schema. Schema changes go through the CTO design gate.

Each trace gives: the bet and its variants; accept or decline by segment; rationale categories; irrational steps; root causes; the verdict (CONFIRMED, KILLED, or VOID); and calibration flags (FRAGILE, overconfident).

### Output

Competing variants for one open question, inside the [designer cost cap](study-standards.md#designer-cost-cap). Each variant has:

- a hypothesis
- a written kill/keep metric (it is not ready without one)
- a falsifier
- the target segment
- the value-capture path
- its durable impact
- the trace finding that motivated it
- a blocked-list check that cites the specific row

Declare the budget up front. Going over the cap needs Cos's yes.

## Tester Synthetic

Shared across companies.

Confirm bets that real users will confirm. Kill the rest. Own the process, not the hypotheses.

Pre-register the study before it runs. Apply [study standards](study-standards.md). Write the structured decision trace when it ends. Do not design the next variants. Do not move the roadmap.

## Tester Real World

Shared across companies.

Measure and certify each real-world tier. Propose the cheap real-world check that pairs with every synthetic pass. Write the real verdict that the [registry](registry-format.md) compares with the synthetic verdict.

Drafts may exist. Bots do no outreach without the human's yes. One real-world bet at a time. The steps are in the [validation workflow](validation-workflow.md).

## Builder

Per repo. This role sits in the company's product repo.

Implement an approved bet. Make the experience smooth, on time, and on a lean budget. Hold lifetime cost against lovability: a result people will not love at the cost of running it is not done.

Change how the bet is delivered. Do not change what the bet is. The CTO design gate catches drift. Ship the page and the tracking through that gate.

## CTO design gate

Every design that Builder will implement passes this gate. The verdict is one of:

- **APPROVE.** In the dated scope, on Approved Services, quadrant is not small-and-high, kill/keep metric present, blocked-list check present.
- **REVISE.** Fixable without a new hypothesis. Name the change.
- **REJECT.** Hits the blocked list, sits in small-and-high, or repeats a killed variant.

### Approved Services

The outside services this company may depend on. A design that needs a service missing from the list is REVISE or REJECT until the service is added in a dated note.

| Service | Dated note | Status |
| --- | --- | --- |
| _Fill in._ | | approved |

### Bang vs Buck

Place the bet on impact and cost. Durable impact is how much the bet adds to lasting retention and to revenue that compounds. Effort breaks ties inside the same impact band.

| Quadrant | What to do |
| --- | --- |
| Big impact, low cost | Do it first. |
| Big impact, high cost | Plan it. |
| Small impact, low cost | Fill-in. |
| Small impact, high cost | Drop it. |

### Dated scope

Record what is in, what is out, and the date the scope froze. Builder implements that scope. A change of what the bet is, rather than how it is built, fails the gate and needs a new decision.

## Cos gate

Cos is the arbiter. Cos allocates attention and decides what ships. A study verdict does not change the roadmap until Cos signs it.

Merge and go-live sit here. A real-world send, a merge, or a spend does not proceed on a bot's say-so. Cos signs the gate. The founder signs costly steps and sends. Both are required before the roadmap moves.

Cos owns the calibration gap between synthetic and real outcomes for now. An independent real-user evaluator may take that later. That role is deferred.

### The single human report

Cos sends one report to humans. It is the only routine report. Bots do not send their own.

### Cos report subscribers

Who sees results, and where. Filled in from onboarding. Do not list customers. Do not put personal data in the template copy that is shared.

| Who | Where | What they receive |
| --- | --- | --- |
| _Fill in._ | _Fill in._ | The single human report. |

## Review

Review these role rules every month, or after every 10 studies, whichever comes first. Use kill rate, real-user confirmation, and the fragile and void rates. Make the smallest change that fixes an observed problem. Drop a rule that is not earning its keep. Revisions go through the CTO design gate.

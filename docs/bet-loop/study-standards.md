# Study standards

These rules apply from the first synthetic study on. Tester Synthetic owns them. A run that breaks one is VOID, or it carries the flag named below. It does not move the roadmap by itself.

## Anchors

Every study includes 2 or 3 questions whose answers are already known from real data. If the personas or the judges miss them, the run is VOID.

## Judges

Two judges, from different model families. Each month, a human labels 10 items by hand, as calibration. Report agreement on items that vary. A single overall score is not enough.

## North star

Each pre-registration names the one real behavior that would prove the bet. Retention, paying, or a repeat of the costly step are the kind of behavior that counts. Stated liking does not count. The same behavior is the north-star cell on the [bet list](bet-list-format.md).

## Real-world pairing

Every synthetic pass ships with a proposed cheap real-world check. It goes to Cos for the human's yes. Bots do no outreach without that yes. The tiers and the yes are in the [validation workflow](validation-workflow.md#real-world-pairing).

## Kill rate

Count only studies with a pass or fail verdict. Leave out simulations and desk checks. Once there are 5 or more verdicts, flag the bar as too easy if more than about 60% pass.

## Pre-registration

Write the test, the kill/keep metric, the anchors, and the north star before the run. Freeze them. Do not edit the rule after the results are in. A change is a new pre-registration, dated, and it does not rewrite the old one.

## Blinded labels

Variants arrive labeled in random order. Testers do not see which variant the designer favors. The designer does not see raw outputs. See the [wall](roles.md#the-wall).

## Fragility

Rerun the top two variants with 3 resamples plus one wording change. Mark the result FRAGILE if any of these is true:

- the winner flips
- the margin swings by more than half
- the margin is under 10 points

A FRAGILE result cannot drive a decision without a rerun or real-user data. A fragile bet cannot advance on a near-miss.

## Not sure

Every question offers "not sure". Compare that rate with the human benchmark from calibration. If synthetic respondents pick "not sure" less than half as often as humans, mark the result overconfident.

## Shrink

Before any go decision, shrink synthetic effect sizes by 50%. Say in the trace whether the result was also overconfident. Do not shrink a second time for that flag.

## Designer cost cap

At most 5 variants per question. At most 2 redesign rounds after a trace. Declare that budget up front. Going over it needs Cos's yes.

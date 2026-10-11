# Validation workflow

Synthetic pre-registration first. Then one real-world bet, one tier at a time. Cos owns this workflow and decides when a bet advances. Tester Real World measures and certifies each gate. Builder ships the page and the tracking through the CTO design gate.

## Synthetic first

Pre-register the study before it runs. [Study standards](study-standards.md) apply. Freeze the kill/keep rule, the anchors, and the north-star behavior.

A bet may leave synthetic testing only when the result is a pass and it is not FRAGILE. VOID does not advance. An overconfident result does not advance until the shrink rule in study standards has been applied and Cos has seen it.

## Real-world pairing

Every synthetic pass ships with a proposed cheap real-world check. The check names the tier, the costly step, and the channel. It goes to Cos.

Bots do no outreach without the human's yes. No posts, no warm-list sends, and no workshop invites until the human approves that exact send.

## Tiers

Real-world tiers open in this order. A tier opens only when the previous one passes. Each tier has a two-week limit. Only one real-world bet is open at a time. A second bet waits until the first is advanced, sent back to iterate, or killed.

Inside the two weeks, a thin sample does not advance. At the two-week limit, call advance, iterate, or kill. Do not extend a tier to collect a near-miss.

Shared marks for every tier after smoke:

- At least half of the people who convert name a specific pain in their own words.
- Fewer than 10 people reached means do not advance.
- A fragile bet cannot advance on a near-miss.
- The synthetic forecast must land within 2x of the real result. If it does not, fix calibration before the next bet advances.

### Smoke

Start with a one-line post or a fake-door button, before anything is built. A landing page or waitlist comes only after people react to it. One tracking id for the bet. A free-form field asks why the person acted. The costly step is on the post, button, or page.

Smoke passes when the post or button is live, tracking works, and reactions and answers are stored. Smoke checks the instrument. It does not claim demand.

### Organic

Strangers who fit the target customer, reached through a channel on the fence. Pass when 5 or more of them take the costly step, and clicks are 2% or more of reach. The shared marks apply.

### Warm list

People the company already knows, on a channel on the fence. Pass when 30% or more reply, and 3 in 10 commit time or money. One invite per person per week. Include an opt-out. The shared marks apply.

### Workshop

A live session with people who fit the target customer. Pass when 2 in 10 attendees pay or commit time. The shared marks apply.

## Advance, iterate, or kill

Cos decides. Tester Real World certifies the numbers. A bot does not advance a tier.

**Advance.** The tier's pass marks are met, the result is not FRAGILE, the forecast is within 2x, and at least half of converters named a pain. The bet moves to the next tier. The human still says yes before that tier's outreach or costly step.

**Iterate.** The pain shows up, but the offer or the channel missed. Or fewer than 10 people were reached at the two-week limit. Or the result is a near-miss on a fragile bet. Write a decision trace. The designer may propose new variants from that trace. The bet does not move up a tier, and it does not stay open past the limit.

**Kill.** The falsifier hit, converters do not name a real pain, the gate is missed at two weeks with no iterate case, or the variant repeats a killed bet. Record Fail or Drop. Move the row to [past bets](bet-list-format.md#past-bets-killed). Do not rerun that variant.

## Channel fence

A test may touch only the channels listed here. Customers may use other channels. A test does not follow them there, and a test does not open a new channel. Outreach on a fenced channel still needs the human's yes for each send.

| Channel | A test may touch it | Notes |
| --- | --- | --- |
| _Fill in._ | yes / no | |

## Budget and stop rule

The monthly test budget and the time limit. The two-week tier limit above is the default time limit. The [designer cost cap](study-standards.md#designer-cost-cap) bounds variant work. Only one real-world bet is open, so the budget is not split across parallel real-world bets.

| | Fill in |
| --- | --- |
| Money this month | _Fill in._ |
| Hours this month | _Fill in._ |
| Stop when | Budget spent, a tier hits two weeks, the falsifier hits, or a kill rule fires. |

Going over the declared budget needs the founder's yes, and Cos's yes.

## Costly steps

A costly step spends money, time, or reputation. The company's definition is the [costly step](README.md#costly-step) on the overview. Each costly step needs the founder's yes before it runs.

The class of step that needs that yes includes: a public post, a message to a person, a charge, a calendar hold, a paid placement, and a new public identifier. Bots may draft. They do not run the step.

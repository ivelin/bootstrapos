# Cross-company registry

A shared log of anonymized verdicts and of the gap between synthetic and real outcomes. Shared testers learn from it. Companies are not named in it. Cos owns the calibration gap.

Add a row when a real-world tier closes. The registry is append-only. Do not edit a past gap. A correction is a new dated row.

## Fields

| Field | What to write |
| --- | --- |
| company hash | A one-way hash of a stable company id. The hash only. The name stays off this registry. |
| bet category | A coarse label that could fit any company, such as acquisition, activation, retention, pricing, or trust. Not a product name, and not hypothesis text that identifies the company. |
| tier | The real-world tier that closed: `smoke`, `organic`, `warm-list`, or `workshop`. |
| synthetic verdict | The frozen synthetic call: Pass, Fail, or Inconclusive, plus FRAGILE or overconfident if flagged. |
| real verdict | The frozen real call: Pass, Fail, or Inconclusive. |
| gap | `match` when the calls agree and the forecast landed within 2x of the real result. `synthetic-high` when synthetic was kinder than real. `synthetic-low` when synthetic was harsher. |
| date | The date the real verdict was recorded, `YYYY-MM-DD`. |

If the gap is not `match`, fix calibration before the next bet advances. The rule is in the [validation workflow](validation-workflow.md#tiers).

## Row

| company hash | bet category | tier | synthetic verdict | real verdict | gap | date |
| --- | --- | --- | --- | --- | --- | --- |
| _hash only_ | | | | | | |

## What stays out

No customer personal data. No company names. No emails, domains, or product names that identify a company or a person. No raw transcripts. The decision trace stays in the company repo. This registry gets the fields above and nothing else.

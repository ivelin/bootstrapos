# Blank instance files

> **Deprecated (October 2, 2026).** The laptop kit and `~/.bootstrap-os` get no more fixes. [Move off a local install](../docs/migrate-from-local.md).

Copy these into *your* company repo. The one-command path from the template root:

```text
./scripts/install-instance.sh /path/to/your-company
```

That also merges the fenced block in [`../company-os/ai-instructions.md`](../company-os/ai-instructions.md) into the target `AGENTS.md`.  
If you copy by hand, paste that same block yourself.

Do **not** fill these files with another founder’s market, ICP list, or scores.

## Copy map

| In this folder | Lands in the company repo |
|----------------|---------------------------|
| `applied-here.md` | `docs/company-os/applied-here.md` |
| `instance/README.md` | `docs/company-os/instance/README.md` |
| `instance/thesis.md` | `docs/company-os/instance/thesis.md` |
| `instance/scores.md` | `docs/company-os/instance/scores.md` |
| `instance/snapshots/TEMPLATE.md` | `docs/company-os/instance/snapshots/TEMPLATE.md` |
| `company/README.md` | `company/README.md` |
| `company/state/company-state.json` | `company/state/company-state.json` |
| `company/state/company-state.schema.json` | `company/state/company-state.schema.json` |
| `company/state/where-are-we.py` | `company/state/where-are-we.py` |
| `traces/decisions/TEMPLATE.md` | `traces/decisions/TEMPLATE.md` |
| `research/icps/TEMPLATE.md` | `research/icps/TEMPLATE.md` |
| `product/READY_FOR_HUMAN_EYES.md` | `product/READY_FOR_HUMAN_EYES.md` |

Also copied by the install script (lives in the OS pack, not here):

| OS pack file | Lands in the company repo |
|--------------|---------------------------|
| `company-os/first-hour.md` | `docs/company-os/first-hour.md` |
| fenced block in `company-os/ai-instructions.md` | merged into root `AGENTS.md` |
| `.grok/workflows/` (README + three `.rhai`) | `.grok/workflows/` |

Optional Grok Build workflows copy to `.grok/workflows/`.

Then follow [`../company-os/first-hour.md`](../company-os/first-hour.md).

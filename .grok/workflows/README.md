# Optional Grok Build workflows (path 2)

These Rhai workflows are an **optional** way to run the Bootstrap OS loop in [Grok Build](https://grok.x.ai). They are not the constitution.

**Markdown wins.** `company-os/operating-system.md`, `live-runtime.md`, and `ai-instructions.md` are the source of truth. If a workflow and the OS disagree, follow the OS.

**Install.** `scripts/install-instance.sh` may copy this folder to `$TARGET/.grok/workflows/`. You can also point Grok at this pack and run a workflow by name without installing.

**How to run:** `grok` workflow by name (from the company repo or this template).

| Workflow | What it does |
|----------|----------------|
| `company-operating-loop` | Inspect the week's artifact via `where-are-we.py` / `company-state.json`; do not write `loopStage`; founder-gates journey phase. |
| `user-research` | Day-0 synthetic ICP filter: forced choice + one condition change; founder gate iterate / agree_ready / kill. |
| `ready-for-human-eyes` | Fail-closed ship gate before asking anyone to try a product link. Green ≠ demand. |

Public-safe only. No PII. Do not import another company’s market.

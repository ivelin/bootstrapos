# Company OS pack (portable)

This folder is the **Bootstrap OS** blueprint and runtime shape. It is not any one company’s live state.

| File | Role |
|------|------|
| [`operating-system.md`](operating-system.md) | Blueprint — phases, gates, evidence, growth pack, Ready for human eyes |
| [`live-runtime.md`](live-runtime.md) | Live OS shape — durable state + three-week loop |
| [`ready-for-human-eyes.md`](ready-for-human-eyes.md) | Ship gate checklist before external product-test asks |
| [`ai-instructions.md`](ai-instructions.md) | Thin always-on rules for your main AI tool |
| [`first-hour.md`](first-hour.md) | Day 0 (~60 minutes) — thesis, lifestyle or fences, ≥3 customer groups, first “Where are we?”. The two-minute figure is the snapshot *read*, not the hour. |
| [`clock-examples.md`](clock-examples.md) | Teaching 5 × 3 scenes (household jobs). Not a live board. Not Day 0. |
| [`after-proof-efficiency.md`](after-proof-efficiency.md) | After proof — five instruments (fences + they asked). Not Day 0. |

**Blank instance files:** [`../templates/`](../templates/)  
**Repo overview & adopt order:** [`../README.md`](../README.md) — path 1 point-an-AI, path 2 optional install.

Optional Grok Build workflows live in [`../.grok/workflows/`](../.grok/workflows/).  
OSS self-host kit (not the Pirin mentee path): [`../mcp/README.md`](../mcp/README.md). Hosted pin `https://mcp.bootstrap.pirin.ai/mcp` is the Pirin write plane. Path 1 stays the front door. Preview plugin: [`../plugin/`](../plugin/). Git-branch previews are not mentee-ready boards.

### Mental model

```text
BLUEPRINT                          LIVE RUNTIME
operating-system.md                live-runtime.md
  five rungs + gates                 state + quality bar (Ask → Write back)
  virtual office cards (jobs optional)  git remembers; day tools may feed it
  founder-day + skill-capture (optional)  honest scores + open questions
```

Do not put filled thesis, ICPs, or product roadmaps in this folder. Those belong in *your* company’s instance after you copy from `templates/`.

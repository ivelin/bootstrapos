# Cold path: Bootstrap OS MCP (non-maintainer)

**Goal:** On a clean machine, go from zero → working multi-company control plane in under 15 minutes.  
**Pass criteria for gate M2:** someone who did **not** write this code completes the path and records evidence below.

This is the **self-host kit** (stdio / `~/.bootstrap-os`, `initCompany()`). It is not the Pirin-supported mentee source of record. Path 1 is still point an AI at https://github.com/ivelin/bootstrapos (no install). Path 2 is optional notes in your repo. The Pirin write plane is [`HOSTED_IDENTITY.md`](HOSTED_IDENTITY.md) — `create_company` then `create_idea`. Git-branch previews are not mentee-ready boards.

---

## Prerequisites

| Need | Notes |
|------|--------|
| Node.js **≥ 20** | `node -v` |
| Git | clone only |
| An MCP client (optional for automated smoke) | Cursor, Claude Desktop, or any stdio MCP host |
| Disk | write access for data root (default `~/.bootstrap-os`) |

No npm publish required. No cloud account. No API keys.

---

## A. Automated cold path (CI + local)

From a fresh clone of this repo (or PR branch):

```bash
git clone https://github.com/ivelin/bootstrap.git
cd bootstrap
cd mcp
npm ci
npm run ci
```

Expected: typecheck, build, unit tests (including OS 2.8.9 house rules, the [E2E role-play matrix](E2E_ROLEPLAY.md), [invite/accept](INVITE.md), and the no-instance-secrets smell test), cold-path smoke, **stdio MCP client smoke**, **HTTP hosted-read smoke** all pass. The CI `user-path` job is `npm run verify:user-path` (role-play + those smokes) — necessary, not an independent pstack verdict.

What `npm run ci` proves without a GUI:

1. Package builds on Node 20/22  
2. Phase gate + isolation + refuse-external-ask  
3. Markdown templates intact  
4. Real stdio JSON-RPC: list tools → init companies → use → update (gated) → refuse
5. HTTP read adapter serves OS info/docs without a local clone; write tools absent  

---

## B. Human client connect (gate M1 evidence)

### 1. Build once

```bash
cd /path/to/bootstrap/mcp
npm ci && npm run build
```

### 2. Write client config

Copy and fill absolute paths from `mcp/config/mcp.stdio.example.json`:

```json
{
  "mcpServers": {
    "bootstrap-os": {
      "command": "node",
      "args": ["/ABSOLUTE/path/to/bootstrap/mcp/dist/index.js"],
      "env": {
        "BOOTSTRAP_OS_ROOT": "/ABSOLUTE/path/to/bootstrap",
        "BOOTSTRAP_DATA_ROOT": "/ABSOLUTE/path/to/.bootstrap-os"
      }
    }
  }
}
```

| Client | Where to paste |
|--------|----------------|
| **Cursor** | Settings → MCP → add server (or `~/.cursor/mcp.json`) |
| **Claude Desktop** | `claude_desktop_config.json` → `mcpServers` |
| **Other** | Any host that supports MCP stdio |

Restart the client after saving.

### 3. First conversation script (copy/paste)

Ask the agent to call tools in order:

1. `bootstrap_os_info`  
2. `bootstrap_init_company` with `companyId: "sandbox-demo"`  
3. `bootstrap_where_are_we`  
4. `bootstrap_update_state` with `journeyPhase: 3` and **no** founder approval → expect warning, phase stays 1  
5. `bootstrap_refuse_external_ask_if_not_green` with intent "send try-link to mentor" → `allow: false`  
6. `bootstrap_init_company` for a second id → `bootstrap_use_company` → confirm isolation  

### 4. Evidence to attach (M1)

- [ ] Screenshot or log: tools listed in client  
- [ ] Path to `BOOTSTRAP_DATA_ROOT/instances/sandbox-demo/company/state/company-state.json`  
- [ ] Note: phase still 1 after unapproved update  
- [ ] Note: refuse returned `allow: false`  

---

## C. Markdown-only cold path (no MCP)

```bash
git clone https://github.com/ivelin/bootstrap.git
# copy templates into your company repo (or work in place)
cp -R bootstrap/templates/company my-company/company
# paste company-os/ai-instructions.md into your agent system prompt
# edit company/state/company-state.json
```

No `mcp/` usage required. Gate: can answer "where are we?" from state + OS docs alone.

---

## D. Failure modes (SRE cheat sheet)

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Client shows 0 tools | Wrong path to `dist/index.js`; not built | `npm run build`; use absolute paths |
| `Company state not found` | No disk bootstrap / wrong data root | On this self-host kit: `bootstrap_init_company` or set `BOOTSTRAP_DATA_ROOT`. On the hosted pin: ask a super admin to call `create_company`, then `create_idea`, or email bootstrap@pirin.ai. |
| Phase jumps unexpectedly | Client bug or wrong flag | Must require `founderApprovedPhaseChange=true` |
| Companies bleed together | Shared `BOOTSTRAP_INSTANCE_ROOT` | Unset it; use multi-company data root |
| Works in CI, fails in client | Client env not passed | Mirror `env` block from example JSON |

---

## E. Sign-off template (paste into PR or dogfood log)

```text
Cold path M2
Date:
Operator (not author): 
Machine OS:
Node version:
Commands run:
CI / npm run ci result:
Client used (if any):
Evidence paths:
Issues found:
Sign-off: PASS / FAIL
```

Until this form exists for a **non-author** operator, M2 remains open even if CI is green.

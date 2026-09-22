# M1 — MCP client connect checklist

Self-host kit (stdio on your disk). Not the Pirin-supported mentee source of record. Path 1 (point an AI at the GitHub pack) stays the front door. Hosted pin: [`HOSTED_IDENTITY.md`](HOSTED_IDENTITY.md) — `create_company` then `create_idea`. Git-branch previews are not mentee-ready boards.

Automated companion: `npm run test:stdio` (spawns server + official SDK client over stdio).

## Human checklist

1. [ ] `cd mcp && npm ci && npm run build`
2. [ ] Absolute paths in client config (`config/mcp.stdio.example.json`)
3. [ ] Client restarted; server `bootstrap-os` shows connected
4. [ ] Tool list includes `bootstrap_where_are_we` and multi-company tools
5. [ ] Init `sandbox-demo` → state file on disk under `BOOTSTRAP_DATA_ROOT`
6. [ ] Unapproved phase change rejected
7. [ ] `bootstrap_refuse_external_ask_if_not_green` → `allow: false` when eyes ≠ green
8. [ ] Second company does not inherit first company's phase
9. [ ] `bootstrap_os_info` reports OS 2.8.9 house rules (observed wins; spoken yes cannot promote; several ideas allowed; marketing volume cannot promote; there is no optimal price until people have paid and stayed; do not automate a step that should not exist)
10. [ ] Instance has `company-state.json` + `where-are-we.py`; `company-os/` templates unchanged

Attach evidence on the PR (logs or screenshots). Keep human-eyes for MCP itself at **unknown** until cold path M2 is signed by a non-author.

## Sign-off (maintainer Grok CLI, 2026-08-16 CT)

Walked on Grok CLI (`grok mcp add` + session tools), not Cursor GUI. Sandbox data root only (`/workspace/m1b-sandbox`). No real founder boards.

- Doctor: handshake OK, 17 tools, protocol 2025-11-25
- Init `sandbox-demo` + `idea-b`; unapproved phase 1→5 rejected; refuse external ask `allow: false`
- Isolation: idea-b stayed phase 1 / own hypothesis; `company-os/` listing unchanged
- Human-eyes for MCP itself remains **unknown** until M2 (non-author cold path)

M2 and M3 are still open.

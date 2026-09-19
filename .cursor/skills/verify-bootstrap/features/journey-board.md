# Journey board

On this draft branch the hosted adapter also lists gated journey board tools. A founder or advisor with an allowlisted JWT reads `get_journey` (company or company/idea), and a founder-authorized actor may subscribe an ACL member to board notify. Cookie-less calls 401. Tools list on the production pin after Cos applies subscriber SQL. Preview/dev never attach the live store. There is no snapshot HTML UI in this repo.

## Sub-features

- `board-gated-empty` cookie-less `get_journey` / `subscribe_board` → HTTP 401 + collab `WWW-Authenticate`.
- `board-company` `get_journey` with a company slug returns every idea for that company.
- `board-idea` company + idea returns one idea.
- `board-constraint` response surfaces `constraint_this_week` and ACL `owners` (not a free-text owner).
- `board-subscribe` `enable_board_watch` turns on board updates for Bill (Cos-set env). `subscribe_board` / `list_subscribers` / `unsubscribe_board` remain Cos / adapter furniture.
- `board-comments` `post_comment` never advances a gate.

## How to get to it (user POV)

- Authenticated MCP client on this branch's hosted adapter calls `get_journey` with `company` (and optional `idea` or `q` like `CoreHaul / last-mile`).
- Founder-authorized client calls `enable_board_watch` with `company` (optional `idea`) after invite. Cos sets the watch secrets; founders never paste a URL.
- Anyone who may `get_journey` can `list_subscribers` for that company.
- Path 1 founders on GitHub are not told to connect this host.

## Driving it with verify-bootstrap

Preconditions:

- Helper launched and `doctor` ok.
- Live helper has no journey store (preview/dev). Cookie-less board tools must 401.
- Fixture payload is `mcp/test/journey-tools.test.mjs` (memory store). PGlite RLS is `journey-pglite.test.mjs` when proving SQL isolation — not required for the first map pass.

- **Empty board call.** Run `node .cursor/skills/verify-bootstrap/scripts/verify-bootstrap.mjs drive journey-board`. Live POST `tools/call` `get_journey` `{ "company": "corehaul" }` with no Bearer → HTTP `401`, `error: invalid_token`, same challenge as whoami. No idea slugs in the body.
- **Company vs idea.** The helper then runs `cd mcp && node --test --test-name-pattern "company query returns every idea" test/journey-tools.test.mjs`. Company `corehaul` returns ideas `corehaul` and `last-mile`. Idea query `last-mile` returns one idea.
- **Subscribe (when extending this drive).** `subscribe_board` without Bearer must 401 on the helper. Fixture subscribe requires an ACL member; non-ACL principals fail closed.
- **Proof.** `artifacts/journey-board/proof.json` (`liveStatus` 401, fixture exit 0), `get-journey-401.json`, `e2e.tap.txt`.

## Gotchas

- When reporting board status to a human, lead with descriptive labels; numbers only in parentheses. Do not change tool-driving steps.
- Journey tools list on the pin after Cos applies `20260920_bootstrap_os_board_subscribers.sql`. Do not live-probe the pin from a PR agent.
- Labels from whoami are **not** boards. `get_journey` is a different ACL.
- Comments and digests must not invent stage or Advance.
- Email notify is enqueue-only. Resend is pirin-ai (`verify-pirin` / Cos), not this helper.
- Fixture company slugs (`corehaul`, `dyeconverter`) are PGlite/memory only. Do not hit them on prod.
- A mermaid / two-minute snapshot is a generated view on the tool result, not a page to open in the browser.

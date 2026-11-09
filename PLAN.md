# whoami effective_to lapse

`bootstrap_os_membership_for` today returns `level`/`status` verbatim. Manual trials stay `status = active` with `effective_to` in the past, so TS `ended` mapping never sees them.

1. New migration `20261109_bootstrap_mcp_membership_effective_to.sql` replaces the helper only. No `effective_to` column: previous SELECT. Column present: level `board` when `effective_to` is not null and `< now()`; status unchanged. Missing table still returns NULL. Same REVOKE, no GRANT.
2. PGlite fixture mirrors that body (text uid). Tests: null and future stay ground; past active ground becomes board; table-without-column stays verbatim.
3. TS `membershipFromStored` unchanged. Comment notes SQL already rewrote a past `effective_to` to board.

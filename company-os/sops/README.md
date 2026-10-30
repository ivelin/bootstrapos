# Publish an SOP version

SOPs are append-only. `bootstrap_list_sops` and `bootstrap_get_sop` have the same access as `bootstrap_get_doc`. tools/call needs no token.

To publish a version:

1. Add `company-os/sops/<name>/vX.Y.Z.md`. Do not edit or rename an existing version file.
2. Put this front matter at the top. `sha256` is the lowercase hex SHA-256 of the UTF-8 body. The body is every byte after the closing front-matter fence. That fence is a line whose entire content is `---`. The newline that ends the fence is not part of the body.

```yaml
---
name: <name>
version: X.Y.Z
published_at: "YYYY-MM-DDTHH:MM:SS.sssZ"
sha256: <hex of the body>
---
```

3. Append that relative path to `SOP_FILES` in `mcp/src/sops.ts`. The hosted connector fetches it from the same docs base as the process notes.
4. Append the file's full-content SHA-256 to `mcp/test/fixtures/sop-immutability.json`. CI fails if a recorded file's bytes change. CI also fails if a key that already exists on main has a different hash.

`bootstrap_get_sop` returns the highest semver for that name unless the caller passes `version`.

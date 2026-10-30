# Publish an SOP version

SOP text does not live in this repository. The source is a Drive file the operator holds. The database row is append-only. A published `(name, version)` is never edited.

This step needs a yes from Ivelin. Apply and verify `mcp/supabase/migrations/20261030_bootstrap_os_sops.sql` on the database first. Merging the MCP before that migration is applied will deploy tools that cannot read the table.

## Command

From `mcp/`, with the service role in the environment and not in the shell history you share:

```bash
node scripts/publish-sop.mjs <name> <version> <file>
```

`<file>` is the body to store, copied from Drive onto the operator machine. The script hashes that file, inserts one row, and prints the row id and the sha256. It refuses a name and version that already exist. It does not print the URL or the key.

Environment:

- `BOOTSTRAP_SUPABASE_URL` or `SUPABASE_URL`
- `BOOTSTRAP_SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SERVICE_ROLE_KEY`

`bootstrap_list_sops` and `bootstrap_get_sop` read through the anon RPCs. A `tools/call` needs no token, the same as `bootstrap_get_doc`.

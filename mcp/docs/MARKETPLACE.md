# Cursor plugin marketplace

A Cursor plugin marketplace submission is planned. The plugin is not listed yet.

`create_company` is shown to every signed-in account. A confirmed account can open up to 3 bet boards. A super admin still uses the admin path. A call that reaches the tool with no admin store is HTTP 200 and includes `ask_admin`. The database path returns `status` 403 and does not include `ask_admin`.

Catalog reviewers use a plain member account.

The hosted endpoint is `https://mcp.bootstrap.pirin.ai/mcp`.

`bootstrap_os_info` keeps `marketplace: false` until the plugin is listed. The flag flips to `true` at listing time.

Cursor's publish page reads `plugin.json` and `mcp.json` at the repository root. The listing copy is `LISTING.md` in that same root. Cursor's checklist also names a plugin `README.md`. This repository's `README.md` stays the OS template. Team Import from Repo still uses `.cursor-plugin/marketplace.json` and source `plugin/`.

The publish form uses `logo.png` at the repository root. That file is the 512px image. `plugin.json` has no logo field, because the Agent Plugins 1.0.0 schema rejects unknown fields.

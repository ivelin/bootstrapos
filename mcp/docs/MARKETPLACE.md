# Cursor plugin marketplace

A Cursor plugin marketplace submission is planned. The plugin is not listed yet.

`create_company` is shown to every signed-in member. Only a super admin can run it. Anyone else gets HTTP 403 `ask_admin` when no admin store is attached. A member call with the store attached is HTTP 403 with no extra error code.

Catalog reviewers use a plain member account.

`bootstrap_os_info` keeps `marketplace: false` until the plugin is listed. The flag flips to `true` at listing time.

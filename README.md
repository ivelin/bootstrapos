# Bootstrap OS by pirin.ai

Bootstrap OS is a bet board for solo founders going from idea to first real customers. Pirin.ai publishes this connector. It reads and updates your bet board. You can ask where you are, what is stuck this week, and what you already decided.

| | |
|--|--|
| **Publisher** | Pirin.ai |
| **Contact** | bootstrap@pirin.ai |
| **License** | Apache-2.0 |
| **Version** | Blueprint **v2.8.19**. Plugin **0.1.1**. |
| **Homepage** | [pirin.ai/bootstrap-os](https://pirin.ai/bootstrap-os) |
| **Privacy** | [pirin.ai/privacy](https://pirin.ai/privacy) |
| **Terms** | [pirin.ai/terms](https://pirin.ai/terms) |
| **Source** | [github.com/ivelin/bootstrapos](https://github.com/ivelin/bootstrapos) |

## What you need

- An invite. Bet boards are invite-only. Someone already on your bet board sends the invite to your email.
- A pirin.ai sign-in that uses that same email. You can create the account when you first sign in.

## How to connect

The hosted connector is how you open a bet board. The connector address is https://mcp.bootstrap.pirin.ai/mcp.

The hosted connector uses sign-in. The handshake returns 401. Gated tools return 401 and `WWW-Authenticate`. The authorization server is the pirin.ai login. This repository does not host a login page.

1. Install the Bootstrap OS connector.
2. Open https://pirin.ai/bootstrap-os and sign in, or create your account, with the email your invite went to.
3. Ask "Where are we?"

You are signed in, and this account has no bet board yet. Open your private starter bet board. It stays yours alone. You cannot invite anyone, and it cannot become a real company.

This bet board has no bet yet. Name the first bet, who it is for, and what you sell.

Open your private starter bet board. Next tool is `create_starter_board`. Name the first bet on this bet board. Next tool is `create_idea`.

`create_company` is shown to every signed-in account. A confirmed account can open up to 3 bet boards. A super admin still uses the admin path.

Moving an idea to a new stage needs your approval.

## What you can ask

- "Where are we?" Shows your bet board, the bet card for each idea, and this week's biggest bottleneck.
- Invite a teammate to a bet board you already belong to. A starter bet board cannot send invites.
- "Create a company called charlie." `create_company` is shown to every signed-in account. A confirmed account can open up to 3 bet boards. A super admin still uses the admin path.

## Your data

- You can only see companies you were invited to.
- Sign-in happens on pirin.ai. The connector never sees your password.
- Changes are written to an audit trail.

## Repository facts

Cursor's publish page reads `plugin.json` and `mcp.json` at the repository root. `mcp.json` sets the connector type to `streamable-http` and the URL to `https://mcp.bootstrap.pirin.ai/mcp`. Do not use the retired `mcp.pirin.ai` host.

Listing copy is [`LISTING.md`](LISTING.md). The marketplace notes are [`mcp/docs/MARKETPLACE.md`](mcp/docs/MARKETPLACE.md). Skills in [`plugin/`](plugin/) link to that note.

Optional copy of blank templates into a company repo:

```text
./scripts/install-instance.sh /path/to/your-company
```

The laptop kit and `~/.bootstrap-os` are deprecated as of October 2, 2026. [Move off that install](docs/migrate-from-local.md).

Build the kit in this repo with:

```bash
cd mcp && npm install && npm run build
```

That build is not how you open a bet board. The hosted connector is.

Invited founders who want Bill use [Install Bootstrap Bill](docs/install-bill.md).

The blueprint is [`company-os/operating-system.md`](company-os/operating-system.md), version 2.8.19. Instance secrets in the template are forbidden. The check is `mcp/test/no-instance-secrets.test.mjs`.

Published SOP text is not in this repository. The source is Drive. [`docs/publish-sop.md`](docs/publish-sop.md) is the release step. `bootstrap_list_sops` and `bootstrap_get_sop` have the same access as `bootstrap_get_doc`. tools/call needs no token.

Free GitHub docs are the alternative to the hosted connector.

# Move off a local install

This is for anyone still running Bootstrap OS on a laptop. That includes a founder’s desktop, and Bill when it was pointed at the folder on that computer.

As of October 2, 2026, that local deployment is deprecated. It gets no more fixes, features, or evals. Local-only files for that path will be removed around October 16, 2026. This page does not remove them.

What closed is the laptop kit and the `~/.bootstrap-os` folder. A server you run yourself is a different path, and this note does not close it. That sentence stays in [Hosted identity](../mcp/docs/HOSTED_IDENTITY.md).

The supported paths are the hosted MCP and the Bootstrap Bill template.

## Switch to the hosted MCP

Use the connector and sign-in already written down. Do not use any other address.

1. Sign in at https://pirin.ai/bootstrap-os/login
2. Connect at https://mcp.bootstrap.pirin.ai/mcp

You need an invite. Sign-in alone does not open a board. An admin opens your company, then your idea.

The same steps, in the words already published:

- [Install Bootstrap Bill](install-bill.md) — sign-in, connector, and invite
- [Hosted identity](../mcp/docs/HOSTED_IDENTITY.md) — the hosted MCP contract

## Bootstrap Bill

Bill is the other supported path. It is invite-only.

1. Add Bill from https://x.ai/bot/NfURVcmf2bx9QyoljkJ7Y
2. Sign in and connect with the same two addresses above

The Bill template in this repo is [`templates/bootstrap-bill/`](../templates/bootstrap-bill/). The install page is [Install Bootstrap Bill](install-bill.md).

If Bill on your computer was using the local board, point it at the hosted connector instead. Use the sign-in and connector on that install page.

## What happens to your local data

Your files stay where they are. This project does not delete `~/.bootstrap-os`, and it does not copy that folder onto the hosted board.

Company notes you already copied into your own repo stay in that repo (`company/state/company-state.json` and the notes beside it).

This repo documents no export and no import that moves your own local board onto the hosted board. The import files in this repo are fictional test boards. They are not a way to load your company.

## Ask for help

Write the maintainers if you need your local notes on the hosted board.

If the note includes company names, customers, or anything else private, email [bootstrap@pirin.ai](mailto:bootstrap@pirin.ai) first. Do not put that in a public issue.

A public GitHub issue is fine only when nothing private is in it: https://github.com/ivelin/bootstrap

After you are on the hosted board, you can also file `submit_feedback` once you say yes in the chat. The mailbox is still the front door. Details: [Feedback](install-bill.md#4-feedback).

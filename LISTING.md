# Bootstrap OS

Bootstrap OS is a bet board for solo founders going from idea to first real customers. Pirin.ai publishes this connector. It reads and updates your bet board. You can ask where you are, what is stuck this week, and what you already decided.

This plugin is not listed in the Cursor marketplace yet.

## What you need

<<<<<<< HEAD
- An invite. Boards are invite-only. Someone already on your bet board sends the invite to your email.
=======
- An invite. Bet boards are invite-only. Someone already on your bet board sends the invite to your email.
>>>>>>> 0df09cf (docs: make the hosted connector the setup source)
- A pirin.ai sign-in that uses that same email. You can create the account when you first sign in.

## How to connect

The connector address is https://mcp.bootstrap.pirin.ai/mcp.

1. Install the Bootstrap OS connector.
2. Open https://pirin.ai/bootstrap-os and sign in, or create your account, with the email your invite went to.
3. Ask "Where are we?"

You are signed in, and this account has no bet board yet. Open your private starter bet board. It stays yours alone. You cannot invite anyone, and it cannot become a real company.

This bet board has no bet yet. Name the first bet, who it is for, and what you sell.

Open your private starter bet board. Next tool is create_starter_board. Name the first bet on this bet board. Next tool is create_idea.

## What you can ask

- "Where are we?" Shows your bet board, the bet card for each idea, and this week's biggest bottleneck.
- "Invite bill@example.test to alpha." Sends a teammate an invite to a bet board you already belong to. A starter bet board cannot send invites.
- "Create a company called charlie." `create_company` is shown to every signed-in account. Only a super admin can run it.

Moving an idea to a new stage needs your approval.

## Your data

- You can only see companies you were invited to.
- Sign-in happens on pirin.ai. The connector never sees your password.
- Changes are written to an audit trail.

## Help

Email ivelin@pirin.ai. The homepage is https://pirin.ai/bootstrap-os. Source code (Apache-2.0) is https://github.com/ivelin/bootstrapos.

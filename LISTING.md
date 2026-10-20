# Bootstrap OS

Bootstrap OS is a company operating board for solo founders going from idea to first real customers. Pirin.ai publishes this connector. It reads and updates your board. You can ask where you are, what is stuck this week, and what you already decided.

This plugin is not listed in the Cursor marketplace yet.

## What you need

- An invite. Boards are invite-only. Someone already on your company board sends the invite to your email.
- A pirin.ai sign-in that uses that same email. You can create the account when you first sign in.

## How to connect

The connector address is https://mcp.bootstrap.pirin.ai/mcp.

1. Install the Bootstrap OS connector.
2. Open https://pirin.ai/bootstrap-os and sign in, or create your account, with the email your invite went to.
3. Ask "Where are we?"

If you see "No boards yet", you are signed in, and no board has been shared with that email. Ask the person who invited you to resend the invite to the email you used.

## What you can ask

- "Where are we?" Shows your board, the stage of each idea, and this week's biggest bottleneck.
- "Invite bill@example.test to alpha." Sends a teammate an invite to a company you already belong to.
- "Create a company called charlie." `create_company` is shown to every signed-in account. Only a super admin can run it.

The connector asks for a clear yes before it changes your board.

## Your data

- You only see companies you were invited to. One company never sees another company's data.
- Sign-in happens on pirin.ai. The connector never sees your password.
- Changes are written to an audit trail.

## Help

Email ivelin@pirin.ai. The homepage is https://pirin.ai/bootstrap-os. Source code (Apache-2.0) is https://github.com/ivelin/bootstrapos.

# Team-activity notifications

**Status: Proposed.** Written 2026-09-30.

Planning and implementation are separate pull requests on 2026-10-01. This page is the requirements only. It adds no code, no database shape, and no migration.

**Audience:** a founder, and the agent that founder already invited onto a company board.

## Why

An inviting agent invited a teammate onto a company board. It could not see when she opened the invite, when she accepted, or when she read the board card. It re-read the whole board every hour.

That hourly re-read is the problem this page solves. The agent should ask for what changed since last time, and get only that.

The example uses fixture labels only: companies **alpha**, **bravo**, and **charlie**, and the addresses `founder@example.test` and `teammate@example.test`. Those labels are fiction. They are the same labels the tests already use.

## Words, said once

| Word | Plain meaning |
|------|----------------|
| **Board** | The company page that answers “Where are we?”: who you are betting on, what is stuck, and what you already decided. |
| **Board card** | That short answer. A first read of it is one event. |
| **MCP** | Model Context Protocol. The signed-in tool connection an agent uses to read and write a board. |
| **Pull** | The agent asks for new events when it is ready. Nothing rings the agent. |
| **Push** | The board sends a short notice to a web address the subscriber’s routine already listens on. |
| **Digest** | One bundled summary, instead of one notice per event. |
| **Cursor** | A bookmark. The next read continues after it. This is not the editor named Cursor. |
| **Webhook** | A web address (a URL) that a routine listens on, so a notice can be delivered there. |
| **Fail closed** | If we are not sure the caller is allowed, the answer is empty (or a refusal). It is never another company’s rows. |
| **UTC** | Coordinated Universal Time. One clock for every event, so order does not depend on a laptop’s time zone. |
| **HTTP 401 / 403** | The usual refusal codes: 401 means not signed in, 403 means signed in but not allowed. An empty body is the same idea when we show nothing. |
| **Idempotent** | Asking again with the same bookmark returns the same next page. A retry does not skip a fact or invent a second copy. |
| **Slug** | The short name of a company or a customer bet, such as `alpha`. |
| **Debounce** | When several facts happen close together, send one bundled notice instead of a burst. |
| **Backoff** | After a failed delivery, wait longer before each retry. |

## What this is

A per-person list of team activity on companies that person can already open.

The list is for agents. A person can read the same facts. The list does not create a new audience.

## What stays out

- Path 1 stays the front door: point an AI at the public repo, no account, no event feed.
- This page does not Advance, Iterate, Hold, or Kill a board. Comments still do not move a gate.
- This host still does not send mail. Invite mail stays a queue for the pirin.ai mailer, as in [Invite](../mcp/docs/INVITE.md).
- Scores stay labels. A score change is not an Advance.
- Push wakes for ordinary inbound messages stay off. The decision is below.

## The story the first slice must pass

1. `founder@example.test` is on company **alpha** and invites `teammate@example.test`.
2. The inviting agent later asks for events since its bookmark.
3. The list shows that she opened the invite, accepted it, and read the alpha board card.
4. The same list has no **bravo** row and no **charlie** row.
5. The agent does not re-read the whole board on an hourly timer to learn those three facts.

## Event catalog

The raw list from the request is grouped below. **Must-have** is the first slice. **Later** waits for a signal we do not have, or is too noisy to treat as urgent.

Every event the caller is allowed to see carries the same base fields:

| Field | What it holds |
|-------|----------------|
| `id` | Stable id for this one fact. A retry returns the same id. |
| `type` | The name in the tables below. |
| `company` | Company slug the caller can already open (`alpha` in the story). |
| `idea` | Idea slug when the fact is about one customer bet. Empty when the fact is about the company only. |
| `at` | When it happened, in UTC. |
| `who` | The person who did it, already visible to this caller on that company. |
| `summary` | One short sentence, 80 characters or fewer. Same cap as today’s board notice in [Journey](../mcp/docs/JOURNEY.md). |
| `cursor` | The bookmark to pass on the next read. |

An event never carries an invite token, a password, a sign-in token, a webhook address, or a signing secret. It never carries a private personal detail the caller cannot already see on that company.

### Invites

People who may see these: members of that company who can already send or see that invite. The invitee’s own feed starts after they accept. Until then they still get the invite mail and the accept card they already get. This list does not replace that mail.

“Opened” means the sign-in page checked a still-valid invite, or the invitee showed the accept card in chat. A loaded mail image is not “opened.” We do not tell the inviter whether that address already has an account. [Invite](../mcp/docs/INVITE.md) already forbids that.

| Event | Must-have or later | Extra fields | Notes |
|-------|--------------------|--------------|-------|
| Invite sent | Must-have | invitee address the inviter already typed; company | Recorded when `invite_member` succeeds. |
| Invite opened | Must-have | invitee address; company | The definition of opened is above. |
| Invite accepted | Must-have | invitee address; company | The teammate joined that company. |
| Invite expired | Must-have | invitee address; company; `expiredAt` | Invites already last 7 days. |
| Invite about to expire | Must-have | invitee address; company; `expiresAt` | One reminder, 1 day before expiry. |
| Invite resent | Must-have | invitee address; company | A new invite replaced the pending one for that person and company. The old link is dead. The event has no token. |
| Invite revoked | Later | invitee address; company | There is no revoke-invite action yet. Record this when that action exists. |
| Invite delivered or bounced | Later | invitee address; company; `delivery` (`delivered` or `bounced`) | This host only queues mail. Record this only when the mailer reports it. Do not guess. |

### Membership

People who may see these: members who can already see that company’s team. The new member can see their own first access and first card read after they are in.

| Event | Must-have or later | Extra fields | Notes |
|-------|--------------------|--------------|-------|
| First access by a new member | Must-have | company | First time that sign-in opens this company. |
| First board-card read | Must-have | company; idea when they opened one bet | First “Where are we?” read after they join. If accept and the first read are the same moment, store both facts with the same time. |
| Access-list role change | Must-have | company; previous role; new role | Roles already on the board access list: founder, founder-authorized, advisor. Visible to people who can already see that list. |
| Removal from the company | Must-have | company | Someone lost access. Pull only. |
| Job-title role beyond that list | Later | — | [Invite](../mcp/docs/INVITE.md) keeps a richer role for later. Do not invent one here. |

### Board activity

People who may see these: anyone who can already open that company board (the same people who can call `get_journey` today).

Bill’s existing board watch already sends **one** notice for a journey edit (`put_journey`), a comment (`post_comment`), and a gate move (`gate_event`). Those three stay one notice. This feed records them for pull. It does not send a second wake. See [Bill’s watch](#bills-existing-watch).

| Event | Must-have or later | Extra fields | Notes |
|-------|--------------------|--------------|-------|
| Comment | Must-have | company; idea; comment id; summary of the text the caller can already read | The comment text is only what that caller can already read on the board. |
| @mention | Later | company; idea; comment id; who was named | Comments have no mention field today. Do not scan comment text for “@” in the first slice. Until then, a comment is one comment event. |
| Bottleneck change | Must-have | company; idea; the new bottleneck sentence the caller can already read | A journey edit. Bill’s watch already wakes once. |
| New idea or customer bet | Must-have | company; idea slug and name | `create_idea`. Today’s watch does not send this. Pull only in the first slice. |
| Advance or other clock move | Must-have | company; idea; gate (`Advance`, `Iterate`, `Hold`, or `Kill`); the short why already stored | Founder labels only. The feed does not invent a gate. |
| Kill | Must-have | company; idea; the stored why | Included with clock moves. Kill stays a founder decision. |
| Shelve | Must-have, as **Hold** | company; idea | The founder word is Hold. This page does not add a new gate named shelve. |
| Other journey edits | Later | company; idea; summary | Field tweaks that are not a bottleneck change, a new bet, or a gate. Digest only. |
| Score change | Later | company; idea; impact; evidence; leverage; the short why already stored | Digest only. A score cannot Advance or Kill. Today a score-only write does not wake Bill. Keep that. |

### Engagement

| Event | Must-have or later | Extra fields | Notes |
|-------|--------------------|--------------|-------|
| Pending invite never opened | Must-have | invitee address; company; age in days | One reminder to the inviter when the invite is still unopened after 2 days. |
| Member inactive for N days | Later | company; who; `inactiveDays` | Proposed N is 14, counted from the last board read or write. No push. Confirm N before any build. |

## Preferences, per subscriber

A subscriber is the signed-in member. An agent uses that member’s sign-in. There is no second identity for the agent.

Each subscriber sets, for themselves:

| Choice | Options | Default |
|--------|---------|---------|
| Which events | Any row in the catalog, by group (invites, membership, board, engagement) or by single type | Must-have types on. Later types off. |
| Instant or digest | **Instant:** the fact is on the next pull, and it may push only if it is in the capped push set and push is on. **Digest:** the fact is stored the same way, and it is not pushed. A digest read groups facts since the last digest bookmark. | Instant for the must-have invite and first-read types. Digest for later and for other journey edits. |
| Channel | **Pull** (always available for types they turned on). **Push** (opt-in, capped types only). **Email digest** (later; this host does not send it). | Pull on. Push off. Email off. |

A founder does not change another member’s choices. If a member’s choices are missing, push stays off and pull returns that member’s must-have types for companies they can open.

Turning a type off hides it from that subscriber’s feed. It stays available to a teammate who left it on.

## How agents receive events

### Decision on 2026-09-30

A product decision on 2026-09-30 rejected push wakes for inbound messages. The reason is spam and denial-of-service risk: a flood of messages could ring agents until they cannot work.

**Pull is the recommended zero-setup default for a template install. Push is an optional upgrade.**

A Bill routine that is already signed in polls the feed. That needs no routine panel and no copied key. Ordinary comments, journey edits, scores, and inbound chatter do not wake an agent. The agent asks (`list_events`) or reads a digest. A founder who wants faster delivery can add webhook push later, after a one-time copy. See [Webhook auto-registration](#webhook-auto-registration).

### Default: pull

An authenticated tool, `list_events`, reads **this caller’s** feed. For a template install this poll is the whole setup: `list_events since <cursor>`, on the member’s existing sign-in.

```text
list_events since <cursor>
```

| Property | Requirement |
|----------|-------------|
| Whose feed | The signed-in caller only. |
| Scope | One company when the caller names one. With no company, only companies that caller can already open, each event labeled with its company. |
| Cheap | Returns new facts since the bookmark. It does not return the whole board. |
| Ordered | Oldest first, then by `id` when times match. |
| Idempotent | The same bookmark returns the same next page until new facts exist. A retry does not skip or invent rows. Each `id` appears once in that page. |
| Bookmark | The reply includes the next cursor. The caller stores it and passes it next time. |
| Retention | **30 days.** After that the fact is gone. |
| Old bookmark | A cursor older than 30 days returns a gap flag, `retainedFrom` (the oldest kept time), and the kept page. The gap is visible. The page is still only companies the caller can open. |
| Empty | No new facts returns an empty page and the same cursor. Empty is a real answer. |
| Refusal | Signed out, unknown, or not on that company: HTTP 401 or 403, or an empty body. A mistyped slug returns empty. It does not fall through to a different company. |

The first call, with no cursor, starts at “now” (no backfill) unless the caller passes `retainedFrom` to read the kept window. Backfill is opt-in so a new subscriber is not flooded.

This tool is a read. It does not move a clock, post a comment, or send mail.

The decision log stays `list_provenance` for someone who asks for the audit. `list_events` is the shorter “since I last looked” list, including invite and first-read facts the inviting agent cannot get from a board re-read without polling.

### Optional push (capped)

Push is an upgrade for a founder who wants faster delivery and will do the one-time copy in [Webhook auto-registration](#webhook-auto-registration). It stays off until that copy succeeds and the test ping returns a success code. Even then, only three types may push:

1. Member accepted.
2. First access.
3. Comment or @mention.

@mention pushes wait until the mention event exists (see the catalog). Until then, the third type is comment, and only for a routine that is **not** already Bill’s board watch (next section).

Each push is a signed notice to that subscriber’s own webhook URL:

| Control | Requirement |
|---------|-------------|
| Address | HTTPS only (the address starts with `https://`). The founder copies it once from the routine panel into a masked input. It does not go into the chat transcript. The agent cannot read it from the panel. |
| Signature | A header the routine can check. The signing secret is not in the notice, the pull feed, or the decision log. |
| Which events | The three types above, and only if that subscriber set them to instant and turned push on. |
| One delivery | One event id is posted once to that routine (retries of the **same** id are allowed; a second routine copy is not). |
| Debounce | Facts for the same subscriber inside 2 minutes fold into one notice that lists their ids. |
| Rate limit | At most 10 push notices per subscriber per hour. Anything past the cap stays on the pull feed. |
| Retry | Up to 3 tries. Waits of 1 minute, then 5 minutes, then 15 minutes. Then stop. The fact remains on the pull feed. A failed push does not undo the board. |
| Unsubscribe | One action. It stops further pushes immediately. Pull still works. |
| Body | The same fields as the pull event. No token, no secret, no other company’s rows. |

Those caps are the requirement for the first build. Whether the numbers should move is an open question, not a reason to drop the caps.

### Bill’s existing watch

Bill (the invited helper agent) already has a board watch. An agent turns it on with `enable_board_watch` after an invite. The operator sets Bill’s listen address once. Founders never paste that address. The contract is [Journey — Board watch](../mcp/docs/JOURNEY.md#board-watch-bill).

That watch already posts one notice when someone edits the journey, posts a comment, or moves a gate.

This work does not add a second wake for those same writes.

| Fact | What happens |
|------|----------------|
| Journey edit, comment, or gate move, and Bill’s watch is on | One post, to the existing watch. The pull feed still records it. No second post to a new address for that same routine. |
| Comment push for anyone whose routine **is** that watch | Off. They already get the comment wake. |
| Invite opened, accepted, first access, first card read | Not on the watch today. They are on the pull feed. |
| Member accepted, or first access, for a subscriber who opted into push | One capped push. If the routine is Bill’s existing address, it is one new notice on that same address, not a copy of a journey wake. |
| Score-only write | No wake today. Stays no wake. |

One fact, one wake, per routine.

## Webhook auto-registration

### The gap

A Grok Bot agent can create a routine. It cannot read that routine’s webhook address or key. Only the human sees them, in the routine panel.

`subscribe_board` today takes a listen address (`webhookUrl`) and no key. A Grok Bot routine’s address requires a header `Authorization: Bearer <key>`: the word Bearer, then a secret key. A board push that omits that header is rejected.

### Recommended default: pull, nothing to copy

For a template install, use the signed-in pull feed. A Bill routine that is already signed in polls `list_events since <cursor>`. That is the zero-setup path: no routine panel, no address, and no key.

Webhook push is an optional upgrade for a founder who wants faster delivery and will do the one-time copy below. Until that copy is done, push stays off. Pull still answers.

### Recommendation: new tool `register_webhook`

Add `register_webhook` for that optional upgrade. Leave `subscribe_board` as an address-only grant.

`subscribe_board` is operator furniture, and the notices on that path are the existing broad watch (a journey edit, a comment, a gate move). The upgrade is a different path: the capped events already in this page (member accepted, first access, and comment or mention), with the routine key stored encrypted on this registration only. One tool stores the key, so the key does not grow a second field on the broad watch.

### One-time founder copy

`register_webhook` requires the founder to copy two fields from the routine panel, once:

1. The routine’s webhook address.
2. The routine’s key.

The agent cannot supply them. It cannot read the panel. The founder pastes them into a masked input, so the characters stay hidden. They do not go into the chat transcript.

The company is one the signed-in member can already open. Example: `founder@example.test` on **alpha** supplies that copy’s address and key for alpha. The same call for **bravo**, when this login is not on bravo, is refused. **charlie** is untouched.

### What is stored

The server stores the key encrypted. No response echoes it. No log line contains it. The pull feed, the decision log, and a failed-ping reason omit it.

The founder rotates the key by copying a new one into the same masked input. The new key replaces the old one, and the old one is dropped. The founder revokes it: pushes to that routine stop, and the key is dropped. Rotate and revoke take effect immediately.

### Test ping before active

On register, and again on rotate, the server sends one test ping to that address. The ping carries the Authorization header and Bootstrap’s own payload signature. The subscription is marked active only after the routine answers with a success code in the 200–299 range (called 2xx).

Any other answer, or no answer, leaves the subscription inactive and returns a clear reason. The reason names the failure (refused, timed out, or a non-success code). It does not include the key, the signature secret, or another company’s rows. An inactive registration sends no later push. The pull feed still works.

### Both checks on every push

Each later push to that routine sends both headers. They are independent. One does not stand in for the other.

| Header | Who it satisfies |
|--------|------------------|
| `Authorization: Bearer <key>` | The routine, which rejects a call that lacks its key. The key is read from the encrypted store at send time. |
| Bootstrap’s payload signature | The routine, which can check the notice came from Bootstrap. |

If either value is missing, do not send. A failed send does not mark the board write as failed. The fact stays on the pull feed.

### Beside the pull feed

The pull feed is the default and keeps working when push is off, inactive, or revoked. `list_events` still answers. Pushes from this registration stay capped to the high-value events already listed. The 2026-09-30 decision still holds: ordinary inbound messages do not wake an agent.

### External dependencies

A Grok Bot platform capability, outside Bootstrap OS: an agent can hand its own routine webhook (the address and the key) to a trusted connector securely, so the human does not copy them from the routine panel.

Bootstrap OS does not control that capability and does not build it here. Until it exists, the one-time founder copy above is the path.

### Today’s manual pin, and the open decision

Today an operator, the Chief of Staff bot (called Cos in the board contracts), pins subscriptions with a manual production database command (SQL, run by hand). This page does not run that command, and it does not change production.

Whether **founder-assisted registration** removes that manual step is **not decided**. Founder-assisted means the founder copies the routine address and key once into the masked input, for a company they already belong to. It does not mean the agent reads the routine panel.

Proposal, for that later decision: **yes, for members of that company only.** A caller who is not on the company is refused (fail closed). Each register, rotate, revoke, and failed ping writes an audit row with who, which company, and the action. The audit row omits the key and the listen address, matching today’s subscriber audit, which already leaves the live address off the decision log.

The question is listed under Open questions.

## Security and privacy

- Invite-only. A signed-out caller, a stranger, and a member of another company get a refusal or an empty body.
- Per company. An event is stored and returned under the company it belongs to.
- No cross-company leak. A caller on alpha receives alpha. Bravo and charlie stay in their own companies.
- Fail closed. A bad cursor, a missing sign-in, a typo slug, or an unknown company returns empty or 401/403. It never returns “the nearest” company.
- The feed shows facts the caller can already see by opening that company or the invite they sent. It is a faster list, not a new window.
- Invite tokens stay off the feed. The accept card may still show a token once, as [Invite](../mcp/docs/INVITE.md) already says. The event row does not.
- Webhook addresses, signing secrets, and routine Bearer keys stay off the feed, off the decision log, and out of logs. Today’s subscriber audit already omits the live webhook address. Keep that. A read never echoes a stored key.
- Fixture companies in tests and in this page are alpha, bravo, and charlie only.

### Leak tests the build must include

These tests land with the implementation pull request, not this one. Pattern to extend: [cross-tenant leak test](../mcp/test/cross-tenant-leak.test.mjs). Run them on an isolated test database (the current suite uses an in-process database). No production probe.

1. A member of **alpha** calls `list_events` for alpha. The page includes alpha invite, accept, and first card-read facts, and no bravo or charlie fact.
2. The same member calls `list_events` for bravo. The answer is 401, 403, or empty.
3. A member of alpha and bravo who asks for alpha gets alpha only. Each event is labeled. Asking with a mistyped slug returns empty.
4. A signed-out caller and a stranger get 401, 403, or empty on `list_events`, including a typo slug and an idea slug.
5. No returned row contains an invite token (`inv_`), a password, a sign-in token, a webhook address, a signing secret, or a routine Bearer key.
6. A push for an alpha accept is signed, goes only to that alpha subscriber’s address, and includes no bravo field.
7. With Bill’s watch on, one comment produces one watch post, not two.
8. `founder@example.test` on **alpha** registers a routine for alpha. The same login registering or reading a routine for **bravo** is refused or empty. A bravo key never appears in an alpha response. **charlie** is absent from both.

## Acceptance criteria

The implementation pull requests on 2026-10-01 are done when all of the following hold.

1. The alpha story passes: the inviting agent sees opened, accepted, and first card read through one `list_events` call, without an hourly full-board read.
2. Pull is authenticated, per subscriber, ordered, idempotent, and limited to the 30-day window. An expired cursor returns a visible gap plus the kept page.
3. Defaults match the preference table: pull on, push off, later types off, digest for noisy edits.
4. A subscriber can change which events, instant versus digest, and channel, for themselves.
5. Push, when on, is limited to member accepted, first access, and comment or mention, with signature, debounce, the rate limit, retry and backoff, and an unsubscribe that stops pushes immediately.
6. Bill’s existing watch is still one wake for journey edits, comments, and gate moves.
7. The 2026-09-30 decision holds: inbound messages do not push-wake an agent.
8. The leak tests above pass on alpha and bravo.
9. No event, log line, or decision-log row from this feature contains a token or a signing secret.
10. Mail is still not sent from this host. A digest does not invent a stage or an Advance.
11. Secret never returned or logged: a test registers, rotates, revokes, lists, and fails a ping for `founder@example.test` on **alpha**. The Bearer key is absent from every response, the pull feed, the decision log, and logs.
12. Cross-company isolation: that alpha registration is invisible from **bravo**. A bravo member cannot rotate or revoke the alpha key. **charlie** is untouched.
13. Rotate and revoke: after rotate, delivery uses the new key and the old key is gone. After revoke, the subscription is inactive and later pushes do not send the key. Neither call returns the key.
14. Test-ping gate: a non-2xx answer or no answer leaves the subscription inactive with a clear reason and sends no later push. A 2xx answer is what marks it active.
15. Zero-setup default: a template install on **alpha**, signed in as `founder@example.test`, answers the invite story by polling `list_events since <cursor>`. No webhook address and no key are required. Push stays inactive.
16. Founder-assisted register: `register_webhook` requires the routine address and the Bearer key as founder-supplied inputs through a masked input. The agent has no field it can fill from the Grok routine panel. The chat transcript does not contain them.

This requirements pull request is done when this page is linked from the roadmap, marked Proposed, and contains no code, schema, or migration.

## Open questions

1. Is 30 days the right retention, or should invite facts live longer than board chatter?
2. Is “1 day before expiry” and “unopened after 2 days” the right pair of reminders, or one reminder only?
3. Is 14 days the right “inactive” gap, and does a board read count as active?
4. Should the first `list_events` with no cursor stay “from now,” or should a new subscriber see the last day?
5. Are the push caps (2-minute fold, 10 per hour, 3 retries) the right caps?
6. When accept and the first card read happen in one call, is storing both facts at the same time what the inviting agent wants to see?
7. Should “opened” stay “sign-in page checked the invite, or the accept card was shown,” and stay free of mail-image tracking?
8. Email digest is later and would be sent by pirin.ai, not this host. Do we want that channel at all?
9. May a company founder turn push off for the whole company, or only each member for themselves?
10. When a mention field exists, who sees the mention event: the named person, or everyone who can already read the comment?
11. Does founder-assisted `register_webhook` (the founder copies the routine address and key once into the masked input) remove the Chief of Staff bot’s manual production database pin for members of that company only? Proposal: yes, members of that company only, fail closed, audit-logged, with the key and the listen address omitted from the audit row. Not decided on this page.
12. When Grok Bot lets an agent hand its own routine webhook (address and key) to a trusted connector, does the one-time founder copy retire? That capability is outside Bootstrap OS. Until it exists, the founder copy stands.

## Related

- Maintainer roadmap: [ROADMAP.md](../ROADMAP.md)
- Invite and accept: [mcp/docs/INVITE.md](../mcp/docs/INVITE.md)
- Board watch and the current notice shape: [mcp/docs/JOURNEY.md](../mcp/docs/JOURNEY.md)
- Leak-test pattern: [mcp/test/cross-tenant-leak.test.mjs](../mcp/test/cross-tenant-leak.test.mjs)

/** Founder-facing copy for the hosted MCP pin. No Cursor, Path 3, or protocol jargon. */

export const BOOTSTRAP_BILL_URL = "https://x.ai/bot/NfURVcmf2bx9QyoljkJ7Y"

export const HOSTED_BILL_GROK_LINE =
  "If this chat is Grok Bot, Bootstrap Bill is the install template: https://x.ai/bot/NfURVcmf2bx9QyoljkJ7Y. Other clients ignore that. This connector is still the board."

export const HOSTED_MCP_INSTRUCTIONS = `You are connected to Bootstrap OS for one signed-in person.

A company is a team (alpha, bravo, charlie). An idea is one 0-1 bet under that company. Clocks, bottleneck, mermaid, and the decision log are per idea. Never blend two ideas into one story or one diagram. Process docs (operating-system, first-hour, clock-examples) are not companies.

To see who is signed in and which companies they can open, call bootstrap_whoami or bootstrap_list_companies.
When the user says where are we, show the company board, show company X ideas, show my idea board, where are we with company X and its ideas, status, a diagram or picture of the journey, the decision log, who did what, the bottleneck, or who is on the team — that is get_journey / bootstrap_where_are_we:
1. Call bootstrap_use_company if no company is active.
2. Call get_journey or bootstrap_where_are_we with company and optional idea (omit idea for every idea under the company).
3. Answer only from the payload. Include visualFlow mermaid so the client can render the journey in whatever style the user prefers. Render the founder-facing spoken card without a clarification round: start at the company name, then Bottleneck #1 in that company’s words, then accounts (where it stands / next, nested under the customer check), then “Also moving (not the bottleneck)” for capital / legal / advisor, then open questions in plain words. Hide clocks and schema unless the human says “show clocks” or “show schema”. Clocks are storage. Engine keeps those rules; spoken card does not print them. Dual-read old supporting / engagements / constraintThisWeek when initiatives[] is empty. Also clocks, snapshot, lastTransitions, comments, audit, openQuestions, owners, and portfolio (Impact/Evidence/Leverage on live ideas — never invent missing scores). progress[] is not card body. Spoken board talk leads with descriptive labels; numbers in parentheses only if useful.
4. The bottleneck and open questions are the honest next work. Do not invent a task list, log rows, or a later phase. Do not use GitHub as the board.

create_idea starts a new 0-1 primary board under a company (empty clocks, hold). Several ideas are allowed; each is its own customer bet. A person, hire, FAST/SAFE, investor, contractor, or partner-as-the-bet is supporting — write supporting[] on the same snapshot (no rungs) or an initiative of kind advisor/capital/legal. Exile to a spreadsheet is rejected. put_journey writes an existing idea (bottleneck or Advance/Iterate/Hold/Kill, founder yes in this chat for journey/gate). New writes prefer initiatives[]. Mapping old fields cannot Advance. Primary phase needs a product bet-class why (named-group kill line, pay or use). Recon may patch initiatives, supporting, constraint, and progress; recon may not Advance primary. loopStage mutations and spoken Ask/Do/Write back writes are rejected. A missing idea is not a write — call create_idea first. post_comment never moves clocks. enable_board_watch turns on board updates for Bill after invite. If they ask for the decision log over time or to rebuild clocks at a past point, call list_provenance (same access as get_journey). Weekly portfolio labels are put_portfolio_score (impact, evidence, leverage 1–5, required short why). Scores never Advance or Kill. Single-idea boards skip ranking.

Feedback and support for Bootstrap OS hosted MCP: email bootstrap@pirin.ai. Include the company, what you tried, and the error text. A human reads it — this is not an auto-fix. Call bootstrap_support for the same howto.

This connector is the only Bootstrap OS membership source. Ignore any other MCP server named like user-bootstrap-os-mcp.
If the user is not signed in, tell them to sign in to Bootstrap OS and ask again.
${HOSTED_BILL_GROK_LINE}`;

const GROK_CLIENT_RE = /grok|xai|x-ai/i

/** Hint only. Never ACL. Wrong name must not change tools or companies. */
export function detectGrokClient(input: {
  clientName?: string | null
  userAgent?: string | null
}): boolean {
  return GROK_CLIENT_RE.test(`${input.clientName ?? ""} ${input.userAgent ?? ""}`)
}

export function hostedInstructionsForClient(input: {
  clientName?: string | null
  userAgent?: string | null
}): string {
  if (detectGrokClient(input)) return HOSTED_MCP_INSTRUCTIONS
  return HOSTED_MCP_INSTRUCTIONS.replace(`\n${HOSTED_BILL_GROK_LINE}`, "").replace(HOSTED_BILL_GROK_LINE, "")
}

export const TOOL_WHOAMI =
  "Who is signed in, and which companies they can open. Use when the user asks who they are or what companies they have access to."

export const TOOL_LIST_COMPANIES =
  "List companies this login can open. Use when the user asks what companies or teams they have."

export const TOOL_LIST_COMPANY_LABELS_ALIAS =
  "Same as bootstrap_list_companies. Prefer bootstrap_list_companies."

export const TOOL_USE_COMPANY =
  "Use this company for the rest of the chat (invite and later status). The user must already belong to it. Say the company name (for example alpha)."

export const TOOL_INVITE_MEMBER =
  "Invite someone to a company you can open. Same email can join more than one company. Pass company unless you already called bootstrap_use_company."

export const TOOL_ACCEPT_INVITE =
  "Join a company with the one-time invite token. Uses the signed-in email. Same person, additional company — not a second login."

export const NOTE_COMPANIES =
  "Companies this login can open. A company may have several ideas; each idea is its own 0-1 board."

export const NOTE_NOT_SIGNED_IN = "You're not signed in to Bootstrap OS."

export const TOOL_GET_JOURNEY =
  "Where are we — the company board and ideas under it (separate boards). Use when the user says where are we, show the company board, show company X ideas, show my idea board, or similar. Render the founder-facing spoken card without a clarification round: start at the company name, then Bottleneck #1 in that company’s words, then accounts (where it stands / next, nested under the customer check), then “Also moving (not the bottleneck)” for capital / legal / advisor, then open questions in plain words. Hide clocks and schema unless the human says “show clocks” or “show schema”. Clocks are storage. Engine keeps those rules; spoken card does not print them. Returns card, clocks, snapshot, visualFlow mermaid, decision log, bottleneck, open questions, owners, and portfolio scores. Dual-read old supporting / engagements / constraintThisWeek. Omit idea for every idea under the company. Uses the active company if already chosen. Do not invent a stage, log rows, or missing scores. progress[] is not card body. Do not use GitHub as the board. Spoken or rendered summary should lead with descriptive labels; numbers in parentheses."

export const TOOL_CREATE_IDEA =
  "Start a new 0-1 primary idea board under a company this login can open. Empty clocks (Write the bet, hold). Ask / Do / Write back is a quality bar, not a card. A person, hire, or instrument as the primary object is supporting — not a 5-rung card. Several ideas are allowed; each idea is its own customer bet. Needs an explicit founder yes in this chat. Then put_journey writes that idea."

export const TOOL_PUT_JOURNEY =
  "Update an existing 0-1 idea board (phase, gate, bottleneck this week) or patch initiatives[]. New slugs: create_idea first. Primary phase needs a named-group kill line (pay or use) and an explicit founder yes, why, whatChanged, and whatWereNotDoing. New writes prefer initiatives[]. Dual-read old supporting / engagements / constraintThisWeek. Recon may patch initiatives, constraint, and progress; recon may not Advance primary. Mapping cannot Advance. loopStage mutations and spoken Ask/Do/Write back writes are rejected. Kill also requires a postmortem: lessonsLearned and actionableInsights."

export const TOOL_POST_COMMENT =
  "Comment on an idea. Comments never move phase or gate."

export const TOOL_ENABLE_BOARD_WATCH =
  "Turn on board updates for Bill. Founder or founder-authorized. Gated."

export const TOOL_LIST_PROVENANCE =
  "Decision log over time — audit before/after plus gate events so you can rebuild clocks and scoreboard at a point in range. Same access as get_journey."

export const TOOL_PUT_PORTFOLIO_SCORE =
  "Weekly Impact / Evidence / Leverage labels (integers 1–5) plus a required short why (≤280) on one live idea. Applies when the company has two or more live (non-kill) ideas; otherwise skips. Founder yes in this chat. Scores are labels — they never Advance or Kill. Same write ACL as put_journey."

export const NOTE_OS_INFO_HOSTED =
  "Process docs, house rules, and a shared 0-1 board per company you can open."

/** Same mailbox as Bill / public feedback and invite From. Inbound howto only — MCP does not send mail. */
export const SUPPORT_EMAIL = "bootstrap@pirin.ai";

export const TOOL_SUPPORT =
  "How to send feedback or ask for help with Bootstrap OS hosted MCP. Email bootstrap@pirin.ai. Returns what to include. Human-routed, not an auto-fix.";

export const SUPPORT_HOWTO = {
  email: SUPPORT_EMAIL,
  include: ["company", "what you tried", "error text"],
  routed: "human-routed, not auto-fix",
  note: "Email bootstrap@pirin.ai for Bootstrap OS hosted MCP feedback and support. Include the company, what you tried, and the error text. A human reads it — this is not an auto-fix. Do not send customer lists or secrets.",
} as const;

export const NOTE_INVITE_SENT =
  "They'll get an email at that address. They must sign in as that email, then accept the invite in their chat. You can also send them the sign-in link."

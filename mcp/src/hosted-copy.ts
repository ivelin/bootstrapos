/** Founder-facing copy for the hosted MCP pin. No Cursor, Path 3, or protocol jargon. */

export const BOOTSTRAP_BILL_URL = "https://x.ai/bot/NfURVcmf2bx9QyoljkJ7Y"

export const HOSTED_BILL_GROK_LINE =
  "If this chat is Grok Bot, Bootstrap Bill is the install template: https://x.ai/bot/NfURVcmf2bx9QyoljkJ7Y. Other clients ignore that. This connector is still the board."

/** What a founder should hear when this connector is introduced, then the live board. */
export const FOUNDER_INTRO =
  "The same connection covers every team you belong to. Each company is one team. Ideas under that company are the customer bets. The board shows who you are betting on, what is stuck this week, and what you already decided.\n\nIt exists to keep the founder, the team, supporters, and the AI agents aligned and grounded.\n\nYou can ask: Where are we? Which companies can I open? What is stuck this week? What did we already decide?"

export const HOSTED_MCP_INSTRUCTIONS = `You are connected to Bootstrap OS for the signed-in person.

How you talk. They are not an engineer. On the first message, and whenever they ask what this is or what it can do, say this and then show the live board:

${FOUNDER_INTRO}

Live bets only. Do not offer a stopped bet. Do not mention local install, self-host, or a numbered path table.

Which companies: the same connection already includes every company they can open. Say the names in one sentence. Do not print email, role, or a table. If they can open one company, open it and print the spoken field. If they can open more than one, ask which company by the name they already use. Do not invent a sample company.

When they name one company, or ask where are we, show the company board, show company X ideas, or show my idea board: Print spoken first. Call get_journey or bootstrap_where_are_we and print the spoken field.
All boards: print the boards field and stop. A live board is its name and what is stuck. Do not mention a stopped bet unless they ask what you already stopped.

The same sign-in can belong to more than one team and open more than one company. A company is the team. Ideas under that company are the customer bets.

To see who is signed in, call bootstrap_whoami or bootstrap_list_companies. Say the company names.

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
  "Who is signed in, and which companies they can open. The same connection covers every team they belong to. Each company is one team. Ideas under that company are the customer bets. When they ask which companies, say the names in one sentence. Do not print email, role, or a table."

export const TOOL_CREATE_COMPANY =
  "Create a company on this hosted board. Super admin only. Needs founder yes in this chat and a short why. Does not create an idea — call create_idea next. A duplicate name is refused. If this is refused, ask an admin or email bootstrap@pirin.ai."

export const TOOL_GRANT_SUPER_ADMIN =
  "Grant super admin to someone who already has a login. Live super admin only. You cannot grant it to yourself."

export const TOOL_REVOKE_SUPER_ADMIN =
  "Revoke super admin immediately. Live super admin only."

export const TOOL_LIST_COMPANIES =
  "Companies this login can open. The same connection covers every team they belong to. Each company is one team. Ideas under that company are the customer bets. Say the names in one sentence. Do not print email, role, or a table."

export const TOOL_LIST_COMPANY_LABELS_ALIAS =
  "Same as bootstrap_list_companies. Prefer bootstrap_list_companies."

export const TOOL_USE_COMPANY =
  "Use this company for the rest of the chat (invite and later status). The user must already belong to it. Say the company name they already use."

export const TOOL_INVITE_MEMBER =
  "Invite someone to a company you can open. Same email can join more than one company. Pass company unless you already called bootstrap_use_company."

export const TOOL_ACCEPT_INVITE =
  "Join a company with the one-time invite token. Uses the signed-in email. Same person, additional company — not a second login."

export const NOTE_COMPANIES =
  "Companies this login can open. The same connection covers every team they belong to. Each company is one team. Ideas under that company are the customer bets. Say the names in one sentence. Do not print email, role, or a table."

export const NOTE_NOT_SIGNED_IN = "You're not signed in to Bootstrap OS."

export const TOOL_GET_JOURNEY =
  "Where are we — the company board, or one idea board under it. The same connection covers every team they belong to. Each company is the team. Ideas under that company are the customer bets. Print spoken first. Use this when they say where are we, show the company board, show company X ideas, or show my idea board. If they ask for every board, print the boards field and stop. Live boards only. Do not describe a stopped bet unless they ask what you already stopped."

export const TOOL_CREATE_IDEA =
  "Start another customer bet under a company this login can open. Needs a yes in this chat."

export const TOOL_PUT_JOURNEY =
  "Change what is stuck on an existing bet, or record a decision they already made. Needs a yes in this chat before a decision changes."

export const TOOL_POST_COMMENT =
  "Comment on an idea. A comment does not change the bet."

export const TOOL_ENABLE_BOARD_WATCH =
  "Turn on board updates for Bill. Founder or founder-authorized. Gated."

export const TOOL_LIST_PROVENANCE =
  "What already changed, when they ask. Same access as get_journey."

export const TOOL_PUT_PORTFOLIO_SCORE =
  "Weekly labels on one live bet when the company has two or more. Needs a yes in this chat and a short why. Labels do not decide the bet."

export const NOTE_OS_INFO_HOSTED =
  "The board for each company this person can open. The same connection covers every team they belong to. Each company is one team. Ideas under that company are the customer bets."

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
  "They'll get an email at that address. Tell them to open it on their agent's computer, fill Email and Password on the form card in the chat, press Continue, then Accept invite. You can also send them the sign-in link."

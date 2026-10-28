/** Founder-facing copy for the hosted MCP pin. No Cursor, Path 3, or protocol jargon. */

export const BOOTSTRAP_BILL_URL = "https://x.ai/bot/NfURVcmf2bx9QyoljkJ7Y"

export const HOSTED_BILL_GROK_LINE =
  "If this chat is Grok Bot, Bootstrap Bill is the install template: https://x.ai/bot/NfURVcmf2bx9QyoljkJ7Y. Other clients ignore that. This connector is still the board."

/** What a founder should hear when this connector is introduced, then the live board. */
export const FOUNDER_INTRO =
  "The same connection covers every team you belong to. You can open more than one company on it. Each company is one team. Ideas under that company are the customer bets. The bet board shows who you are betting on, what is stuck this week, and what you already decided.\n\nIt exists to keep the founder, the team, supporters, and the AI agents aligned and grounded.\n\nYou can ask: Where are we? Which companies can I open? What is stuck this week? What did we already decide?"

export const HOSTED_MCP_INSTRUCTIONS = `You are connected to Bootstrap OS for the signed-in person.

How you talk. They are not an engineer. On the first message, and whenever they ask what this is, say only the paragraph below and then show the live bet board. Stop there.

${FOUNDER_INTRO}

Live bets only. Do not offer a stopped bet. Do not mention local install, self-host, or a numbered path table.

Which companies: the same connection already includes every company they can open. Say the names in one sentence. Do not print email, role, or a table. If they can open one company, open it and print the spoken field. If they can open more than one, ask which company by the name they already use. Do not invent a sample company.

When they name one company, or ask where are we, show the bet board, show company X ideas, or show my idea board: Print spoken first. Call get_journey or bootstrap_where_are_we and print the spoken field.
All boards: print the boards field and stop. A live board is its name and what is stuck. Do not mention a stopped bet unless they ask what you already stopped.

To see who is signed in, call bootstrap_whoami or bootstrap_list_companies. Say the company names.

Feedback and support for Bootstrap OS hosted MCP: call submit_feedback after a yes in this chat. Email bootstrap@pirin.ai if you cannot file it here. Include the company, what you tried, and the error text. A human reads it — this is not an auto-fix. Call bootstrap_support for the same howto.

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
  "Who is signed in, and which companies they can open. When they ask which companies, say the names in one sentence. Do not print email, role, or a table."

export const TOOL_CREATE_COMPANY =
  "Open a bet board. A confirmed account can open up to 3. A super admin still uses the admin path. Needs founder yes in this chat. A short why is stored only on the admin path. Does not create an idea — call create_idea next. A duplicate name is refused. If this is refused, ask an admin or email bootstrap@pirin.ai."

export const TOOL_LIST_COMPANIES =
  "Companies this login can open. Say the names in one sentence. Do not print email, role, or a table."

export const TOOL_LIST_COMPANY_LABELS_ALIAS =
  "Same as bootstrap_list_companies. Prefer bootstrap_list_companies."

export const TOOL_USE_COMPANY =
  "Use this company for the rest of the chat (invite and later status). The user must already belong to it. Say the company name they already use."

export const TOOL_INVITE_MEMBER =
  "Invite someone to one or more bet boards you can open. Pass companies with a tier of viewer, commenter, or editor. An omitted tier is viewer. An owner may grant editor. An editor may grant viewer or commenter. A list of zero bet boards still lets them create an account. A starter bet board cannot send invites. Pass company unless you already called bootstrap_use_company."

export const TOOL_ACCEPT_INVITE =
  "Join a bet board with the one-time invite token. Accept only with the invited email. Same person, additional company — not a second login."

export const TOOL_CREATE_STARTER =
  "Open your private starter bet board. One per confirmed signup. No invites. It cannot become a real company."

export const NOTE_COMPANIES =
  "Companies this login can open. Say the names in one sentence. Do not print email, role, or a table."

export const NOTE_NOT_SIGNED_IN = "You're not signed in to Bootstrap OS."

export const TOOL_GET_JOURNEY =
  "Where are we — the bet board, or one idea board under it. Print spoken first. spoken and markdown are the same ready-to-render board. spokenLead is the opening line. Do not rebuild the table. Use this when they say where are we, show the bet board, show company X ideas, or show my idea board. If they ask for every board, print the boards field and stop. Live boards only. Do not describe a stopped bet unless they ask what you already stopped."

export const TOOL_CREATE_IDEA =
  "Start another customer bet under a company this login can open. Needs a yes in this chat."

export const TOOL_PUT_JOURNEY =
  "Change what is stuck on an existing bet, or record a decision they already made. Needs a yes in this chat before a decision changes."

export const TOOL_POST_COMMENT =
  "Comment on an idea. A comment does not change the bet."

export const TOOL_ENABLE_BOARD_WATCH =
  "Turn on board updates for Bill. This watches the bet board and its bet cards. The founder hears when a bet card changes."

export const TOOL_SUBSCRIBE_BOARD =
  "Send updates about this bet board to someone who already belongs to it. Super admin only."

export const TOOL_LIST_PROVENANCE =
  "What already changed on the bet board, when they ask. An owner reads this history."

export const TOOL_PUT_PORTFOLIO_SCORE =
  "Weekly labels on one live bet when the company has two or more. Needs a yes in this chat and a short why. Labels do not decide the bet."

export const NOTE_OS_INFO_HOSTED =
  "The bet board for each company this person can open."

/** Same mailbox as Bill / public feedback and invite From. Inbound howto only — MCP does not send mail. */
export const SUPPORT_EMAIL = "bootstrap@pirin.ai";

export const TOOL_SUBMIT_FEEDBACK =
  "File a bug, a missing piece, confusing output, or a docs gap. The person must say yes in this chat. A person reads it. This does not change the board, and nothing is emailed until they approve.";

export const TOOL_SUPPORT =
  "How to ask for help with Bootstrap OS hosted MCP. Email bootstrap@pirin.ai. Returns what to include. Human-routed, not an auto-fix. To file what went wrong, call submit_feedback.";

export const SUPPORT_HOWTO = {
  email: SUPPORT_EMAIL,
  include: ["company", "what you tried", "error text"],
  routed: "human-routed, not auto-fix",
  note: "Email bootstrap@pirin.ai for Bootstrap OS hosted MCP help. Include the company, what you tried, and the error text. A human reads it — this is not an auto-fix. Do not send customer lists or secrets. To file what went wrong, call submit_feedback.",
} as const;

export const NOTE_INVITE_SENT =
  "They'll get an email at that address. They sign in or create an account as that email, then press Accept invite. After they accept, the bet board shows up for them."

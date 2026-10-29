/**
 * Mutating hosted tools and the audit action each one must write.
 * A tool added to the gated list without a row here fails the snapshot test.
 */

export const READ_ONLY_GATED_TOOLS = [
  "bootstrap_whoami",
  "bootstrap_list_companies",
  "bootstrap_list_company_labels",
  "bootstrap_use_company",
  "get_journey",
  "bootstrap_where_are_we",
  "list_subscribers",
  "list_provenance",
] as const;

export const MUTATING_TOOL_AUDIT = {
  invite_member: "invite.create",
  accept_invite: "invite.accept",
  create_company: "company.create",
  create_starter_board: "board.starter",
  submit_feedback: "feedback.submit",
  create_idea: "card.create",
  put_journey: "card.update",
  post_comment: "comment.create",
  subscribe_board: "board.subscribe",
  unsubscribe_board: "board.unsubscribe",
  enable_board_watch: "board.watch",
  put_portfolio_score: "card.score",
} as const;

export type MutatingTool = keyof typeof MUTATING_TOOL_AUDIT;

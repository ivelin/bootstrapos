---
name: bet-start
description: Start a Bootstrap OS bet. Use when a founder opens a bet or is about to record a gate. Calls the hosted connector. Does not store the method.
min_connector_version: "0.3.5"
min_sop_version: "1.0.0"
plugin_version: "0.1.1"
---

# Bet start

The method lives on the connector. This skill does not copy it.

Set `client` from the app you are running in. Cursor is `cursor`. Claude Code is `claude`. Codex is `codex`. Pass that `client` on every connector call. Do not omit it. Do not invent another value. Sign in with the client OAuth prompt. Do not paste a token.

At the start of a bet, call `bootstrap_get_sop` with name `bet-loop` and `client`. Omit version so the server returns the latest SOP.

This skill requires connector `0.3.5` or newer and SOP `bet-loop` `1.0.0` or newer. Read `mcpVersion` from `bootstrap_os_info` and `version` from `bootstrap_get_sop`. Pass `client` on those calls too. If either value is missing or older than its floor, stop. Say exactly this and then stop: Upgrade required. Update the Bootstrap OS connector before continuing. Do not keep going on the old connector. If the server reports a minimum plugin version newer than `0.1.1`, stop. Say exactly this and then stop: Upgrade required. Update the Bootstrap OS plugin before continuing. Do not keep going on this plugin. There is no fallback.

Call these tools only through the connector, each with `client`: `bootstrap_os_info`, `bootstrap_get_sop`, `bootstrap_list_sops`, `bootstrap_where_are_we`, `get_journey`, `create_idea`, `put_journey`, `post_comment`, `submit_feedback`, `list_provenance`, `put_portfolio_score`. A gate, a score, spend, or outbound contact waits for a yes in this chat. This install has no scheduled check-in.

https://github.com/ivelin/bootstrap

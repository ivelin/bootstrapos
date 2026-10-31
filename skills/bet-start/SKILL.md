---
name: bet-start
description: Start a Bootstrap OS bet in Cursor, Claude Code, or Codex. Use when a founder opens a bet, asks where the board is, or is about to record a gate. Calls the hosted connector. Does not store the method.
min_connector_version: "0.3.5"
min_sop_version: "1.0.0"
plugin_version: "0.1.1"
---

# Bet start

The method lives on the connector. This skill does not copy it.

At the start of a bet, call `bootstrap_get_sop` with name `bet-loop` and omit version. The server then returns the latest SOP. Read that result. Do not paste the SOP into this skill or into the repo.

This skill requires connector `0.3.5` or newer and SOP `bet-loop` `1.0.0` or newer. `bootstrap_os_info` reports `mcpVersion`. `bootstrap_get_sop` reports `version`. If either value is older than its floor, stop and tell the founder to update the connector before continuing. If the server also reports a minimum plugin version newer than `0.1.1`, stop and tell the founder to update this plugin.

Call tools only through the connector. The names are `bootstrap_os_info`, `bootstrap_get_sop`, `bootstrap_list_sops`, `bootstrap_where_are_we`, `get_journey`, `create_idea`, `put_journey`, `post_comment`, `submit_feedback`, `list_provenance`, and `put_portfolio_score`. A gate, a score, spend, or an outbound contact waits for a yes in this chat. The server enforces that yes.

This install has no scheduled check-in. Say that when the founder asks about a weekly run.

Docs, if the connector is down. https://github.com/ivelin/bootstrap

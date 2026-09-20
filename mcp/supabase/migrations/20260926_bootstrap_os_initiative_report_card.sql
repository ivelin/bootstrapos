-- OS 2.8.19 initiative report card (PR0).
-- Adapter (mcp/src/initiative-card.ts) is the gate. initiatives[] live in
-- existing scoreboard jsonb. Dual-read old supporting / engagements /
-- constraint_this_week. No schema bump 1–9 / 1–7. No third clock.
-- Mapping cannot Advance. NDA is not Try. Ask / Do is not a card.
-- Cos applies a comment lock on supabase-pirin-ai after smell.
-- PR agents: file lock only. Do not migrate/seed/live-probe supabase-pirin-ai.
-- Do not write live mentee journeyPhase.

COMMENT ON FUNCTION public.bootstrap_os_put_journey(text, text, text, boolean, int, int, text, text, text, jsonb) IS
  'OS 2.8.19: initiative report card. New writes prefer scoreboard.initiatives[]. Dual-read old supporting / engagements / constraint_this_week. Mapping cannot Advance.';

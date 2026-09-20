-- OS 2.8.18 one founder control plane (primary + supporting + engagements).
-- Adapter (mcp/src/control-plane.ts) is the gate. supporting[] + engagements[]
-- live in existing scoreboard jsonb. No schema bump 1–9 / 1–7. No third clock.
-- Exile to a spreadsheet is rejected. NDA is not Try.
-- Cos applies a comment lock on supabase-pirin-ai after smell.
-- PR agents: file lock only. Do not migrate/seed/live-probe supabase-pirin-ai.
-- Do not write live mentee journeyPhase.

COMMENT ON FUNCTION public.bootstrap_os_put_journey(text, text, text, boolean, int, int, text, text, text, jsonb) IS
  'OS 2.8.18: one founder control plane. Primary phase needs product why. supporting[] + engagements[] in scoreboard jsonb. Recon may not Advance primary.';

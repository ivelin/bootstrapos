-- Weekly Impact / Evidence / Leverage portfolio scores on scoreboard jsonb.
-- Thin: no new table. Reconstructible via audit before/after.
-- Write requires short why (≤280). Stored on portfolioScore and audit what_changed.
-- Scores are founder/advisor labels. OS never auto-promotes / Advance / Kill.
-- Rank live ideas by (impact + evidence + leverage). Never invent on read.
-- Cos applies on supabase-pirin-ai. PR agents: PGlite / file lock only.
-- Do not migrate/seed/live-probe supabase-pirin-ai from a PR cloud agent.

CREATE OR REPLACE FUNCTION bootstrap_os.read_portfolio_score(p_raw jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  src jsonb;
  impact int;
  evidence int;
  leverage int;
BEGIN
  IF p_raw IS NULL OR jsonb_typeof(p_raw) <> 'object' THEN
    RETURN NULL;
  END IF;
  src := p_raw;
  IF src ? 'portfolioScore' AND jsonb_typeof(src->'portfolioScore') = 'object' THEN
    src := src->'portfolioScore';
  END IF;
  BEGIN
    impact := (src->>'impact')::int;
    evidence := (src->>'evidence')::int;
    leverage := (src->>'leverage')::int;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  IF impact IS NULL OR evidence IS NULL OR leverage IS NULL THEN
    RETURN NULL;
  END IF;
  IF impact < 1 OR impact > 5 OR evidence < 1 OR evidence > 5 OR leverage < 1 OR leverage > 5 THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_strip_nulls(jsonb_build_object(
    'impact', impact,
    'evidence', evidence,
    'leverage', leverage,
    'why', left(nullif(trim(coalesce(src->>'why', '')), ''), 280),
    'scoredAt', nullif(trim(coalesce(src->>'scoredAt', '')), ''),
    'scoredBy', nullif(trim(coalesce(src->>'scoredBy', '')), '')
  ));
END;
$$;

CREATE OR REPLACE FUNCTION bootstrap_os.portfolio_score_error(p_raw jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  src jsonb;
  why text;
BEGIN
  IF bootstrap_os.read_portfolio_score(p_raw) IS NULL THEN
    RETURN 'impact, evidence, and leverage must be integers 1–5';
  END IF;
  src := p_raw;
  IF src ? 'portfolioScore' AND jsonb_typeof(src->'portfolioScore') = 'object' THEN
    src := src->'portfolioScore';
  END IF;
  why := nullif(trim(coalesce(src->>'why', '')), '');
  IF why IS NULL THEN
    RETURN 'why required';
  END IF;
  IF char_length(why) > 280 THEN
    RETURN 'why is short text (280)';
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION bootstrap_os.normalize_portfolio_score(
  p_raw jsonb,
  p_scored_by text,
  p_scored_at timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  src jsonb;
BEGIN
  src := bootstrap_os.read_portfolio_score(p_raw);
  IF src IS NULL THEN
    RETURN NULL;
  END IF;
  IF nullif(trim(coalesce(src->>'why', '')), '') IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_strip_nulls(jsonb_build_object(
    'impact', (src->>'impact')::int,
    'evidence', (src->>'evidence')::int,
    'leverage', (src->>'leverage')::int,
    'why', coalesce(src->>'why', ''),
    'scoredAt', coalesce(
      nullif(trim(coalesce(to_char(p_scored_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), '')), ''),
      src->>'scoredAt'
    ),
    'scoredBy', coalesce(nullif(trim(coalesce(p_scored_by, '')), ''), src->>'scoredBy')
  ));
END;
$$;

CREATE OR REPLACE FUNCTION bootstrap_os.portfolio_view(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  live_n int;
  ranked jsonb;
  unscored jsonb;
BEGIN
  SELECT count(*)::int INTO live_n
  FROM bootstrap_os.ideas
  WHERE company_id = p_company_id AND current_gate <> 'kill';
  IF live_n < 2 THEN
    RETURN jsonb_build_object(
      'applies', false,
      'reason', 'portfolio scoring applies when two or more live (non-kill) ideas are on the board',
      'formula', 'impact + evidence + leverage',
      'ranked', '[]'::jsonb,
      'unscored', '[]'::jsonb
    );
  END IF;
  SELECT coalesce(
    jsonb_agg(row_score ORDER BY (row_score->>'total')::int DESC, row_score->>'slug'),
    '[]'::jsonb
  )
  INTO ranked
  FROM (
    SELECT jsonb_strip_nulls(jsonb_build_object(
      'slug', i.slug,
      'name', i.name,
      'impact', (s->>'impact')::int,
      'evidence', (s->>'evidence')::int,
      'leverage', (s->>'leverage')::int,
      'total', (s->>'impact')::int + (s->>'evidence')::int + (s->>'leverage')::int,
      'why', s->>'why',
      'scoredAt', s->>'scoredAt',
      'scoredBy', s->>'scoredBy'
    )) AS row_score
    FROM bootstrap_os.ideas i
    CROSS JOIN LATERAL (
      SELECT bootstrap_os.read_portfolio_score(i.scoreboard->'portfolioScore') AS s
    ) x
    WHERE i.company_id = p_company_id
      AND i.current_gate <> 'kill'
      AND x.s IS NOT NULL
  ) q;
  SELECT coalesce(
    jsonb_agg(jsonb_build_object('slug', i.slug, 'name', i.name) ORDER BY i.slug),
    '[]'::jsonb
  )
  INTO unscored
  FROM bootstrap_os.ideas i
  WHERE i.company_id = p_company_id
    AND i.current_gate <> 'kill'
    AND bootstrap_os.read_portfolio_score(i.scoreboard->'portfolioScore') IS NULL;
  RETURN jsonb_build_object(
    'applies', true,
    'formula', 'impact + evidence + leverage',
    'ranked', ranked,
    'unscored', unscored
  );
END;
$$;

CREATE OR REPLACE FUNCTION bootstrap_os.audit_idea_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bootstrap_os, public
AS $$
DECLARE
  via text := COALESCE(NULLIF(current_setting('app.client', true), ''), 'put_journey');
BEGIN
  -- Single idea-write audit. RPC no longer emit_audit after UPDATE.
  PERFORM bootstrap_os.emit_audit(
    NEW.company_id,
    NEW.id,
    COALESCE(bootstrap_os.actor_principal(), NEW.name),
    via,
    jsonb_strip_nulls(jsonb_build_object(
      'via', via,
      'op', via,
      'journey_phase', NEW.journey_phase,
      'loop_stage', NEW.loop_stage,
      'current_gate', NEW.current_gate,
      'constraint_this_week', COALESCE(NEW.scoreboard->>'constraint_this_week', ''),
      'gate', NEW.current_gate,
      'why', NULLIF(current_setting('app.notify_summary', true), ''),
      'whatChanged', NEW.scoreboard #>> '{gateEnrichment,whatChanged}',
      'whatWereNotDoing', NEW.scoreboard #>> '{gateEnrichment,whatWereNotDoing}',
      'evidenceLinks', NEW.scoreboard #> '{gateEnrichment,evidenceLinks}',
      'lessonsLearned', NEW.scoreboard #>> '{killPostmortem,lessonsLearned}',
      'actionableInsights', NEW.scoreboard #>> '{killPostmortem,actionableInsights}',
      'before', bootstrap_os.idea_board_snapshot(
        OLD.journey_phase, OLD.loop_stage, OLD.current_gate, OLD.scoreboard
      ),
      'after', bootstrap_os.idea_board_snapshot(
        NEW.journey_phase, NEW.loop_stage, NEW.current_gate, NEW.scoreboard
      )
    ))
  );
  -- Score-only writes skip subscriber notify. Weekly poll may read scores later.
  IF COALESCE(NULLIF(current_setting('app.skip_board_notify', true), ''), '') <> 'true'
     AND via <> 'put_portfolio_score' THEN
    PERFORM bootstrap_os.enqueue_board_notify(
      NEW.company_id,
      NEW.id,
      'put_journey',
      COALESCE(bootstrap_os.actor_principal(), NEW.name),
      COALESCE(NULLIF(current_setting('app.notify_summary', true), ''), 'board write')
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.bootstrap_os_get_journey(p_company text, p_idea text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, bootstrap_os AS $$
DECLARE cid uuid; company_row bootstrap_os.companies%ROWTYPE; ideas jsonb; audit jsonb; owners jsonb;
BEGIN
  cid := public.bootstrap_os_ensure_company(p_company);
  SELECT * INTO company_row FROM bootstrap_os.companies WHERE id = cid;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'slug', i.slug, 'name', i.name,
    'clocks', jsonb_build_object('journeyPhase', i.journey_phase, 'loopStage', i.loop_stage, 'currentGate', i.current_gate),
    'constraintThisWeek', coalesce(i.scoreboard->>'constraint_this_week', ''),
    'scoreboard', i.scoreboard,
    'portfolioScore', bootstrap_os.read_portfolio_score(i.scoreboard->'portfolioScore'),
    'gateEnrichment', i.scoreboard->'gateEnrichment',
    'killed', i.current_gate = 'kill',
    'killPostmortem', i.scoreboard->'killPostmortem',
    'killedCard', CASE
      WHEN i.current_gate = 'kill' THEN concat(
        '☠ Killed',
        CASE
          WHEN nullif(trim(coalesce(i.scoreboard #>> '{killPostmortem,lessonsLearned}', '')), '') IS NOT NULL
          THEN concat(' — ', i.scoreboard #>> '{killPostmortem,lessonsLearned}')
          ELSE ''
        END
      )
      ELSE NULL
    END,
    'killedDecision', CASE
      WHEN i.current_gate = 'kill' THEN (
        SELECT jsonb_build_object('who', e.who, 'at', e.at, 'why', e.why)
        FROM bootstrap_os.gate_events e
        WHERE e.idea_id = i.id AND e.action = 'kill'
        ORDER BY e.at DESC LIMIT 1
      )
      ELSE NULL
    END,
    'snapshot', concat(company_row.label, ' / ', i.name, ' is at journey phase ', i.journey_phase::text,
      ', loop stage ', i.loop_stage::text, ', gate ', i.current_gate::text,
      CASE WHEN i.current_gate = 'kill' THEN concat(
        '. ☠ Killed',
        CASE
          WHEN nullif(trim(coalesce(i.scoreboard #>> '{killPostmortem,lessonsLearned}', '')), '') IS NOT NULL
          THEN concat(' — ', i.scoreboard #>> '{killPostmortem,lessonsLearned}')
          ELSE ''
        END
      ) ELSE '' END,
      '. Bottleneck this week: ',
      coalesce(nullif(i.scoreboard->>'constraint_this_week', ''), 'none yet'), '.'),
    'lastTransitions', coalesce((
      SELECT jsonb_agg(jsonb_build_object('at', e.at, 'who', e.who, 'action', e.action, 'why', e.why) ORDER BY e.at)
      FROM bootstrap_os.gate_events e WHERE e.idea_id = i.id
    ), '[]'::jsonb),
    'comments', coalesce((
      SELECT jsonb_agg(jsonb_build_object('at', c.at, 'who', c.who, 'body', c.body) ORDER BY c.at)
      FROM bootstrap_os.comments c WHERE c.idea_id = i.id
    ), '[]'::jsonb)
  ) ORDER BY i.slug), '[]'::jsonb)
  INTO ideas FROM bootstrap_os.ideas i
  WHERE i.company_id = cid AND (p_idea IS NULL OR i.slug = lower(p_idea));
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'at', a.at, 'who', a.who, 'client', a.client, 'whatChanged', a.what_changed
  ) ORDER BY a.at), '[]'::jsonb)
  INTO audit FROM bootstrap_os.audit_events a WHERE a.company_id = cid;
  SELECT coalesce(jsonb_agg(jsonb_build_object('principal', acl.principal, 'role', acl.role) ORDER BY acl.principal), '[]'::jsonb)
  INTO owners FROM bootstrap_os.company_acl acl WHERE acl.company_id = cid AND acl.principal_kind = 'email';
  RETURN jsonb_build_object(
    'ok', true,
    'company', jsonb_build_object('slug', company_row.slug, 'label', company_row.label),
    'ideas', ideas,
    'owners', owners,
    'audit', audit,
    'portfolio', bootstrap_os.portfolio_view(cid),
    'note', 'Shared 0-1 board. Company is the team; each idea has its own clocks. Decision log is lastTransitions, comments, and audit. Owners are who is on the company. Do not invent entries. Do not invent missing portfolio scores. Scores cannot Advance or Kill. Do not paste GitHub as the board. Killed ideas stay on the board with stored enrichment.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.bootstrap_os_put_journey(
  p_company text, p_idea text, p_why text, p_founder_yes boolean,
  p_journey_phase int DEFAULT NULL, p_loop_stage int DEFAULT NULL,
  p_current_gate text DEFAULT NULL, p_constraint text DEFAULT NULL,
  p_founder_written_decision text DEFAULT NULL,
  p_scoreboard jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, bootstrap_os AS $$
DECLARE
  cid uuid;
  idea_row bootstrap_os.ideas%ROWTYPE;
  email text := NULLIF(lower(auth.jwt() ->> 'email'), '');
  board jsonb;
  bundle jsonb;
  gate_enr jsonb;
  kill_pm jsonb;
  need_gate boolean;
  live_n int;
  old_score jsonb;
  incoming_score jsonb;
  stamped jsonb;
BEGIN
  IF p_founder_yes IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'founder yes required in the agent chat');
  END IF;
  IF nullif(trim(coalesce(p_why, '')), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'why required');
  END IF;
  cid := public.bootstrap_os_ensure_company(p_company);
  SELECT * INTO idea_row FROM bootstrap_os.ideas
  WHERE company_id = cid AND slug = lower(coalesce(nullif(p_idea, ''), 'default'));
  IF idea_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'idea not found; call create_idea first');
  END IF;
  old_score := idea_row.scoreboard->'portfolioScore';
  need_gate := p_current_gate IS NOT NULL OR p_journey_phase IS NOT NULL OR p_loop_stage IS NOT NULL;
  PERFORM set_config('app.client', 'mcp', true);
  PERFORM set_config('app.notify_summary', left(coalesce(p_why, 'board write'), 280), true);
  IF p_journey_phase IS NOT NULL THEN idea_row.journey_phase := p_journey_phase; END IF;
  IF p_loop_stage IS NOT NULL THEN idea_row.loop_stage := p_loop_stage; END IF;
  IF p_current_gate IS NOT NULL THEN idea_row.current_gate := p_current_gate::bootstrap_os.gate_decision; END IF;
  IF p_scoreboard IS NOT NULL AND jsonb_typeof(p_scoreboard) = 'object' THEN
    IF p_scoreboard ? 'portfolioScore' THEN
      incoming_score := p_scoreboard->'portfolioScore';
      IF incoming_score IS NOT NULL
         AND jsonb_typeof(incoming_score) = 'object'
         AND bootstrap_os.portfolio_score_error(incoming_score) IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', bootstrap_os.portfolio_score_error(incoming_score));
      END IF;
    END IF;
    idea_row.scoreboard := coalesce(idea_row.scoreboard, '{}'::jsonb) || (p_scoreboard - 'owner' - 'owners' - 'ownerName' - 'ownerEmail');
  END IF;
  IF p_constraint IS NOT NULL THEN
    idea_row.scoreboard := jsonb_set(coalesce(idea_row.scoreboard, '{}'::jsonb), '{constraint_this_week}', to_jsonb(left(p_constraint, 280)));
  END IF;
  IF need_gate THEN
    gate_enr := bootstrap_os.normalize_gate_enrichment(idea_row.scoreboard);
    IF gate_enr IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'gate requires whatChanged and whatWereNotDoing');
    END IF;
    idea_row.scoreboard := jsonb_set(coalesce(idea_row.scoreboard, '{}'::jsonb), '{gateEnrichment}', gate_enr);
  END IF;
  IF p_current_gate = 'kill' THEN
    kill_pm := bootstrap_os.normalize_kill_postmortem(idea_row.scoreboard, p_why);
    IF kill_pm IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'kill requires lessonsLearned and actionableInsights');
    END IF;
    idea_row.scoreboard := jsonb_set(coalesce(idea_row.scoreboard, '{}'::jsonb), '{killPostmortem}', kill_pm);
  END IF;
  IF incoming_score IS NOT NULL AND jsonb_typeof(incoming_score) = 'object' THEN
    SELECT count(*)::int INTO live_n
    FROM bootstrap_os.ideas
    WHERE company_id = cid AND id <> idea_row.id AND current_gate <> 'kill';
    IF idea_row.current_gate <> 'kill' THEN
      live_n := live_n + 1;
    END IF;
    IF idea_row.current_gate = 'kill' OR live_n < 2 THEN
      IF old_score IS NOT NULL THEN
        idea_row.scoreboard := jsonb_set(coalesce(idea_row.scoreboard, '{}'::jsonb), '{portfolioScore}', old_score);
      ELSE
        idea_row.scoreboard := coalesce(idea_row.scoreboard, '{}'::jsonb) - 'portfolioScore';
      END IF;
    ELSE
      stamped := bootstrap_os.normalize_portfolio_score(incoming_score, coalesce(email, 'unknown'), now());
      idea_row.scoreboard := jsonb_set(coalesce(idea_row.scoreboard, '{}'::jsonb), '{portfolioScore}', stamped);
    END IF;
  ELSIF old_score IS NOT NULL AND (idea_row.scoreboard->'portfolioScore') IS NULL THEN
    idea_row.scoreboard := jsonb_set(coalesce(idea_row.scoreboard, '{}'::jsonb), '{portfolioScore}', old_score);
  END IF;
  UPDATE bootstrap_os.ideas SET journey_phase = idea_row.journey_phase, loop_stage = idea_row.loop_stage,
    current_gate = idea_row.current_gate, scoreboard = idea_row.scoreboard, updated_at = now() WHERE id = idea_row.id;
  IF need_gate THEN
    INSERT INTO bootstrap_os.gate_events (idea_id, action, why, who)
    VALUES (idea_row.id, idea_row.current_gate, p_why, coalesce(email, 'unknown'));
  END IF;
  board := public.bootstrap_os_get_journey(p_company, idea_row.slug);
  bundle := bootstrap_os.notify_bundle(cid, idea_row.id, 'put_journey');
  RETURN board || bundle;
END;
$$;

DROP FUNCTION IF EXISTS public.bootstrap_os_put_portfolio_score(text, text, int, int, int, boolean);

CREATE OR REPLACE FUNCTION public.bootstrap_os_put_portfolio_score(
  p_company text,
  p_idea text,
  p_impact int,
  p_evidence int,
  p_leverage int,
  p_why text,
  p_founder_yes boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, bootstrap_os
AS $$
DECLARE
  cid uuid;
  idea_row bootstrap_os.ideas%ROWTYPE;
  email text := NULLIF(lower(auth.jwt() ->> 'email'), '');
  live_n int;
  stamped jsonb;
  board jsonb;
  why text := left(nullif(trim(coalesce(p_why, '')), ''), 280);
BEGIN
  IF NOT public.bootstrap_os_held_label(p_company) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'company not visible');
  END IF;
  IF p_founder_yes IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'founder yes required in the agent chat');
  END IF;
  IF why IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'why required');
  END IF;
  IF char_length(trim(coalesce(p_why, ''))) > 280 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'why is short text (280)');
  END IF;
  IF p_impact IS NULL OR p_evidence IS NULL OR p_leverage IS NULL
     OR p_impact < 1 OR p_impact > 5
     OR p_evidence < 1 OR p_evidence > 5
     OR p_leverage < 1 OR p_leverage > 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'impact, evidence, and leverage must be integers 1–5');
  END IF;
  cid := public.bootstrap_os_ensure_company(p_company);
  SELECT * INTO idea_row FROM bootstrap_os.ideas
  WHERE company_id = cid AND slug = lower(coalesce(nullif(p_idea, ''), 'default'));
  IF idea_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'idea not found; call create_idea first');
  END IF;
  IF idea_row.current_gate = 'kill' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'killed ideas are out of the live portfolio');
  END IF;
  SELECT count(*)::int INTO live_n
  FROM bootstrap_os.ideas
  WHERE company_id = cid AND current_gate <> 'kill';
  IF live_n < 2 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'skipped', true,
      'reason', 'portfolio scoring applies when two or more live (non-kill) ideas are on the board',
      'company', jsonb_build_object('slug', (SELECT slug FROM bootstrap_os.companies WHERE id = cid)),
      'portfolio', bootstrap_os.portfolio_view(cid)
    );
  END IF;
  stamped := bootstrap_os.normalize_portfolio_score(
    jsonb_build_object('impact', p_impact, 'evidence', p_evidence, 'leverage', p_leverage, 'why', why),
    coalesce(email, 'unknown'),
    now()
  );
  IF stamped IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'why required');
  END IF;
  PERFORM set_config('app.client', 'put_portfolio_score', true);
  PERFORM set_config('app.skip_board_notify', 'true', true);
  PERFORM set_config('app.notify_summary', why, true);
  UPDATE bootstrap_os.ideas
  SET scoreboard = jsonb_set(coalesce(scoreboard, '{}'::jsonb), '{portfolioScore}', stamped),
      updated_at = now()
  WHERE id = idea_row.id
    AND current_gate = idea_row.current_gate;
  board := public.bootstrap_os_get_journey(p_company, idea_row.slug);
  RETURN board || jsonb_build_object('ok', true, 'skipped', false);
END;
$$;

REVOKE ALL ON FUNCTION bootstrap_os.read_portfolio_score(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION bootstrap_os.portfolio_score_error(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION bootstrap_os.normalize_portfolio_score(jsonb, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION bootstrap_os.portfolio_view(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION bootstrap_os.audit_idea_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bootstrap_os_get_journey(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bootstrap_os_put_journey(text, text, text, boolean, int, int, text, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bootstrap_os_put_portfolio_score(text, text, int, int, int, text, boolean) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.bootstrap_os_get_journey(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_put_journey(text, text, text, boolean, int, int, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_put_portfolio_score(text, text, int, int, int, text, boolean) TO authenticated;

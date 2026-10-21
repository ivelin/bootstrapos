-- Not an ACL role. Buyer stays scoreboard.buyer. Past-bet dates stay initiatives start/end.
-- Do not migrate/seed/live-probe supabase-pirin-ai from a PR cloud agent.
-- PR agents do not apply this file.

ALTER TABLE bootstrap_os.companies ADD COLUMN IF NOT EXISTS founder text;

ALTER TABLE bootstrap_os.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE bootstrap_os.companies FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE bootstrap_os.companies FROM PUBLIC, anon, authenticated;

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
    'company', jsonb_strip_nulls(jsonb_build_object(
      'slug', company_row.slug,
      'label', company_row.label,
      'founder', nullif(btrim(coalesce(company_row.founder, '')), '')
    )),
    'ideas', ideas,
    'owners', owners,
    'audit', audit,
    'portfolio', bootstrap_os.portfolio_view(cid),
    'note', 'Shared 0-1 board. Company is the team; each idea has its own clocks. Decision log is lastTransitions, comments, and audit. Owners are who is on the company. Do not invent entries. Do not invent missing portfolio scores. Scores cannot Advance or Kill. Do not paste GitHub as the board. Killed ideas stay on the board with stored enrichment.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_os_get_journey(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_get_journey(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.bootstrap_os_put_journey(
  p_company text, p_idea text, p_why text, p_founder_yes boolean,
  p_journey_phase int DEFAULT NULL, p_loop_stage int DEFAULT NULL,
  p_current_gate text DEFAULT NULL, p_constraint text DEFAULT NULL,
  p_founder_written_decision text DEFAULT NULL,
  p_scoreboard jsonb DEFAULT NULL,
  p_founder text DEFAULT NULL
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
  journey_or_gate boolean;
BEGIN
  IF nullif(trim(coalesce(p_why, '')), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'why required');
  END IF;
  cid := public.bootstrap_os_ensure_company(p_company);
  SELECT * INTO idea_row FROM bootstrap_os.ideas
  WHERE company_id = cid AND slug = lower(coalesce(nullif(p_idea, ''), 'default'));
  IF idea_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'idea not found; call create_idea first');
  END IF;
  IF p_scoreboard IS NOT NULL AND jsonb_typeof(p_scoreboard) = 'object'
     AND (p_scoreboard ? 'loopSpoken' OR p_scoreboard ? 'loopWeek' OR p_scoreboard ? 'spokenLoop' OR p_scoreboard ? 'weekVerb') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'spoken Ask/Do/Write back are not card fields — loop is a quality bar, not where-we-are');
  END IF;
  IF p_loop_stage IS NOT NULL AND p_loop_stage IS DISTINCT FROM idea_row.loop_stage THEN
    RETURN jsonb_build_object('ok', false, 'error', 'loopStage mutations are rejected — Ask/Do/Write back is a quality bar, not a stored week verb');
  END IF;
  journey_or_gate := p_current_gate IS NOT NULL OR p_journey_phase IS NOT NULL;
  IF journey_or_gate AND p_founder_yes IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'founder yes required in the agent chat');
  END IF;
  old_score := idea_row.scoreboard->'portfolioScore';
  need_gate := journey_or_gate;
  PERFORM set_config('app.client', 'mcp', true);
  PERFORM set_config('app.notify_summary', left(coalesce(p_why, 'board write'), 280), true);
  IF p_journey_phase IS NOT NULL THEN idea_row.journey_phase := p_journey_phase; END IF;
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
  IF jsonb_typeof(idea_row.scoreboard->'initiatives') = 'array'
     AND jsonb_array_length(idea_row.scoreboard->'initiatives') > 0 THEN
    idea_row.scoreboard := idea_row.scoreboard - 'progress' - 'supporting' - 'engagements';
  END IF;
  IF p_founder IS NOT NULL THEN
    UPDATE bootstrap_os.companies
    SET founder = nullif(left(btrim(p_founder), 80), '')
    WHERE id = cid;
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

DROP FUNCTION IF EXISTS public.bootstrap_os_put_journey(text, text, text, boolean, int, int, text, text, text, jsonb);

REVOKE ALL ON FUNCTION public.bootstrap_os_put_journey(text, text, text, boolean, int, int, text, text, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_put_journey(text, text, text, boolean, int, int, text, text, text, jsonb, text) TO authenticated;

COMMENT ON FUNCTION public.bootstrap_os_put_journey(text, text, text, boolean, int, int, text, text, text, jsonb, text) IS
  'Optional p_founder writes bootstrap_os.companies.founder (empty clears, null leaves it). Not an ACL role.';

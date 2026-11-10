-- Hosted write-role enforcement. Gate board-scoped SECURITY DEFINER writes with bootstrap_os.has_rank.
-- Cos applies on supabase-pirin-ai. PR agents: PGlite/pg16 only. Do not apply from a PR agent.
-- No mass backfill. No GRANT to anon. Existing ACL rows are not demoted.

BEGIN;


CREATE OR REPLACE FUNCTION bootstrap_os.has_rank(p_company_id uuid, p_min_rank int)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, bootstrap_os, public
AS $$
  SELECT COALESCE(
    (
      SELECT MAX(bootstrap_os.rank_of(a.role))
      FROM bootstrap_os.company_acl a
      WHERE a.company_id = p_company_id
        AND (
          (a.principal_kind = 'email' AND a.principal = bootstrap_os.actor_email())
          OR (a.principal_kind = 'sub' AND a.principal = bootstrap_os.actor_sub())
        )
    ),
    CASE
      WHEN public.bootstrap_os_held_label(
        (SELECT c.slug FROM bootstrap_os.companies c WHERE c.id = p_company_id)
      ) THEN 2
      ELSE 0
    END
  ) >= p_min_rank;
$$;

REVOKE ALL ON FUNCTION bootstrap_os.has_rank(uuid, int) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.bootstrap_os_ensure_company(
  p_company text,
  p_founder_email text DEFAULT NULL,
  p_create boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, bootstrap_os
AS $$
DECLARE
  v_slug text := lower(p_company);
  cid uuid;
  caller_email text := NULLIF(lower(auth.jwt() ->> 'email'), '');
  v_founder text := nullif(lower(trim(p_founder_email)), '');
  v_super boolean := false;
BEGIN
  SELECT c.id INTO cid FROM bootstrap_os.companies c WHERE c.slug = v_slug;
  IF cid IS NULL AND p_create IS NOT TRUE THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  IF cid IS NULL THEN
    IF v_founder IS NOT NULL AND v_founder !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
      RAISE EXCEPTION 'invalid_founder_email';
    END IF;
    IF caller_email IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.bootstrap_os_roles r
        JOIN public.bootstrap_mcp_mentees m ON m.id = r.mentee_id
        WHERE m.email = caller_email
          AND r.role = 'super_admin'
          AND r.revoked_at IS NULL
      ) INTO v_super;
    END IF;
    IF v_founder IS NULL AND v_super THEN
      RAISE EXCEPTION 'founder_email_required: pass founderEmail';
    END IF;
    INSERT INTO bootstrap_os.companies (slug, label) VALUES (v_slug, v_slug) RETURNING id INTO cid;
    INSERT INTO bootstrap_os.ideas (company_id, slug, name, journey_phase, loop_stage, current_gate, scoreboard)
    VALUES (cid, 'default', v_slug, 1, 1, 'hold',
      jsonb_build_object('schema_version', 1, 'readyForHumanEyes', jsonb_build_object('status', 'unknown'),
        'autonomyPosture', 'strict', 'openQuestions', '[]'::jsonb, 'constraint_this_week', ''));
    IF v_founder IS NULL OR v_founder = caller_email THEN
      PERFORM public.bootstrap_os_grant_acl_internal(cid, caller_email, 'founder');
    ELSE
      PERFORM public.bootstrap_os_grant_acl_internal(cid, v_founder, 'founder');
      PERFORM public.bootstrap_os_grant_acl_internal(cid, caller_email, 'commenter');
    END IF;
  ELSE
    IF NOT public.bootstrap_os_held_label(v_slug) THEN
      RAISE EXCEPTION 'company not visible';
    END IF;
  END IF;
  RETURN cid;
END;
$$;
CREATE OR REPLACE FUNCTION public.bootstrap_os_get_journey(p_company text, p_idea text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, bootstrap_os AS $$
DECLARE cid uuid; company_row bootstrap_os.companies%ROWTYPE; ideas jsonb; audit jsonb; owners jsonb;
BEGIN
  BEGIN
    cid := public.bootstrap_os_ensure_company(p_company);
  EXCEPTION WHEN SQLSTATE 'P0002' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found', 'message', 'Board not found.');
  END;
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
CREATE OR REPLACE FUNCTION public.bootstrap_os_change_acl(
  p_company text,
  p_principal text,
  p_principal_kind text,
  p_role text,
  p_op text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, bootstrap_os
AS $$
DECLARE
  cid uuid;
  v_kind text := lower(trim(coalesce(p_principal_kind, '')));
  v_principal text := trim(coalesce(p_principal, ''));
  v_role text := lower(trim(coalesce(p_role, '')));
  v_op text := lower(trim(coalesce(p_op, '')));
  before_row bootstrap_os.company_acl%ROWTYPE;
BEGIN
  IF NOT public.bootstrap_os_held_label(p_company) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'company not visible');
  END IF;
  IF public.bootstrap_os_starter_is_sandbox(p_company) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sandbox_cannot_share');
  END IF;
  IF v_kind NOT IN ('email', 'sub') OR v_principal = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid principal');
  END IF;
  IF v_kind = 'email' THEN
    v_principal := lower(v_principal);
  END IF;
  IF v_role NOT IN ('founder', 'founder_authorized', 'advisor') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid role');
  END IF;
  IF v_op NOT IN ('grant', 'revoke') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid op');
  END IF;
  cid := public.bootstrap_os_ensure_company(p_company);
  IF NOT bootstrap_os.has_rank(cid, 3) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_role', 'message', 'Your role on this board can comment, but not edit. Ask the founder to invite you to edit.');
  END IF;
  SELECT * INTO before_row FROM bootstrap_os.company_acl
  WHERE company_id = cid AND principal = v_principal AND principal_kind = v_kind;
  IF v_op = 'grant' THEN
    IF v_kind = 'email' THEN
      PERFORM public.bootstrap_os_grant_acl_internal(cid, v_principal, v_role, false);
    ELSE
      -- Helper is email-only. Sub grants stay a direct ACL insert.
      INSERT INTO bootstrap_os.company_acl (company_id, principal, principal_kind, role)
      VALUES (cid, v_principal, v_kind, v_role)
      ON CONFLICT (company_id, principal, principal_kind) DO NOTHING;
    END IF;
  ELSE
    DELETE FROM bootstrap_os.company_acl
    WHERE company_id = cid AND principal = v_principal AND principal_kind = v_kind;
  END IF;
  PERFORM bootstrap_os.emit_audit(
    cid,
    NULL,
    coalesce(bootstrap_os.actor_principal(), 'acl'),
    'mcp',
    jsonb_build_object(
      'op', v_op,
      'via', 'acl',
      'principal_kind', v_kind,
      'role', v_role,
      'before', CASE
        WHEN before_row.id IS NULL THEN NULL
        ELSE jsonb_build_object(
          'principal', before_row.principal,
          'principalKind', before_row.principal_kind,
          'role', before_row.role
        )
      END,
      'after', CASE
        WHEN v_op = 'revoke' THEN NULL
        ELSE jsonb_build_object(
          'principal', v_principal,
          'principalKind', v_kind,
          'role', v_role
        )
      END
    )
  );
  RETURN jsonb_build_object('ok', true);
END;
$$;
CREATE OR REPLACE FUNCTION public.bootstrap_os_create_idea(
  p_company text,
  p_idea text,
  p_name text DEFAULT NULL,
  p_founder_yes boolean DEFAULT FALSE,
  p_why text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, bootstrap_os AS $$
DECLARE
  cid uuid;
  v_slug text := lower(trim(coalesce(p_idea, '')));
  v_label text := nullif(trim(coalesce(p_name, '')), '');
  email text := NULLIF(lower(auth.jwt() ->> 'email'), '');
  iid uuid;
  idea_row bootstrap_os.ideas%ROWTYPE;
  v_rate jsonb;
BEGIN
  IF p_founder_yes IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'founder yes required in the agent chat');
  END IF;
  IF v_slug IS NULL OR v_slug = '' OR v_slug !~ '^[a-z0-9][a-z0-9_-]{0,31}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid idea slug');
  END IF;
  BEGIN
    cid := public.bootstrap_os_ensure_company(p_company, NULL, true);
  EXCEPTION WHEN SQLSTATE 'P0002' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END;
  IF NOT bootstrap_os.has_rank(cid, 3) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_role', 'message', 'Your role on this board can comment, but not edit. Ask the founder to invite you to edit.');
  END IF;
  IF EXISTS (SELECT 1 FROM bootstrap_os.ideas i WHERE i.company_id = cid AND i.slug = v_slug) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'idea already exists');
  END IF;
  BEGIN
    v_rate := public.bootstrap_hosted_take('create_idea');
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limiter_unavailable', 'reason', 'rate_limiter_unavailable', 'message', 'The limiter could not be reached. This action was refused.');
  END;
  IF coalesce((v_rate ->> 'ok')::boolean, false) IS DISTINCT FROM true THEN
    IF coalesce(v_rate ->> 'error', v_rate ->> 'reason', '') = '' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'rate_limiter_unavailable', 'reason', 'rate_limiter_unavailable', 'message', 'The limiter could not be reached. This action was refused.');
    END IF;
    RETURN v_rate;
  END IF;
  INSERT INTO bootstrap_os.ideas (company_id, slug, name, journey_phase, loop_stage, current_gate, scoreboard)
  VALUES (
    cid,
    v_slug,
    coalesce(v_label, v_slug),
    1,
    1,
    'hold',
    jsonb_build_object(
      'schema_version', 1,
      'readyForHumanEyes', jsonb_build_object('status', 'unknown'),
      'autonomyPosture', 'strict',
      'openQuestions', '[]'::jsonb,
      'constraint_this_week', ''
    )
  )
  RETURNING * INTO idea_row;
  iid := idea_row.id;
  PERFORM bootstrap_os.emit_audit(
    cid,
    iid,
    coalesce(email, 'unknown'),
    'mcp',
    jsonb_build_object(
      'op', 'create_idea',
      'via', 'create_idea',
      'idea', v_slug,
      'why', coalesce(nullif(p_why, ''), 'new 0-1 board'),
      'before', NULL,
      'after', bootstrap_os.idea_board_snapshot(
        idea_row.journey_phase, idea_row.loop_stage, idea_row.current_gate, idea_row.scoreboard
      )
    )
  );
  RETURN public.bootstrap_os_get_journey(p_company, v_slug);
END;
$$;
CREATE OR REPLACE FUNCTION public.bootstrap_os_put_journey(
  p_company text, p_idea text, p_why text, p_founder_yes boolean,
  p_journey_phase int DEFAULT NULL, p_loop_stage int DEFAULT NULL,
  p_current_gate text DEFAULT NULL, p_constraint text DEFAULT NULL,
  p_founder_written_decision text DEFAULT NULL,
  p_scoreboard jsonb DEFAULT NULL,
  p_founder text DEFAULT NULL,
  p_founder_email text DEFAULT NULL
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
  v_existed boolean;
BEGIN
  IF nullif(trim(coalesce(p_why, '')), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'why required');
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM bootstrap_os.companies c WHERE c.slug = lower(p_company)
  ) INTO v_existed;
  cid := public.bootstrap_os_ensure_company(p_company, p_founder_email, true);
  IF v_existed AND NOT bootstrap_os.has_rank(cid, 3) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_role', 'message', 'Your role on this board can comment, but not edit. Ask the founder to invite you to edit.');
  END IF;
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
  IF NOT bootstrap_os.has_rank(cid, 3) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_role', 'message', 'Your role on this board can comment, but not edit. Ask the founder to invite you to edit.');
  END IF;
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
CREATE OR REPLACE FUNCTION public.bootstrap_os_subscribe_board(
  p_company text,
  p_idea text,
  p_principal text,
  p_principal_kind text,
  p_webhook_url text,
  p_email_opt_in boolean DEFAULT FALSE
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, bootstrap_os
AS $$
DECLARE
  cid uuid;
  iid uuid;
  v_kind text := lower(trim(coalesce(p_principal_kind, '')));
  v_principal text := trim(coalesce(p_principal, ''));
  v_url text := trim(coalesce(p_webhook_url, ''));
  row_sub bootstrap_os.board_subscribers%ROWTYPE;
  before_row bootstrap_os.board_subscribers%ROWTYPE;
BEGIN
  IF NOT public.bootstrap_os_held_label(p_company) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'company not visible');
  END IF;
  IF v_kind NOT IN ('email', 'sub') OR v_principal = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid principal');
  END IF;
  IF v_kind = 'email' THEN
    v_principal := lower(v_principal);
  END IF;
  IF v_url !~ '^https://' OR char_length(v_url) < 10 OR char_length(v_url) > 2048 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'webhook URL must be https');
  END IF;
  cid := public.bootstrap_os_ensure_company(p_company);
  IF NOT bootstrap_os.has_rank(cid, 3) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_role', 'message', 'Your role on this board can comment, but not edit. Ask the founder to invite you to edit.');
  END IF;
  IF NOT bootstrap_os.subscriber_is_acl_member(cid, v_principal, v_kind) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'subscriber must already have ACL access');
  END IF;
  IF p_idea IS NOT NULL AND length(trim(p_idea)) > 0 THEN
    SELECT i.id INTO iid FROM bootstrap_os.ideas i
    WHERE i.company_id = cid AND i.slug = lower(trim(p_idea));
    IF iid IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'idea not visible');
    END IF;
  END IF;
  SELECT * INTO before_row FROM bootstrap_os.board_subscribers s
  WHERE s.company_id = cid
    AND s.principal = v_principal
    AND s.principal_kind = v_kind
    AND coalesce(s.idea_id, '00000000-0000-0000-0000-000000000000'::uuid)
      = coalesce(iid, '00000000-0000-0000-0000-000000000000'::uuid);
  IF before_row.id IS NULL THEN
    INSERT INTO bootstrap_os.board_subscribers (
      company_id, idea_id, principal, principal_kind, webhook_url, email_opt_in, created_by
    ) VALUES (
      cid, iid, v_principal, v_kind, v_url, coalesce(p_email_opt_in, false),
      coalesce(bootstrap_os.actor_principal(), 'unknown')
    )
    RETURNING * INTO row_sub;
  ELSE
    row_sub := before_row;
  END IF;
  RETURN jsonb_build_object(
    'ok', true,
    'subscriber', jsonb_build_object(
      'principal', row_sub.principal,
      'principalKind', row_sub.principal_kind,
      'emailOptIn', row_sub.email_opt_in,
      'ideaId', row_sub.idea_id,
      'webhookUrl', row_sub.webhook_url
    )
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.bootstrap_os_unsubscribe_board(
  p_company text,
  p_idea text,
  p_principal text,
  p_principal_kind text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, bootstrap_os
AS $$
DECLARE
  cid uuid;
  iid uuid;
  v_kind text := lower(trim(coalesce(p_principal_kind, '')));
  v_principal text := trim(coalesce(p_principal, ''));
  n int := 0;
BEGIN
  IF NOT public.bootstrap_os_held_label(p_company) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'company not visible');
  END IF;
  IF v_kind NOT IN ('email', 'sub') OR v_principal = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid principal');
  END IF;
  IF v_kind = 'email' THEN
    v_principal := lower(v_principal);
  END IF;
  cid := public.bootstrap_os_ensure_company(p_company);
  IF NOT bootstrap_os.has_rank(cid, 3) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_role', 'message', 'Your role on this board can comment, but not edit. Ask the founder to invite you to edit.');
  END IF;
  IF p_idea IS NOT NULL AND length(trim(p_idea)) > 0 THEN
    SELECT i.id INTO iid FROM bootstrap_os.ideas i
    WHERE i.company_id = cid AND i.slug = lower(trim(p_idea));
    IF iid IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'idea not visible');
    END IF;
  END IF;
  DELETE FROM bootstrap_os.board_subscribers s
  WHERE s.company_id = cid
    AND s.principal = v_principal
    AND s.principal_kind = v_kind
    AND coalesce(s.idea_id, '00000000-0000-0000-0000-000000000000'::uuid)
      = coalesce(iid, '00000000-0000-0000-0000-000000000000'::uuid);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'removed', n);
END;
$$;
CREATE OR REPLACE FUNCTION public.bootstrap_os_invite_create(
  p_email text,
  p_companies jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bootstrap_os, public
AS $$
DECLARE
  actor_email text;
  invitee text;
  elem jsonb;
  v_slug text;
  requested text;
  tier_rank int;
  rank int;
  invitee_rank int;
  ceiling_ok boolean;
  company_uuid uuid;
  invite_id uuid;
  raw_token text;
  grants jsonb := '[]'::jsonb;
  dropped jsonb := '[]'::jsonb;
  denied jsonb := '[]'::jsonb;
  allowed jsonb := '[]'::jsonb;
  seen text[] := ARRAY[]::text[];
BEGIN
  PERFORM bootstrap_os.require_actor();
  actor_email := bootstrap_os.resolved_actor_email();
  invitee := nullif(lower(trim(coalesce(p_email, ''))), '');
  IF actor_email IS NULL OR invitee IS NULL OR invitee !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_email');
  END IF;
  IF p_companies IS NULL OR jsonb_typeof(p_companies) <> 'array' OR jsonb_array_length(p_companies) > 20 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_label');
  END IF;

  FOR elem IN SELECT value FROM jsonb_array_elements(p_companies)
  LOOP
    v_slug := lower(trim(coalesce(elem->>'slug', '')));
    requested := coalesce(nullif(elem->>'role', ''), 'viewer');
    IF v_slug = '' OR v_slug !~ '^[a-z0-9][a-z0-9_-]{0,31}$' OR v_slug = ANY (seen) THEN
      denied := denied || jsonb_build_array(jsonb_build_object('slug', v_slug, 'reason', 'invalid_label'));
      CONTINUE;
    END IF;
    seen := array_append(seen, v_slug);
    IF requested NOT IN ('viewer', 'commenter', 'editor') THEN
      denied := denied || jsonb_build_array(jsonb_build_object('slug', v_slug, 'reason', 'owner_forbidden'));
      CONTINUE;
    END IF;
    company_uuid := NULL;
    rank := NULL;
    SELECT c.id INTO company_uuid FROM bootstrap_os.companies c WHERE c.slug = v_slug;
    IF company_uuid IS NOT NULL THEN
      SELECT bootstrap_os.rank_of(a.role) INTO rank
      FROM bootstrap_os.company_acl a
      WHERE a.company_id = company_uuid
        AND a.principal_kind = 'email'
        AND a.principal = actor_email
      ORDER BY bootstrap_os.rank_of(a.role) DESC
      LIMIT 1;
    END IF;
    tier_rank := bootstrap_os.rank_of(requested);
    ceiling_ok := company_uuid IS NOT NULL
      AND bootstrap_os.has_rank(company_uuid, 3)
      AND (requested <> 'editor' OR bootstrap_os.has_rank(company_uuid, 4));
    IF NOT ceiling_ok THEN
      denied := denied || jsonb_build_array(jsonb_build_object(
        'slug', v_slug,
        'reason', CASE WHEN rank IS NULL THEN 'not_held' ELSE 'tier_forbidden' END
      ));
      IF rank IS NOT NULL AND rank >= 3 THEN
        allowed := allowed || jsonb_build_array(to_jsonb(v_slug));
      END IF;
      CONTINUE;
    END IF;
    allowed := allowed || jsonb_build_array(to_jsonb(v_slug));
    invitee_rank := NULL;
    SELECT bootstrap_os.rank_of(a.role) INTO invitee_rank
    FROM bootstrap_os.company_acl a
    WHERE a.company_id = company_uuid
      AND a.principal_kind = 'email'
      AND a.principal = invitee
    ORDER BY bootstrap_os.rank_of(a.role) DESC
    LIMIT 1;
    IF invitee_rank IS NOT NULL AND invitee_rank >= tier_rank THEN
      dropped := dropped || jsonb_build_array(jsonb_build_object('slug', v_slug, 'role', requested));
      CONTINUE;
    END IF;
    grants := grants || jsonb_build_array(jsonb_build_object(
      'slug', v_slug,
      'role', requested,
      'company_id', company_uuid
    ));
  END LOOP;

  IF jsonb_array_length(denied) > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'invite_partial_authority',
      'allowed', allowed,
      'denied', denied
    );
  END IF;
  IF jsonb_array_length(p_companies) > 0 AND jsonb_array_length(grants) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_member');
  END IF;

  raw_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO bootstrap_os.invites (token_hash, invitee_email, inviter_email, inviter_sub, expires_at)
  VALUES (
    encode(sha256(convert_to(raw_token, 'UTF8')), 'hex'),
    invitee,
    actor_email,
    bootstrap_os.resolved_actor_sub(),
    now() + interval '7 days'
  )
  RETURNING id INTO invite_id;

  INSERT INTO bootstrap_os.invite_companies (invite_id, company_id, role)
  SELECT invite_id, (g->>'company_id')::uuid, g->>'role'
  FROM jsonb_array_elements(grants) g;

  RETURN jsonb_build_object(
    'ok', true,
    'token', raw_token,
    'inviteeEmail', invitee,
    'companies', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('slug', g->>'slug', 'role', g->>'role'))
      FROM jsonb_array_elements(grants) g
    ), '[]'::jsonb),
    'dropped', dropped
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.bootstrap_mcp_invite_member(p_email text, p_company_label text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  uid uuid := auth.uid();
  inviter_email text;
  inviter_id uuid;
  invitee text;
  workspace text;
  raw_token text;
  invite_id uuid;
  outbox_id uuid;
  mail_id uuid;
  expires timestamptz;
  card jsonb;
  auth_card jsonb;
  outbox_payload jsonb;
  mail_payload jsonb;
  signup_url text;
  pending_id uuid;
  v_rate jsonb;
  cid uuid;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'inviter_not_on_allowlist');
  END IF;

  SELECT lower(email) INTO inviter_email FROM auth.users WHERE id = uid;
  SELECT id INTO inviter_id
  FROM public.bootstrap_mcp_mentees
  WHERE auth_user_id = uid OR email = inviter_email;

  IF inviter_id IS NULL OR inviter_email IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'inviter_not_on_allowlist');
  END IF;

  invitee := lower(nullif(btrim(p_email), ''));
  IF invitee IS NULL OR position('@' IN invitee) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_email');
  END IF;

  workspace := lower(nullif(btrim(p_company_label), ''));
  IF workspace IS NULL OR workspace !~ '^[a-z0-9][a-z0-9_-]{0,31}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_label');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.bootstrap_company_labels cl
    WHERE cl.mentee_id = inviter_id
      AND cl.label = workspace
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'label_not_held');
  END IF;

  SELECT c.id INTO cid FROM bootstrap_os.companies c WHERE c.slug = workspace;
  IF cid IS NULL OR NOT bootstrap_os.has_rank(cid, 3) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_role', 'message', 'Your role on this board can comment, but not edit. Ask the founder to invite you to edit.');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bootstrap_mcp_mentees m
    JOIN public.bootstrap_company_labels cl ON cl.mentee_id = m.id
    WHERE m.email = invitee
      AND cl.label = workspace
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_member');
  END IF;

  BEGIN
    v_rate := public.bootstrap_hosted_take('invite_member');
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limiter_unavailable', 'reason', 'rate_limiter_unavailable', 'message', 'The limiter could not be reached. This action was refused.');
  END;
  IF coalesce((v_rate ->> 'ok')::boolean, false) IS DISTINCT FROM true THEN
    IF coalesce(v_rate ->> 'error', v_rate ->> 'reason', '') = '' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'rate_limiter_unavailable', 'reason', 'rate_limiter_unavailable', 'message', 'The limiter could not be reached. This action was refused.');
    END IF;
    RETURN v_rate;
  END IF;

  raw_token := 'inv_' || encode(extensions.gen_random_bytes(24), 'hex');
  expires := now() + interval '7 days';
  outbox_id := gen_random_uuid();
  mail_id := gen_random_uuid();
  signup_url := 'https://pirin.ai/bootstrap-os/login?invite=' || raw_token;

  SELECT i.id INTO pending_id
  FROM public.bootstrap_mcp_invites i
  WHERE i.invitee_email = invitee
    AND i.company_label = workspace
    AND i.accepted_at IS NULL
  ORDER BY i.created_at DESC
  LIMIT 1;

  IF pending_id IS NOT NULL THEN
    invite_id := pending_id;
    UPDATE public.bootstrap_mcp_invites
    SET token_hash = public.bootstrap_mcp_hash_token(raw_token),
        expires_at = expires,
        invited_by_mentee_id = inviter_id,
        invited_by_email = inviter_email
    WHERE id = invite_id
      AND accepted_at IS NULL;
  ELSE
    invite_id := gen_random_uuid();
    INSERT INTO public.bootstrap_mcp_invites (
      id, invitee_email, company_label, invited_by_mentee_id, invited_by_email, token_hash, expires_at
    ) VALUES (
      invite_id, invitee, workspace, inviter_id, inviter_email, public.bootstrap_mcp_hash_token(raw_token), expires
    );
  END IF;

  card := jsonb_build_object(
    'card', 'accept_invite',
    'shape', 'DraftExternalMessage',
    'from', jsonb_build_object('email', inviter_email),
    'to', jsonb_build_object('email', invitee),
    'companyWorkspace', workspace,
    'action', 'Accept',
    'inviteToken', raw_token,
    'expiresAt', expires,
    'tool', 'accept_invite',
    'note', 'Optional Accept card for MCP clients that render tool results. Login URL is the universal path. Mail (bootstrap@) carries the same token. JWT email must match.'
  );

  auth_card := jsonb_build_object(
    'card', 'invite_signup',
    'shape', 'DraftExternalMessage',
    'from', jsonb_build_object('email', 'bootstrap@pirin.ai'),
    'to', jsonb_build_object('email', invitee),
    'companyWorkspace', workspace,
    'inviterEmail', inviter_email,
    'action', 'Sign in or create account',
    'signupUrl', signup_url,
    'qrPayload', signup_url,
    'inviteToken', raw_token,
    'expiresAt', expires,
    'note', 'Universal path for any agentic client. Web Builder owns /bootstrap-os/login. Sign in as this email if you already have a pirin.ai account; otherwise create the account for this invitee email only. Then accept_invite with the same token. pirin-ai sends From bootstrap@pirin.ai only — Cos yes before prod Resend.'
  );

  outbox_payload := card - 'inviteToken';
  outbox_payload := outbox_payload || jsonb_build_object(
    'inviteToken', null,
    'note', 'In-chat Accept. Raw invite token is not stored on this channel.'
  );

  mail_payload := jsonb_build_object(
    'channel', 'email',
    'mailFrom', 'bootstrap@pirin.ai',
    'from', jsonb_build_object('email', inviter_email),
    'to', jsonb_build_object('email', invitee),
    'companyWorkspace', workspace,
    'signupUrl', signup_url,
    'qrPayload', signup_url,
    'inviteToken', raw_token,
    'expiresAt', expires,
    'note', 'Mailer handoff. pirin-ai Resend From bootstrap@pirin.ai only. Token is on this channel so the poller can send ?invite=. in_chat never stores the token. Cos yes before prod send.'
  );

  INSERT INTO public.bootstrap_mcp_invite_outbox (id, invite_id, channel, payload)
  VALUES (outbox_id, invite_id, 'in_chat', outbox_payload);

  INSERT INTO public.bootstrap_mcp_invite_outbox (id, invite_id, channel, payload)
  VALUES (mail_id, invite_id, 'email', mail_payload);

  RETURN jsonb_build_object(
    'ok', true,
    'card', card,
    'authCard', auth_card,
    'queued', jsonb_build_object('channel', 'in_chat', 'id', outbox_id),
    'queuedMail', jsonb_build_object(
      'channel', 'email',
      'id', mail_id,
      'from', 'bootstrap@pirin.ai'
    )
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.bootstrap_os_post_comment(p_company text, p_idea text, p_body text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, bootstrap_os AS $$
DECLARE
  cid uuid;
  idea_row bootstrap_os.ideas%ROWTYPE;
  email text := NULLIF(lower(auth.jwt() ->> 'email'), '');
  bundle jsonb;
  snap jsonb;
  v_body_max int;
BEGIN
  SELECT max_value INTO v_body_max
  FROM public.bootstrap_request_cap
  WHERE name = 'comment_body_bytes';
  IF v_body_max IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limiter_unavailable', 'reason', 'rate_limiter_unavailable', 'message', 'The limiter could not be reached. This action was refused.');
  END IF;
  IF octet_length(p_body) > v_body_max THEN
    RETURN jsonb_build_object('ok', false, 'error', 'comment_too_long', 'reason', 'comment_too_long', 'message', 'Comment is longer than 4 KB.');
  END IF;

  cid := public.bootstrap_os_ensure_company(p_company);
  IF NOT bootstrap_os.has_rank(cid, 2) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_role', 'message', 'Your role on this board cannot comment.');
  END IF;
  SELECT * INTO idea_row FROM bootstrap_os.ideas
  WHERE company_id = cid AND slug = lower(coalesce(nullif(p_idea, ''), 'default'));
  IF idea_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'idea not found; call create_idea first');
  END IF;
  snap := bootstrap_os.idea_board_snapshot(
    idea_row.journey_phase, idea_row.loop_stage, idea_row.current_gate, idea_row.scoreboard
  );

  INSERT INTO bootstrap_os.comments (idea_id, body, who) VALUES (idea_row.id, p_body, coalesce(email, 'unknown'));
  PERFORM bootstrap_os.emit_audit(cid, idea_row.id, coalesce(email, 'unknown'), 'mcp',
    jsonb_build_object(
      'op', 'post_comment',
      'via', 'post_comment',
      'before', snap,
      'after', snap
    ));
  bundle := bootstrap_os.notify_bundle(cid, idea_row.id, 'post_comment');
  RETURN jsonb_build_object('ok', true, 'clocksUnchanged', true) || bundle;
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_os_ensure_company(text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bootstrap_os_get_journey(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_get_journey(text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.bootstrap_os_put_journey(text, text, text, boolean, int, int, text, text, text, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_put_journey(text, text, text, boolean, int, int, text, text, text, jsonb, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.bootstrap_os_create_idea(text, text, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_create_idea(text, text, text, boolean, text) TO authenticated;
REVOKE ALL ON FUNCTION public.bootstrap_os_put_portfolio_score(text, text, int, int, int, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_put_portfolio_score(text, text, int, int, int, text, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.bootstrap_os_change_acl(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_change_acl(text, text, text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.bootstrap_os_subscribe_board(text, text, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_subscribe_board(text, text, text, text, text, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.bootstrap_os_unsubscribe_board(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_unsubscribe_board(text, text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.bootstrap_os_invite_create(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_invite_create(text, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.bootstrap_mcp_invite_member(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_mcp_invite_member(text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.bootstrap_os_post_comment(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_post_comment(text, text, text) TO authenticated;


COMMIT;

-- Down migration for 20261110_bootstrap_os_ensure_company_founder_email.
-- Restores the 1-arg ensure_company and the inline change_acl grant insert.
-- Not applied by PR agents. Not part of the forward migration stream.

BEGIN;

DROP FUNCTION IF EXISTS public.bootstrap_os_put_journey(text, text, text, boolean, int, int, text, text, text, jsonb, text, text);

DROP FUNCTION IF EXISTS public.bootstrap_os_ensure_company(text, text, boolean);
DROP FUNCTION IF EXISTS public.bootstrap_os_ensure_company(text, text);

CREATE FUNCTION public.bootstrap_os_ensure_company(p_company text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, bootstrap_os
AS $$
DECLARE
  v_slug text := lower(p_company);
  cid uuid;
  email text := NULLIF(lower(auth.jwt() ->> 'email'), '');
BEGIN
  IF NOT public.bootstrap_os_held_label(v_slug) THEN
    RAISE EXCEPTION 'company not visible';
  END IF;
  SELECT c.id INTO cid FROM bootstrap_os.companies c WHERE c.slug = v_slug;
  IF cid IS NULL THEN
    INSERT INTO bootstrap_os.companies (slug, label) VALUES (v_slug, v_slug) RETURNING id INTO cid;
    INSERT INTO bootstrap_os.ideas (company_id, slug, name, journey_phase, loop_stage, current_gate, scoreboard)
    VALUES (cid, 'default', v_slug, 1, 1, 'hold',
      jsonb_build_object('schema_version', 1, 'readyForHumanEyes', jsonb_build_object('status', 'unknown'),
        'autonomyPosture', 'strict', 'openQuestions', '[]'::jsonb, 'constraint_this_week', ''));
  END IF;
  IF email IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM bootstrap_os.company_acl AS existing
    WHERE existing.company_id = cid
      AND existing.principal = email
      AND existing.principal_kind = 'email'
  ) THEN
    INSERT INTO bootstrap_os.company_acl (company_id, principal, principal_kind, role)
    VALUES (cid, email, 'email', 'founder_authorized')
    ON CONFLICT (company_id, principal, principal_kind) DO NOTHING;
  END IF;
  RETURN cid;
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_os_ensure_company(text) FROM PUBLIC, anon;

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
  IF NOT bootstrap_os.has_role(cid, 'founder', 'founder_authorized') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'founder only');
  END IF;
  SELECT * INTO before_row FROM bootstrap_os.company_acl
  WHERE company_id = cid AND principal = v_principal AND principal_kind = v_kind;
  IF v_op = 'grant' THEN
    INSERT INTO bootstrap_os.company_acl (company_id, principal, principal_kind, role)
    VALUES (cid, v_principal, v_kind, v_role)
    ON CONFLICT (company_id, principal, principal_kind) DO NOTHING;
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

REVOKE ALL ON FUNCTION public.bootstrap_os_change_acl(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_change_acl(text, text, text, text, text) TO authenticated;

CREATE FUNCTION public.bootstrap_os_put_journey(
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

REVOKE ALL ON FUNCTION public.bootstrap_os_put_journey(text, text, text, boolean, int, int, text, text, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_put_journey(text, text, text, boolean, int, int, text, text, text, jsonb, text) TO authenticated;

DROP FUNCTION IF EXISTS public.bootstrap_os_grant_acl_internal(uuid, text, text, boolean);
DROP FUNCTION IF EXISTS public.bootstrap_os_grant_acl_internal(uuid, text, text);

-- Restore read RPCs and create_idea to the pre-20261110 bodies (they call 1-arg ensure_company).
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
    'scoreboard', i.scoreboard
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
    'company', jsonb_strip_nulls(jsonb_build_object('slug', company_row.slug, 'label', company_row.label)),
    'ideas', ideas,
    'owners', owners,
    'audit', audit
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_os_get_journey(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_get_journey(text, text) TO authenticated;

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
  cid := public.bootstrap_os_ensure_company(p_company);
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
    cid, v_slug, coalesce(v_label, v_slug), 1, 1, 'hold',
    jsonb_build_object('schema_version', 1, 'constraint_this_week', '')
  )
  RETURNING * INTO idea_row;
  iid := idea_row.id;
  PERFORM bootstrap_os.emit_audit(
    cid, iid, coalesce(email, 'unknown'), 'mcp',
    jsonb_build_object('op', 'create_idea', 'via', 'create_idea', 'idea', v_slug)
  );
  RETURN public.bootstrap_os_get_journey(p_company, v_slug);
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_os_create_idea(text, text, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_create_idea(text, text, text, boolean, text) TO authenticated;

COMMIT;

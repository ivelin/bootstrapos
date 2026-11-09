-- ensure_company(text, text) seeds the founder as owner-tier and the caller as commenter.
-- Cos applies on supabase-pirin-ai. PR agents: PGlite/pg16 only. Do not apply from a PR agent.
-- No second ensure_company overload: the 1-arg function is dropped in this transaction.
-- No companies.founder / p_founder display-name binding. No backfill of existing boards.

BEGIN;

CREATE FUNCTION public.bootstrap_os_grant_acl_internal(
  p_company_id uuid,
  p_email text,
  p_role text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_role text := lower(trim(coalesce(p_role, '')));
  v_slug text;
  v_mentee uuid;
BEGIN
  IF v_email IS NULL THEN
    RETURN;
  END IF;
  SELECT c.slug INTO v_slug
  FROM bootstrap_os.companies c
  WHERE c.id = p_company_id;
  IF v_slug IS NULL THEN
    RAISE EXCEPTION 'company not visible';
  END IF;
  INSERT INTO public.bootstrap_mcp_mentees (email)
  VALUES (v_email)
  ON CONFLICT (email) DO NOTHING;
  SELECT id INTO v_mentee
  FROM public.bootstrap_mcp_mentees
  WHERE email = v_email;
  INSERT INTO public.bootstrap_company_labels (mentee_id, label)
  VALUES (v_mentee, v_slug)
  ON CONFLICT (mentee_id, label) DO NOTHING;
  -- principal_kind is always email. Display name is never bound.
  INSERT INTO bootstrap_os.company_acl (company_id, principal, principal_kind, role)
  VALUES (p_company_id, v_email, 'email', v_role)
  ON CONFLICT (company_id, principal, principal_kind) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_os_grant_acl_internal(uuid, text, text) FROM PUBLIC, anon, authenticated;

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
    IF v_kind = 'email' THEN
      PERFORM public.bootstrap_os_grant_acl_internal(cid, v_principal, v_role);
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

REVOKE ALL ON FUNCTION public.bootstrap_os_change_acl(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_change_acl(text, text, text, text, text) TO authenticated;

DROP FUNCTION public.bootstrap_os_ensure_company(text);

CREATE FUNCTION public.bootstrap_os_ensure_company(p_company text, p_founder_email text DEFAULT NULL)
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
  SELECT c.id INTO cid FROM bootstrap_os.companies c WHERE c.slug = v_slug;
  IF cid IS NULL THEN
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
    IF caller_email IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM bootstrap_os.company_acl AS existing
      WHERE existing.company_id = cid
        AND existing.principal = caller_email
        AND existing.principal_kind = 'email'
    ) THEN
      INSERT INTO bootstrap_os.company_acl (company_id, principal, principal_kind, role)
      VALUES (cid, caller_email, 'email', 'founder_authorized')
      ON CONFLICT (company_id, principal, principal_kind) DO NOTHING;
    END IF;
  END IF;
  RETURN cid;
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_os_ensure_company(text, text) FROM PUBLIC, anon;

DROP FUNCTION IF EXISTS public.bootstrap_os_put_journey(text, text, text, boolean, int, int, text, text, text, jsonb, text);

CREATE FUNCTION public.bootstrap_os_put_journey(
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
BEGIN
  IF nullif(trim(coalesce(p_why, '')), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'why required');
  END IF;
  cid := public.bootstrap_os_ensure_company(p_company, p_founder_email);
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

REVOKE ALL ON FUNCTION public.bootstrap_os_put_journey(text, text, text, boolean, int, int, text, text, text, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_put_journey(text, text, text, boolean, int, int, text, text, text, jsonb, text, text) TO authenticated;

COMMENT ON FUNCTION public.bootstrap_os_put_journey(text, text, text, boolean, int, int, text, text, text, jsonb, text, text) IS
  'Optional p_founder writes bootstrap_os.companies.founder (empty clears, null leaves it). Not an ACL role. Optional p_founder_email is forwarded to ensure_company on create.';

COMMIT;

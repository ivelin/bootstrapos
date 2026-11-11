-- Function only. Reject server-written scoreboard keys from a user JWT.
-- Shape Up keys stay on the fleet slug. No table or column changes.
-- Rebuilt after main's 20261112 put_journey (has_rank + founder invite on create).
-- Do not migrate or live-probe supabase-pirin-ai from a PR cloud agent.

BEGIN;

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
  v_created boolean := false;
  v_invite jsonb;
  v_skip text;
BEGIN
  IF nullif(trim(coalesce(p_why, '')), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'why required');
  END IF;
  SELECT r.company_id, r.created INTO cid, v_created
  FROM bootstrap_os.ensure_company_for_actor(p_company, p_founder_email, true) AS r;
  IF NOT v_created AND NOT bootstrap_os.has_rank(cid, 3) THEN
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
  IF p_scoreboard IS NOT NULL AND jsonb_typeof(p_scoreboard) = 'object'
     AND (p_scoreboard ? 'breaker_state' OR p_scoreboard ? 'shape_up_nudges') THEN
    RAISE EXCEPTION 'server-written scoreboard key';
  END IF;
  IF p_scoreboard IS NOT NULL AND jsonb_typeof(p_scoreboard) = 'object'
     AND (p_scoreboard ? 'appetite' OR p_scoreboard ? 'breaker' OR p_scoreboard ? 'shape_up_test')
     AND lower(btrim(coalesce(p_company, ''))) IS DISTINCT FROM 'pirin' THEN
    RAISE EXCEPTION 'shape up is not enabled for this company';
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
  IF v_created THEN
    SELECT s.reason INTO v_skip
    FROM bootstrap_os.founder_invite_skip s
    WHERE s.board_id = cid;
    DELETE FROM bootstrap_os.founder_invite_skip WHERE board_id = cid;
    IF v_skip IS NOT NULL AND v_skip NOT IN ('inviter_not_on_allowlist', 'rate_limited', 'rate_limiter_unavailable') THEN
      v_skip := NULL;
    END IF;
    SELECT jsonb_build_object(
      'inviteeEmail', o.payload #>> '{to,email}',
      'inviterEmail', o.payload #>> '{from,email}',
      'companyWorkspace', o.payload ->> 'companyWorkspace',
      'inviteToken', o.payload ->> 'inviteToken'
    )
    INTO v_invite
    FROM public.bootstrap_mcp_invite_outbox o
    JOIN public.bootstrap_mcp_invites i ON i.id = o.invite_id
    WHERE i.company_label = lower(p_company)
      AND o.channel = 'email'
      AND o.id = (
        SELECT o2.id
        FROM public.bootstrap_mcp_invite_outbox o2
        JOIN public.bootstrap_mcp_invites i2 ON i2.id = o2.invite_id
        WHERE i2.company_label = lower(p_company)
          AND o2.channel = 'email'
        ORDER BY o2.created_at DESC
        LIMIT 1
      );
  END IF;
  RETURN board || bundle || CASE
    WHEN v_invite IS NOT NULL AND v_invite ->> 'inviteToken' IS NOT NULL THEN jsonb_build_object('founderInvite', v_invite)
    WHEN v_skip IS NOT NULL THEN jsonb_build_object('founderInvite', jsonb_build_object('skipped', true, 'reason', v_skip))
    ELSE '{}'::jsonb
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_os_put_journey(text, text, text, boolean, int, int, text, text, text, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_put_journey(text, text, text, boolean, int, int, text, text, text, jsonb, text, text) TO authenticated;

COMMENT ON FUNCTION public.bootstrap_os_put_journey(text, text, text, boolean, int, int, text, text, text, jsonb, text, text) IS
  'User JWT cannot write breaker_state or shape_up_nudges. Shape Up keys require the fleet slug.';

-- Clock for the breaker. Tests replace this function. Callers cannot.
CREATE OR REPLACE FUNCTION bootstrap_os.shape_up_now()
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $$
  SELECT pg_catalog.now();
$$;

REVOKE ALL ON FUNCTION bootstrap_os.shape_up_now() FROM PUBLIC, anon, authenticated;

-- CTO option 4. The breach rules live here. The user JWT cannot pass the time or the server keys.
CREATE OR REPLACE FUNCTION public.bootstrap_os_check_breakers(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, bootstrap_os
AS $$
DECLARE
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_company uuid;
  v_local timestamp;
  v_iso text;
  v_sunday boolean;
  v_idea bootstrap_os.ideas%ROWTYPE;
  v_cap numeric;
  v_costs numeric;
  v_kill text;
  v_over boolean;
  v_hits text[];
  v_breach text;
  v_nudges jsonb;
  v_card text;
  v_added boolean;
  v_who text;
  v_tripped jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.bootstrap_os_held_label(v_slug) THEN
    RAISE EXCEPTION 'company not visible';
  END IF;
  IF v_slug IS DISTINCT FROM 'pirin' THEN
    RAISE EXCEPTION 'shape up is not enabled for this company';
  END IF;

  SELECT id INTO v_company FROM bootstrap_os.companies WHERE slug = v_slug;
  IF v_company IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'readOnly', true, 'tripped', '[]'::jsonb, 'gateUnchanged', true);
  END IF;

  v_local := bootstrap_os.shape_up_now() AT TIME ZONE 'America/Chicago';
  v_iso := to_char(v_local, 'YYYY-MM-DD');
  v_sunday := EXTRACT(DOW FROM v_local) = 0;
  v_who := coalesce(bootstrap_os.actor_principal(), 'unknown');

  FOR v_idea IN
    SELECT * FROM bootstrap_os.ideas
    WHERE company_id = v_company AND current_gate <> 'kill'
    ORDER BY slug
  LOOP
    IF (v_idea.scoreboard -> 'shape_up_test') IS DISTINCT FROM 'true'::jsonb THEN
      CONTINUE;
    END IF;

    v_cap := NULL;
    v_costs := NULL;
    IF jsonb_typeof(v_idea.scoreboard -> 'appetite') = 'object'
       AND jsonb_typeof(v_idea.scoreboard #> '{appetite,usd_cap}') = 'number' THEN
      v_cap := (v_idea.scoreboard #>> '{appetite,usd_cap}')::numeric;
    END IF;
    IF jsonb_typeof(v_idea.scoreboard -> 'pnl') = 'object'
       AND coalesce(v_idea.scoreboard #>> '{pnl,costsUnknown}', '') IS DISTINCT FROM 'true'
       AND jsonb_typeof(v_idea.scoreboard #> '{pnl,costs}') = 'number' THEN
      v_costs := (v_idea.scoreboard #>> '{pnl,costs}')::numeric;
    END IF;
    v_over := v_cap IS NOT NULL AND v_costs IS NOT NULL AND v_costs > (v_cap * 2);
    IF v_sunday AND NOT v_over THEN
      CONTINUE;
    END IF;

    v_hits := ARRAY[]::text[];
    v_kill := NULL;
    IF jsonb_typeof(v_idea.scoreboard -> 'breaker') = 'object' THEN
      v_kill := v_idea.scoreboard #>> '{breaker,kill_on}';
    END IF;
    IF v_kill ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
      BEGIN
        IF to_char(v_kill::date, 'YYYY-MM-DD') = v_kill AND v_iso > v_kill THEN
          v_hits := array_append(v_hits, 'kill_on');
        END IF;
      EXCEPTION
        WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation THEN
          NULL;
      END;
    END IF;
    IF v_cap IS NOT NULL AND v_costs IS NOT NULL AND v_costs >= v_cap THEN
      v_hits := array_append(v_hits, 'spend');
    END IF;

    v_nudges := CASE
      WHEN jsonb_typeof(v_idea.scoreboard -> 'shape_up_nudges') = 'array' THEN v_idea.scoreboard -> 'shape_up_nudges'
      ELSE '[]'::jsonb
    END;
    v_card := v_idea.id::text;
    v_added := false;
    FOREACH v_breach IN ARRAY v_hits LOOP
      IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_nudges) AS elem
        WHERE elem->>'card_id' = v_card AND elem->>'breach' = v_breach
      ) THEN
        CONTINUE;
      END IF;
      v_nudges := v_nudges || jsonb_build_array(jsonb_build_object('card_id', v_card, 'breach', v_breach));
      v_tripped := v_tripped || jsonb_build_array(jsonb_build_object(
        'card_id', v_card,
        'breach', v_breach,
        'slug', v_idea.slug
      ));
      PERFORM bootstrap_os.emit_audit(
        v_company,
        v_idea.id,
        v_who,
        'check_breakers',
        jsonb_build_object(
          'op', 'check_breakers',
          'via', 'check_breakers',
          'card_id', v_card,
          'breach', v_breach,
          'gateUnchanged', true
        )
      );
      v_added := true;
    END LOOP;
    IF NOT v_added THEN
      CONTINUE;
    END IF;

    UPDATE bootstrap_os.ideas
    SET scoreboard = jsonb_set(
          jsonb_set(coalesce(scoreboard, '{}'::jsonb), '{shape_up_nudges}', v_nudges, true),
          '{breaker_state}',
          '"tripped"'::jsonb,
          true
        ),
        updated_at = pg_catalog.now()
    WHERE id = v_idea.id;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'readOnly', jsonb_array_length(v_tripped) = 0,
    'tripped', v_tripped,
    'gateUnchanged', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_os_check_breakers(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_check_breakers(text) TO authenticated;

COMMENT ON FUNCTION public.bootstrap_os_check_breakers(text) IS
  'Fleet slug only. Writes breaker_state and shape_up_nudges from stored cards. No caller clock.';

-- A founder UPDATE grant cannot clear server keys. The definer's current_user is the function owner.
-- On Supabase this migration runs as postgres, so postgres owns the function. No superuser GUC.
CREATE OR REPLACE FUNCTION bootstrap_os.ideas_keep_breaker_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, bootstrap_os
AS $$
DECLARE
  v_owner name;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_owner
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'bootstrap_os_check_breakers'
  ORDER BY p.oid
  LIMIT 1;
  IF v_owner IS NOT NULL AND current_user = v_owner THEN
    RETURN NEW;
  END IF;
  IF (NEW.scoreboard -> 'breaker_state') IS DISTINCT FROM (OLD.scoreboard -> 'breaker_state')
     OR (NEW.scoreboard -> 'shape_up_nudges') IS DISTINCT FROM (OLD.scoreboard -> 'shape_up_nudges') THEN
    RAISE EXCEPTION 'server-written scoreboard key';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION bootstrap_os.ideas_keep_breaker_state() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ideas_keep_breaker_state ON bootstrap_os.ideas;
CREATE TRIGGER ideas_keep_breaker_state
  BEFORE UPDATE ON bootstrap_os.ideas
  FOR EACH ROW
  EXECUTE FUNCTION bootstrap_os.ideas_keep_breaker_state();

COMMIT;

-- Held labels and email-matched ACL grants require a confirmed auth email.
-- Board create + invite paths take bootstrap_hosted_take and return jsonb reason codes (no 5xx).
-- Cos applies on supabase-pirin-ai. PR agents: PGlite/pg16 only. Do not apply from a PR agent.
-- Compatible with feat/founder-invite-on-create (20261112): that branch also takes invite_member
-- inside ensure_company_for_actor; this file does not mint founder invites and does not depend on it.

BEGIN;

-- Confirmed JWT email only. Unconfirmed or missing auth.users row => NULL (no ACL email match).
CREATE OR REPLACE FUNCTION bootstrap_os.actor_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, bootstrap_os, public
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM auth.users AS u
      WHERE u.id = auth.uid()
        AND u.email_confirmed_at IS NOT NULL
    ) THEN NULLIF(lower(auth.jwt() ->> 'email'), '')
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION bootstrap_os.actor_email() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION bootstrap_os.actor_email() TO authenticated;

-- Label hold is false unless the caller is confirmed. No RAISE.
CREATE OR REPLACE FUNCTION public.bootstrap_os_held_label(p_company text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, bootstrap_os, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.bootstrap_mcp_mentees AS m
    JOIN public.bootstrap_company_labels AS l ON l.mentee_id = m.id
    JOIN auth.users AS u ON u.id = auth.uid() AND u.email_confirmed_at IS NOT NULL
    WHERE l.label = lower(p_company)
      AND (
        m.email = NULLIF(lower(auth.jwt() ->> 'email'), '')
        OR m.auth_user_id::text = NULLIF(auth.jwt() ->> 'sub', '')
      )
  );
$$;

REVOKE ALL ON FUNCTION public.bootstrap_os_held_label(text) FROM PUBLIC, anon;

-- Identity labels: unconfirmed callers get a reason code and nothing is bound or returned as held.
CREATE OR REPLACE FUNCTION public.bootstrap_mcp_my_labels()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  uid uuid := auth.uid();
  user_email text;
  confirmed timestamptz;
  found_id uuid;
  labels jsonb;
  live text;
  membership jsonb;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT lower(u.email), u.email_confirmed_at
    INTO user_email, confirmed
  FROM auth.users AS u
  WHERE u.id = uid;

  IF confirmed IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'email_unconfirmed',
      'authenticated', false,
      'email', user_email,
      'labels', '[]'::jsonb,
      'role', 'unset',
      'reason', 'email_unconfirmed'
    );
  END IF;

  SELECT id INTO found_id
  FROM public.bootstrap_mcp_mentees
  WHERE auth_user_id = uid OR email = user_email;

  IF found_id IS NULL THEN
    RETURN jsonb_build_object(
      'authenticated', false,
      'email', user_email,
      'labels', '[]'::jsonb,
      'role', 'unset',
      'reason', 'not_invited'
    );
  END IF;

  UPDATE public.bootstrap_mcp_mentees
  SET auth_user_id = uid
  WHERE id = found_id
    AND auth_user_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.bootstrap_mcp_mentees AS m2 WHERE m2.auth_user_id = uid
    );

  SELECT coalesce(jsonb_agg(l.label ORDER BY l.label), '[]'::jsonb)
  INTO labels
  FROM public.bootstrap_company_labels AS l
  WHERE l.mentee_id = found_id;

  live := public.bootstrap_os_live_role(found_id);
  membership := public.bootstrap_os_membership_for(uid, user_email);

  RETURN jsonb_build_object(
    'authenticated', true,
    'email', user_email,
    'labels', labels,
    'role', coalesce(live, 'unset'),
    'membership_level', membership ->> 'level',
    'membership_status', membership ->> 'status',
    'note', 'Companies this login can open. A company may have several ideas; each idea is its own 0-1 board.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_mcp_my_labels() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_mcp_my_labels() TO authenticated;

CREATE OR REPLACE FUNCTION public.bootstrap_mcp_accept_pending_invites(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  uid uuid := auth.uid();
  user_email text;
  confirmed timestamptz;
  invite public.bootstrap_mcp_invites%ROWTYPE;
  v_mentee_id uuid;
  labels jsonb := '[]'::jsonb;
  accepted jsonb := '[]'::jsonb;
  token_state text;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'email_required');
  END IF;

  SELECT lower(u.email), u.email_confirmed_at
    INTO user_email, confirmed
  FROM auth.users AS u
  WHERE u.id = uid;

  IF confirmed IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_unconfirmed');
  END IF;
  IF user_email IS NULL OR user_email = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'email_required');
  END IF;

  IF p_token IS NOT NULL AND length(p_token) >= 16 THEN
    SELECT CASE WHEN revoked_at IS NULL THEN 'live' ELSE 'revoked' END
      INTO token_state
    FROM public.bootstrap_mcp_access_tokens
    WHERE token_hash = public.bootstrap_mcp_hash_token(p_token);

    IF token_state = 'revoked' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_token');
    END IF;

    INSERT INTO public.bootstrap_mcp_access_tokens (token_hash, auth_user_id)
    VALUES (public.bootstrap_mcp_hash_token(p_token), uid)
    ON CONFLICT (token_hash) DO NOTHING;
  END IF;

  INSERT INTO public.bootstrap_mcp_oauth_subjects (auth_user_id, email, rotated_at)
  VALUES (uid, user_email, now())
  ON CONFLICT (auth_user_id) DO UPDATE
    SET email = EXCLUDED.email,
        rotated_at = now();

  FOR invite IN
    SELECT *
    FROM public.bootstrap_mcp_invites
    WHERE lower(invitee_email) = user_email
      AND accepted_at IS NULL
      AND expires_at > now()
    ORDER BY created_at
  LOOP
    SELECT id INTO v_mentee_id
    FROM public.bootstrap_mcp_mentees
    WHERE email = user_email;

    IF v_mentee_id IS NULL THEN
      INSERT INTO public.bootstrap_mcp_mentees (email, auth_user_id)
      VALUES (user_email, uid)
      ON CONFLICT (email) DO NOTHING;
      SELECT id INTO v_mentee_id
      FROM public.bootstrap_mcp_mentees
      WHERE email = user_email;
    ELSE
      UPDATE public.bootstrap_mcp_mentees
      SET auth_user_id = uid
      WHERE id = v_mentee_id
        AND auth_user_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.bootstrap_mcp_mentees AS m2 WHERE m2.auth_user_id = uid
        );
    END IF;

    INSERT INTO public.bootstrap_mcp_invite_redemptions (invite_id, mentee_id, auth_user_id)
    VALUES (invite.id, v_mentee_id, uid)
    ON CONFLICT (invite_id) DO NOTHING;

    UPDATE public.bootstrap_mcp_invites
    SET accepted_at = now()
    WHERE id = invite.id
      AND accepted_at IS NULL;

    INSERT INTO public.bootstrap_company_labels (mentee_id, label)
    VALUES (v_mentee_id, invite.company_label)
    ON CONFLICT (mentee_id, label) DO NOTHING;

    UPDATE public.bootstrap_mcp_oauth_subjects
    SET mentee_id = v_mentee_id
    WHERE auth_user_id = uid;

    accepted := accepted || jsonb_build_array(invite.company_label);
  END LOOP;

  IF v_mentee_id IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(l.label ORDER BY l.label), '[]'::jsonb)
      INTO labels
    FROM public.bootstrap_company_labels AS l
    WHERE l.mentee_id = v_mentee_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'email', user_email,
    'accepted', accepted,
    'labels', labels
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.bootstrap_mcp_accept_invite(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  uid uuid := auth.uid();
  user_email text;
  confirmed timestamptz;
  invite public.bootstrap_mcp_invites%ROWTYPE;
  v_mentee_id uuid;
  labels jsonb;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'email_required');
  END IF;

  SELECT lower(u.email), u.email_confirmed_at
    INTO user_email, confirmed
  FROM auth.users AS u
  WHERE u.id = uid;

  IF confirmed IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_unconfirmed');
  END IF;
  IF user_email IS NULL OR user_email = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'email_required');
  END IF;

  IF p_token IS NULL OR length(p_token) < 16 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invite_not_found');
  END IF;

  SELECT * INTO invite
  FROM public.bootstrap_mcp_invites
  WHERE token_hash = public.bootstrap_mcp_hash_token(p_token);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invite_not_found');
  END IF;

  IF invite.invitee_email <> user_email THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invite_email_mismatch');
  END IF;

  IF invite.accepted_at IS NOT NULL THEN
    SELECT id INTO v_mentee_id
    FROM public.bootstrap_mcp_mentees
    WHERE email = invite.invitee_email;

    SELECT coalesce(jsonb_agg(l.label ORDER BY l.label), '[]'::jsonb)
      INTO labels
    FROM public.bootstrap_company_labels AS l
    WHERE l.mentee_id = v_mentee_id;

    RETURN jsonb_build_object(
      'ok', true,
      'email', invite.invitee_email,
      'labels', coalesce(labels, '[]'::jsonb),
      'companyWorkspace', invite.company_label,
      'note', 'Already accepted.'
    );
  END IF;

  IF invite.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invite_expired');
  END IF;

  UPDATE public.bootstrap_mcp_invites
  SET accepted_at = now()
  WHERE id = invite.id
    AND accepted_at IS NULL;

  SELECT id INTO v_mentee_id
  FROM public.bootstrap_mcp_mentees
  WHERE email = invite.invitee_email;

  IF v_mentee_id IS NULL THEN
    INSERT INTO public.bootstrap_mcp_mentees (email, auth_user_id)
    VALUES (invite.invitee_email, uid)
    ON CONFLICT (email) DO NOTHING;
    SELECT id INTO v_mentee_id
    FROM public.bootstrap_mcp_mentees
    WHERE email = invite.invitee_email;
  ELSE
    UPDATE public.bootstrap_mcp_mentees
    SET auth_user_id = uid
    WHERE id = v_mentee_id
      AND auth_user_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.bootstrap_mcp_mentees AS m2 WHERE m2.auth_user_id = uid
      );
  END IF;

  INSERT INTO public.bootstrap_mcp_invite_redemptions (invite_id, mentee_id, auth_user_id)
  VALUES (invite.id, v_mentee_id, uid)
  ON CONFLICT (invite_id) DO NOTHING;

  INSERT INTO public.bootstrap_company_labels (mentee_id, label)
  VALUES (v_mentee_id, invite.company_label)
  ON CONFLICT (mentee_id, label) DO NOTHING;

  SELECT coalesce(jsonb_agg(l.label ORDER BY l.label), '[]'::jsonb)
    INTO labels
  FROM public.bootstrap_company_labels AS l
  WHERE l.mentee_id = v_mentee_id;

  RETURN jsonb_build_object(
    'ok', true,
    'email', invite.invitee_email,
    'labels', labels,
    'companyWorkspace', invite.company_label,
    'note', 'Allowlist + label bound. Labels only. Not boards. Not company-state.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_mcp_accept_pending_invites(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bootstrap_mcp_accept_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_mcp_accept_pending_invites(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_mcp_accept_invite(text) TO authenticated;

-- Scoped ACL invite accept: confirmed email only.
CREATE OR REPLACE FUNCTION public.bootstrap_os_invite_accept(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, bootstrap_os, public
AS $$
DECLARE
  uid uuid := auth.uid();
  confirmed timestamptz;
  actor_email text;
  digest text;
  invite bootstrap_os.invites%ROWTYPE;
  claimed uuid;
  grant_row record;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'token_not_found');
  END IF;
  SELECT u.email_confirmed_at INTO confirmed FROM auth.users AS u WHERE u.id = uid;
  IF confirmed IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_unconfirmed');
  END IF;

  PERFORM bootstrap_os.require_actor();
  actor_email := bootstrap_os.resolved_actor_email();
  IF actor_email IS NULL OR p_token IS NULL OR length(p_token) < 16 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'token_not_found');
  END IF;
  digest := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  UPDATE bootstrap_os.invites
  SET status = 'accepted', accepted_at = now(), accepted_by = actor_email
  WHERE token_hash = digest
    AND status = 'pending'
    AND expires_at > now()
    AND invitee_email = actor_email
  RETURNING id INTO claimed;
  IF claimed IS NULL THEN
    SELECT * INTO invite FROM bootstrap_os.invites WHERE token_hash = digest;
    IF invite.id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'token_not_found');
    END IF;
    IF invite.invitee_email <> actor_email THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'email_mismatch');
    END IF;
    IF invite.expires_at <= now() THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'expired');
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'already_accepted');
  END IF;
  FOR grant_row IN
    SELECT ic.company_id, ic.role
    FROM bootstrap_os.invite_companies AS ic
    WHERE ic.invite_id = claimed
  LOOP
    INSERT INTO bootstrap_os.company_acl (company_id, principal, principal_kind, role)
    SELECT grant_row.company_id, actor_email, 'email', grant_row.role
    WHERE NOT EXISTS (
      SELECT 1 FROM bootstrap_os.company_acl AS a
      WHERE a.company_id = grant_row.company_id
        AND a.principal = actor_email
        AND a.principal_kind = 'email'
    );
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'inviteeEmail', actor_email);
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_os_invite_accept(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_invite_accept(text) TO authenticated;

-- Board create takes create_company. Fail closed. RAISE so callers that return jsonb can map it.
CREATE OR REPLACE FUNCTION bootstrap_os.ensure_company_for_actor(
  p_company text,
  p_founder_email text DEFAULT NULL,
  p_create boolean DEFAULT false,
  OUT company_id uuid,
  OUT created boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, bootstrap_os, public
AS $$
DECLARE
  v_slug text := lower(p_company);
  caller_email text := bootstrap_os.actor_email();
  v_founder text := nullif(lower(trim(p_founder_email)), '');
  v_super boolean := false;
  v_rate jsonb;
  v_code text;
BEGIN
  created := false;
  PERFORM pg_advisory_xact_lock(hashtext('bootstrap_os.company:' || v_slug));
  SELECT c.id INTO company_id FROM bootstrap_os.companies AS c WHERE c.slug = v_slug;
  IF company_id IS NULL AND p_create IS NOT TRUE THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  IF company_id IS NULL THEN
    IF v_founder IS NOT NULL AND v_founder !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
      RAISE EXCEPTION 'invalid_founder_email';
    END IF;
    IF caller_email IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.bootstrap_os_roles AS r
        JOIN public.bootstrap_mcp_mentees AS m ON m.id = r.mentee_id
        WHERE m.email = caller_email
          AND r.role = 'super_admin'
          AND r.revoked_at IS NULL
      ) INTO v_super;
    END IF;
    IF v_founder IS NULL AND v_super THEN
      RAISE EXCEPTION 'founder_email_required: pass founderEmail';
    END IF;

    BEGIN
      v_rate := public.bootstrap_hosted_take('create_company');
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'rate_limiter_unavailable' USING ERRCODE = 'P0001';
    END;
    IF coalesce((v_rate ->> 'ok')::boolean, false) IS DISTINCT FROM true THEN
      v_code := coalesce(nullif(v_rate ->> 'error', ''), nullif(v_rate ->> 'reason', ''), 'rate_limiter_unavailable');
      IF v_code NOT IN ('rate_limited', 'rate_limiter_unavailable') THEN
        v_code := 'rate_limiter_unavailable';
      END IF;
      RAISE EXCEPTION '%', v_code USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO bootstrap_os.companies (slug, label) VALUES (v_slug, v_slug)
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO company_id;
    IF company_id IS NOT NULL THEN
      created := true;
      INSERT INTO bootstrap_os.ideas (company_id, slug, name, journey_phase, loop_stage, current_gate, scoreboard)
      VALUES (company_id, 'default', v_slug, 1, 1, 'hold',
        jsonb_build_object('schema_version', 1, 'readyForHumanEyes', jsonb_build_object('status', 'unknown'),
          'autonomyPosture', 'strict', 'openQuestions', '[]'::jsonb, 'constraint_this_week', ''));
      IF v_founder IS NULL OR v_founder = caller_email THEN
        PERFORM public.bootstrap_os_grant_acl_internal(company_id, caller_email, 'founder');
      ELSE
        PERFORM public.bootstrap_os_grant_acl_internal(company_id, v_founder, 'founder');
        PERFORM public.bootstrap_os_grant_acl_internal(company_id, caller_email, 'commenter');
      END IF;
    ELSE
      SELECT c.id INTO company_id FROM bootstrap_os.companies AS c WHERE c.slug = v_slug;
      IF NOT public.bootstrap_os_held_label(v_slug) THEN
        RAISE EXCEPTION 'company not visible';
      END IF;
    END IF;
  ELSE
    IF NOT public.bootstrap_os_held_label(v_slug) THEN
      RAISE EXCEPTION 'company not visible';
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION bootstrap_os.ensure_company_for_actor(text, text, boolean) FROM PUBLIC, anon, authenticated;

-- Map board-create rate refusals to jsonb (HTTP 200 path via PostgREST jsonb RPC).
CREATE OR REPLACE FUNCTION public.bootstrap_os_create_idea(
  p_company text,
  p_idea text,
  p_name text DEFAULT NULL,
  p_founder_yes boolean DEFAULT FALSE,
  p_why text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, bootstrap_os AS $$
DECLARE
  cid uuid;
  v_slug text := lower(trim(coalesce(p_idea, '')));
  v_label text := nullif(trim(coalesce(p_name, '')), '');
  email text := bootstrap_os.actor_email();
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
  EXCEPTION
    WHEN SQLSTATE 'P0002' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_found');
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM IN ('rate_limited', 'rate_limiter_unavailable') THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', SQLERRM,
          'reason', SQLERRM,
          'message', CASE
            WHEN SQLERRM = 'rate_limiter_unavailable'
              THEN 'The limiter could not be reached. This action was refused.'
            ELSE 'Limit reached for create_company. Try again later.'
          END
        );
      END IF;
      RAISE;
  END;
  IF NOT bootstrap_os.has_rank(cid, 3) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_role', 'message', 'Your role on this board can comment, but not edit. Ask the founder to invite you to edit.');
  END IF;
  IF EXISTS (SELECT 1 FROM bootstrap_os.ideas AS i WHERE i.company_id = cid AND i.slug = v_slug) THEN
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

REVOKE ALL ON FUNCTION public.bootstrap_os_create_idea(text, text, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_create_idea(text, text, text, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.bootstrap_os_put_journey(
  p_company text, p_idea text, p_why text, p_founder_yes boolean,
  p_journey_phase int DEFAULT NULL, p_loop_stage int DEFAULT NULL,
  p_current_gate text DEFAULT NULL, p_constraint text DEFAULT NULL,
  p_founder_written_decision text DEFAULT NULL,
  p_scoreboard jsonb DEFAULT NULL,
  p_founder text DEFAULT NULL,
  p_founder_email text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, bootstrap_os AS $$
DECLARE
  cid uuid;
  idea_row bootstrap_os.ideas%ROWTYPE;
  email text := bootstrap_os.actor_email();
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
BEGIN
  IF nullif(trim(coalesce(p_why, '')), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'why required');
  END IF;
  BEGIN
    SELECT r.company_id, r.created INTO cid, v_created
    FROM bootstrap_os.ensure_company_for_actor(p_company, p_founder_email, true) AS r;
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM IN ('rate_limited', 'rate_limiter_unavailable') THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', SQLERRM,
          'reason', SQLERRM,
          'message', CASE
            WHEN SQLERRM = 'rate_limiter_unavailable'
              THEN 'The limiter could not be reached. This action was refused.'
            ELSE 'Limit reached for create_company. Try again later.'
          END
        );
      END IF;
      RAISE;
  END;
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

-- Self-serve board create also takes create_company (uuid return keeps RAISE; callers map the code).
CREATE OR REPLACE FUNCTION public.create_company_self_serve(name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  max_companies constant integer := 3;
  uid uuid := auth.uid();
  confirmed timestamptz;
  user_email text;
  owned integer;
  v_name text := lower(pg_catalog.btrim(coalesce(name, '')));
  company_id uuid;
  mentee uuid;
  v_rate jsonb;
  v_code text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'email_unconfirmed' USING ERRCODE = 'P0001';
  END IF;

  SELECT u.email_confirmed_at, lower(u.email)
    INTO confirmed, user_email
  FROM auth.users AS u
  WHERE u.id = uid;

  IF confirmed IS NULL OR user_email IS NULL OR user_email = '' THEN
    RAISE EXCEPTION 'email_unconfirmed' USING ERRCODE = 'P0001';
  END IF;

  IF v_name !~ '^[a-z0-9][a-z0-9_-]{0,31}$' THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text, 0));

  SELECT count(*)::integer INTO owned
  FROM bootstrap_os.companies AS c
  WHERE c.created_by = uid
    AND c.starter IS NOT TRUE;

  IF owned >= max_companies THEN
    RAISE EXCEPTION 'company_limit_reached' USING ERRCODE = 'P0001';
  END IF;

  BEGIN
    v_rate := public.bootstrap_hosted_take('create_company');
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'rate_limiter_unavailable' USING ERRCODE = 'P0001';
  END;
  IF coalesce((v_rate ->> 'ok')::boolean, false) IS DISTINCT FROM true THEN
    v_code := coalesce(nullif(v_rate ->> 'error', ''), nullif(v_rate ->> 'reason', ''), 'rate_limiter_unavailable');
    IF v_code NOT IN ('rate_limited', 'rate_limiter_unavailable') THEN
      v_code := 'rate_limiter_unavailable';
    END IF;
    RAISE EXCEPTION '%', v_code USING ERRCODE = 'P0001';
  END IF;

  SELECT m.id INTO mentee
  FROM public.bootstrap_mcp_mentees AS m
  WHERE m.auth_user_id = uid OR m.email = user_email
  ORDER BY CASE WHEN m.auth_user_id = uid THEN 0 ELSE 1 END
  LIMIT 1;

  IF mentee IS NULL THEN
    INSERT INTO public.bootstrap_mcp_mentees (email, auth_user_id)
    VALUES (user_email, uid)
    RETURNING id INTO mentee;
  ELSE
    UPDATE public.bootstrap_mcp_mentees
    SET auth_user_id = coalesce(auth_user_id, uid)
    WHERE id = mentee;
  END IF;

  PERFORM pg_catalog.set_config('app.actor_id', uid::text, true);

  INSERT INTO bootstrap_os.companies (slug, label, created_by, starter)
  VALUES (v_name, v_name, uid, false)
  RETURNING id INTO company_id;

  INSERT INTO bootstrap_os.company_acl (company_id, principal, principal_kind, role)
  VALUES
    (company_id, user_email, 'email', 'owner'),
    (company_id, uid::text, 'sub', 'owner');

  INSERT INTO public.bootstrap_os_roles (mentee_id, role, granted_by, company_id)
  VALUES (mentee, 'owner', mentee, company_id);

  INSERT INTO public.bootstrap_os_companies (slug, display_name, created_by)
  VALUES (v_name, v_name, mentee);

  INSERT INTO public.bootstrap_company_labels (mentee_id, label)
  VALUES (mentee, v_name);

  RETURN company_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'slug_taken' USING ERRCODE = 'P0001';
END;
$$;

REVOKE ALL ON FUNCTION public.create_company_self_serve(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_company_self_serve(text) TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.create_company_self_serve(text) FROM service_role';
  END IF;
END $$;

COMMIT;

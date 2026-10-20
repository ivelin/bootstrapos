CREATE TABLE public.bootstrap_rate_window (
  actor_id text NOT NULL,
  action text NOT NULL,
  window_start timestamptz NOT NULL,
  window_seconds int NOT NULL,
  taken int NOT NULL,
  PRIMARY KEY (actor_id, action, window_start)
);

CREATE TABLE public.bootstrap_rate_cap (
  action text PRIMARY KEY,
  max_per_window int NOT NULL,
  window_seconds int NOT NULL
);

CREATE TABLE public.bootstrap_request_cap (
  name text PRIMARY KEY,
  max_value int NOT NULL
);

ALTER TABLE public.bootstrap_rate_window ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bootstrap_rate_cap ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bootstrap_request_cap ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bootstrap_rate_window FORCE ROW LEVEL SECURITY;
ALTER TABLE public.bootstrap_rate_cap FORCE ROW LEVEL SECURITY;
ALTER TABLE public.bootstrap_request_cap FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.bootstrap_rate_window FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.bootstrap_rate_cap FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.bootstrap_request_cap FROM PUBLIC, anon, authenticated;

INSERT INTO public.bootstrap_rate_cap (action, max_per_window, window_seconds) VALUES
  ('invite_member', 20, 86400),
  ('create_company', 5, 86400),
  ('create_idea', 50, 86400);

INSERT INTO public.bootstrap_request_cap (name, max_value) VALUES
  ('comment_body_bytes', 4096),
  ('provenance_page_rows', 100);

CREATE FUNCTION public.bootstrap_rate_take(
  p_actor text,
  p_action text,
  p_limit int,
  p_window_seconds int,
  p_now timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_window_start timestamptz;
  v_retry_at timestamptz;
  v_retry_text text;
  v_taken int;
BEGIN
  IF p_actor IS NULL OR btrim(p_actor) = ''
     OR p_action IS NULL OR p_action !~ '^[a-z][a-z0-9_]{0,63}$'
     OR p_limit IS NULL OR p_limit < 0 OR p_limit > 1000000
     OR p_window_seconds IS NULL OR p_window_seconds <= 0
     OR p_window_seconds > 366 * 86400
  THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'rate_limiter_unavailable',
      'reason', 'rate_limiter_unavailable',
      'message', 'The limiter could not be reached. This action was refused.'
    );
  END IF;

  v_window_start := to_timestamp(
    (floor(extract(epoch FROM p_now) / p_window_seconds) * p_window_seconds)::double precision
  );
  v_retry_at := v_window_start + make_interval(secs => p_window_seconds);
  v_retry_text := to_char(v_retry_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  DELETE FROM public.bootstrap_rate_window AS bucket
  WHERE bucket.actor_id = btrim(p_actor)
    AND bucket.action = p_action
    AND bucket.window_start + make_interval(secs => bucket.window_seconds) <= p_now;

  DELETE FROM public.bootstrap_rate_window AS bucket
  WHERE (bucket.actor_id, bucket.action, bucket.window_start) IN (
    SELECT sweep.actor_id, sweep.action, sweep.window_start
    FROM public.bootstrap_rate_window AS sweep
    WHERE sweep.window_start + make_interval(secs => sweep.window_seconds) <= p_now
    ORDER BY sweep.actor_id, sweep.action, sweep.window_start
    LIMIT 32
  );

  IF p_limit < 1 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'rate_limited',
      'reason', 'rate_limited',
      'message', 'Limit reached for ' || p_action || '. Try again after ' || v_retry_text || '.',
      'retryAt', v_retry_text
    );
  END IF;

  INSERT INTO public.bootstrap_rate_window AS bucket
    (actor_id, action, window_start, window_seconds, taken)
  VALUES (btrim(p_actor), p_action, v_window_start, p_window_seconds, 1)
  ON CONFLICT (actor_id, action, window_start)
  DO UPDATE SET taken = bucket.taken + 1
  WHERE bucket.taken < p_limit
  RETURNING bucket.taken INTO v_taken;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'rate_limited',
      'reason', 'rate_limited',
      'message', 'Limit reached for ' || p_action || '. Try again after ' || v_retry_text || '.',
      'retryAt', v_retry_text
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'remaining', p_limit - v_taken);
END;
$$;

CREATE FUNCTION public.bootstrap_hosted_take(p_action text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor text;
  v_cap_max int;
  v_cap_window int;
BEGIN
  v_actor := nullif(btrim(auth.uid()::text), '');
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'rate_limiter_unavailable',
      'reason', 'rate_limiter_unavailable',
      'message', 'The limiter could not be reached. This action was refused.'
    );
  END IF;

  SELECT cap.max_per_window, cap.window_seconds
    INTO v_cap_max, v_cap_window
  FROM public.bootstrap_rate_cap AS cap
  WHERE cap.action = p_action;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'rate_limiter_unavailable',
      'reason', 'rate_limiter_unavailable',
      'message', 'The limiter could not be reached. This action was refused.'
    );
  END IF;

  RETURN public.bootstrap_rate_take(v_actor, p_action, v_cap_max, v_cap_window);
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_rate_take(text, text, int, int, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bootstrap_hosted_take(text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.bootstrap_rate_take(text, text, int, int, timestamptz)
  TO current_user;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.bootstrap_rate_take(text, text, int, int, timestamptz)
      TO service_role;
  END IF;
END
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

CREATE OR REPLACE FUNCTION public.bootstrap_os_create_company(
  p_slug text,
  p_display_name text DEFAULT NULL,
  p_founder_yes boolean DEFAULT FALSE,
  p_why text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gate jsonb;
  v_slug text := lower(trim(coalesce(p_slug, '')));
  v_name text := nullif(trim(coalesce(p_display_name, '')), '');
  caller uuid;
  caller_email text;
  v_rate jsonb;
BEGIN
  gate := public.bootstrap_os_admin_gate();
  IF coalesce((gate ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'status', 403);
  END IF;
  IF p_founder_yes IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'status', 403, 'error', 'founder_yes_required');
  END IF;
  IF v_slug !~ '^[a-z0-9][a-z0-9_-]{0,31}$' THEN
    RETURN jsonb_build_object('ok', false, 'status', 403, 'error', 'invalid_slug');
  END IF;
  IF EXISTS (SELECT 1 FROM public.bootstrap_company_labels l WHERE l.label = v_slug)
     OR EXISTS (SELECT 1 FROM public.bootstrap_os_companies c WHERE c.slug = v_slug) THEN
    RETURN jsonb_build_object('ok', false, 'status', 409, 'error', 'slug_taken');
  END IF;

  caller := (gate ->> 'mentee_id')::uuid;
  caller_email := gate ->> 'email';

  BEGIN
    v_rate := public.bootstrap_hosted_take('create_company');
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limiter_unavailable', 'reason', 'rate_limiter_unavailable', 'message', 'The limiter could not be reached. This action was refused.');
  END;
  IF coalesce((v_rate ->> 'ok')::boolean, false) IS DISTINCT FROM true THEN
    IF coalesce(v_rate ->> 'error', v_rate ->> 'reason', '') = '' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'rate_limiter_unavailable', 'reason', 'rate_limiter_unavailable', 'message', 'The limiter could not be reached. This action was refused.');
    END IF;
    RETURN v_rate;
  END IF;

  INSERT INTO public.bootstrap_os_companies (slug, display_name, created_by)
  VALUES (v_slug, v_name, caller);
  INSERT INTO public.bootstrap_company_labels (mentee_id, label)
  VALUES (caller, v_slug);
  INSERT INTO public.bootstrap_os_admin_audit (op, actor_mentee_id, actor_email, slug, why)
  VALUES (
    'create_company',
    caller,
    coalesce(caller_email, 'unknown'),
    v_slug,
    nullif(left(coalesce(p_why, ''), 500), '')
  );

  RETURN jsonb_build_object(
    'ok', true,
    'slug', v_slug,
    'displayName', v_name,
    'role', 'super_admin'
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'status', 409, 'error', 'slug_taken');
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

DROP FUNCTION IF EXISTS public.bootstrap_os_list_provenance(text, text, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.bootstrap_os_list_provenance(
  p_company text,
  p_idea text DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_before timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, bootstrap_os
AS $$
DECLARE
  cid uuid;
  iid uuid;
  v_idea text := nullif(lower(trim(coalesce(p_idea, ''))), '');
  company_row bootstrap_os.companies%ROWTYPE;
  audit jsonb;
  gates jsonb;
  events jsonb;
  v_page_max int;
  v_truncated boolean;
BEGIN
  IF NOT public.bootstrap_os_held_label(p_company) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'company not visible');
  END IF;
  SELECT max_value INTO v_page_max
  FROM public.bootstrap_request_cap
  WHERE name = 'provenance_page_rows';
  IF v_page_max IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limiter_unavailable', 'reason', 'rate_limiter_unavailable', 'message', 'The limiter could not be reached. This action was refused.');
  END IF;
  cid := public.bootstrap_os_ensure_company(p_company);
  SELECT * INTO company_row FROM bootstrap_os.companies WHERE id = cid;
  IF v_idea IS NOT NULL THEN
    SELECT i.id INTO iid FROM bootstrap_os.ideas i
    WHERE i.company_id = cid AND i.slug = v_idea;
  END IF;

  WITH matched AS (
    SELECT kind, event_at, payload
    FROM (
      SELECT
        'audit'::text AS kind,
        a.at AS event_at,
        jsonb_build_object(
          'at', a.at,
          'who', a.who,
          'client', a.client,
          'ideaSlug', i.slug,
          'whatChanged', a.what_changed
        ) AS payload
      FROM bootstrap_os.audit_events a
      LEFT JOIN bootstrap_os.ideas i ON i.id = a.idea_id
      WHERE a.company_id = cid
        AND (iid IS NULL OR a.idea_id = iid)
        AND (p_from IS NULL OR a.at >= p_from)
        AND (p_to IS NULL OR a.at <= p_to)
        AND (p_before IS NULL OR a.at < p_before)
      UNION ALL
      SELECT
        'gate'::text,
        e.at,
        jsonb_build_object(
          'at', e.at,
          'who', e.who,
          'action', e.action,
          'why', e.why,
          'ideaSlug', i.slug
        )
      FROM bootstrap_os.gate_events e
      JOIN bootstrap_os.ideas i ON i.id = e.idea_id
      WHERE i.company_id = cid
        AND (iid IS NULL OR e.idea_id = iid)
        AND (p_from IS NULL OR e.at >= p_from)
        AND (p_to IS NULL OR e.at <= p_to)
        AND (p_before IS NULL OR e.at < p_before)
    ) AS raw
  )
  SELECT
    coalesce(jsonb_agg((payload || jsonb_build_object('kind', kind)) ORDER BY event_at, kind), '[]'::jsonb),
    coalesce(jsonb_agg(payload ORDER BY event_at, kind) FILTER (WHERE kind = 'audit'), '[]'::jsonb),
    coalesce(jsonb_agg(payload ORDER BY event_at, kind) FILTER (WHERE kind = 'gate'), '[]'::jsonb),
    coalesce(bool_or(total_rows > v_page_max), false)
  INTO events, audit, gates, v_truncated
  FROM (
    SELECT kind, event_at, payload, count(*) OVER () AS total_rows
    FROM matched
    ORDER BY event_at DESC, kind DESC
    LIMIT v_page_max
  ) AS page;

  RETURN jsonb_build_object(
    'ok', true,
    'company', jsonb_build_object('slug', company_row.slug, 'label', company_row.label),
    'idea', v_idea,
    'events', events,
    'audit', audit,
    'gateEvents', gates,
    'truncated', coalesce(v_truncated, false)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.bootstrap_os_list_provenance(text, text, timestamptz, timestamptz, timestamptz)
  TO authenticated;

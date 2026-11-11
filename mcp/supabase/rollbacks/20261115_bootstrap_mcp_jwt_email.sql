-- Restores auth.users email lookups removed by 20261115.
-- Not part of the forward stream.

CREATE OR REPLACE FUNCTION public.bootstrap_mcp_my_labels()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  user_email text;
  found_id uuid;
  labels jsonb;
  live text;
  membership jsonb;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT lower(email) INTO user_email FROM auth.users WHERE id = uid;
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
      SELECT 1 FROM public.bootstrap_mcp_mentees m2 WHERE m2.auth_user_id = uid
    );

  SELECT coalesce(jsonb_agg(l.label ORDER BY l.label), '[]'::jsonb)
  INTO labels
  FROM public.bootstrap_company_labels l
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

CREATE OR REPLACE FUNCTION public.bootstrap_mcp_accept_pending_invites(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  user_email text;
  invite public.bootstrap_mcp_invites%ROWTYPE;
  v_mentee_id uuid;
  labels jsonb := '[]'::jsonb;
  accepted jsonb := '[]'::jsonb;
  token_state text;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'email_required');
  END IF;

  SELECT lower(email) INTO user_email
  FROM auth.users
  WHERE id = uid
    AND email_confirmed_at IS NOT NULL;
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
          SELECT 1 FROM public.bootstrap_mcp_mentees m2 WHERE m2.auth_user_id = uid
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
    FROM public.bootstrap_company_labels l
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
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  user_email text;
  invite public.bootstrap_mcp_invites%ROWTYPE;
  v_mentee_id uuid;
  labels jsonb;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'email_required');
  END IF;

  SELECT lower(email) INTO user_email
  FROM auth.users
  WHERE id = uid
    AND email_confirmed_at IS NOT NULL;
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
    FROM public.bootstrap_company_labels l
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
        SELECT 1 FROM public.bootstrap_mcp_mentees m2 WHERE m2.auth_user_id = uid
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
  FROM public.bootstrap_company_labels l
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
  IF cid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found', 'message', 'Board not found.');
  END IF;
  IF NOT bootstrap_os.has_rank(cid, 3) THEN
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

  -- One transaction lock per auth user. hashtextextended(uid, 0) is a stable
  -- 64-bit key. The cap count runs only while this lock is held, so two
  -- sessions for the same user cannot both pass a count of 2.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text, 0));

  SELECT count(*)::integer INTO owned
  FROM bootstrap_os.companies AS c
  WHERE c.created_by = uid
    AND c.starter IS NOT TRUE;

  IF owned >= max_companies THEN
    RAISE EXCEPTION 'company_limit_reached' USING ERRCODE = 'P0001';
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

-- Accept pending invites when a GoTrue session email matches.
-- DO NOT apply from a PR cloud agent. Local/CI use mcp/test/pglite/identity-schema.sql.
-- Cos applies on rebuild after merge. Never supabase-pirin-ai from a PR agent.
--
-- Email comes from auth.users for auth.uid(). There is no email argument.
-- A token without a session does nothing. Replay is a no-op (unique redemption).

CREATE TABLE IF NOT EXISTS public.bootstrap_mcp_invite_redemptions (
  invite_id uuid PRIMARY KEY REFERENCES public.bootstrap_mcp_invites (id) ON DELETE CASCADE,
  mentee_id uuid NOT NULL REFERENCES public.bootstrap_mcp_mentees (id) ON DELETE CASCADE,
  auth_user_id uuid NOT NULL,
  redeemed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bootstrap_mcp_oauth_subjects (
  auth_user_id uuid PRIMARY KEY,
  email text NOT NULL,
  mentee_id uuid REFERENCES public.bootstrap_mcp_mentees (id) ON DELETE SET NULL,
  rotated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bootstrap_mcp_oauth_subjects_email_lower CHECK (email = lower(email))
);

CREATE TABLE IF NOT EXISTS public.bootstrap_mcp_access_tokens (
  token_hash text PRIMARY KEY,
  auth_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

ALTER TABLE public.bootstrap_mcp_invite_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bootstrap_mcp_oauth_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bootstrap_mcp_access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bootstrap_mcp_invite_redemptions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.bootstrap_mcp_oauth_subjects FORCE ROW LEVEL SECURITY;
ALTER TABLE public.bootstrap_mcp_access_tokens FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.bootstrap_mcp_invite_redemptions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.bootstrap_mcp_oauth_subjects FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.bootstrap_mcp_access_tokens FROM PUBLIC, anon, authenticated;

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

REVOKE ALL ON FUNCTION public.bootstrap_mcp_accept_pending_invites(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bootstrap_mcp_accept_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_mcp_accept_pending_invites(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_mcp_accept_invite(text) TO authenticated;

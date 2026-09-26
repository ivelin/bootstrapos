-- Live 42702: plpgsql variable mentee_id clashed with bootstrap_company_labels.mentee_id.
-- DO NOT apply from a PR cloud agent. Local/CI use mcp/test/pglite/identity-schema.sql.
-- Cos applies on rebuild/prod after merge. Never supabase-pirin-ai from a PR agent.
-- Shipped 20260910_bootstrap_mcp_invite_accept.sql is left in place (CREATE OR REPLACE only).
--
-- Root cause: DECLARE mentee_id uuid collided in
--   ON CONFLICT (mentee_id, label)
--   WHERE l.mentee_id = mentee_id
-- Postgres 42702: column reference "mentee_id" is ambiguous.
-- Variable is v_mentee_id. Column identifiers stay mentee_id.

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

  SELECT lower(email) INTO user_email FROM auth.users WHERE id = uid;
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

  IF invite.accepted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invite_already_used');
  END IF;

  IF invite.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invite_expired');
  END IF;

  IF invite.invitee_email <> user_email THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invite_email_mismatch');
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
    RETURNING id INTO v_mentee_id;
  ELSE
    UPDATE public.bootstrap_mcp_mentees
    SET auth_user_id = uid
    WHERE id = v_mentee_id
      AND auth_user_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.bootstrap_mcp_mentees m2 WHERE m2.auth_user_id = uid
      );
  END IF;

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

REVOKE ALL ON FUNCTION public.bootstrap_mcp_accept_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_mcp_accept_invite(text) TO authenticated;

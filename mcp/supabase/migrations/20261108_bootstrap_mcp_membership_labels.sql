-- Membership entitlement on the identity path (Bill Access rollout, Phase 2).
-- bootstrap_mcp_my_labels also returns the caller's membership level/status so
-- whoami can answer "which level is this login on" without a second round trip.
--
-- OWNERSHIP: public.memberships is owned by the PIRIN-AI migration stream
-- (supabase/migrations in ivelin/pirin-ai, PR-A of the same rollout). This
-- migration only READS it. It never creates or alters that table.
-- Column contract (pirin-ai model draft): memberships(auth_user_id uuid NULL,
-- email text NULL, level, status). Values are read as text so either stream's
-- enum/text choice works.
--
-- GRACEFUL DEGRADATION: this migration may be applied before PR-A's table
-- exists. bootstrap_os_membership_for then returns NULL (no row) and every
-- caller still authenticates exactly as before; the TS read maps NULL to
-- level "board". The labels path must never error because memberships is
-- absent or shaped differently — undefined_table / undefined_column are
-- caught and treated as no row.
--
-- Cos applies on supabase-pirin-ai. PR agents: PGlite / file lock only.
-- Do not apply this file from a PR cloud agent. No live emails or labels here.

CREATE OR REPLACE FUNCTION public.bootstrap_os_membership_for(p_auth_user_id uuid, p_email text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF to_regclass('public.memberships') IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object('level', m.level::text, 'status', m.status::text)
  INTO result
  FROM public.memberships m
  WHERE (p_auth_user_id IS NOT NULL AND m.auth_user_id = p_auth_user_id)
     OR (
       p_email IS NOT NULL AND p_email <> ''
       AND m.email IS NOT NULL AND lower(m.email) = lower(p_email)
     )
  ORDER BY CASE
    WHEN p_auth_user_id IS NOT NULL AND m.auth_user_id = p_auth_user_id THEN 0
    ELSE 1
  END
  LIMIT 1;

  RETURN result;
EXCEPTION
  WHEN undefined_table OR undefined_column THEN
    RETURN NULL;
END;
$$;

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

-- The helper is internal: only the SECURITY DEFINER labels RPC calls it.
REVOKE ALL ON FUNCTION public.bootstrap_os_membership_for(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_mcp_my_labels() TO authenticated;

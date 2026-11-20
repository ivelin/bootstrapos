-- Derived read-only discount class for the signed-in person.
-- Nothing is stored. No enum changes. No prices.
--
-- OWNERSHIP: public.memberships is owned by the PIRIN-AI migration stream.
-- This repo only READs it. This file never creates or alters that table.
--
-- GRACEFUL DEGRADATION: if memberships is absent, or the columns this read
-- needs are absent, the membership row counts as missing (NULL). The class
-- then falls through to a Bootstrap OS account, or none.
-- A lapsed row (status ended, or effective_to set and <= now()) is not a
-- paid level. Manual ground with a future effective_to is trial.
-- active, past_due, and cancel_pending confer elite / next / ground.
--
-- Cos applies on supabase-pirin-ai. PR agents: PGlite / file lock only.
-- Do not apply this file from a PR agent.

CREATE OR REPLACE FUNCTION public.bootstrap_os_discount_class(p_auth_user_id uuid, p_email text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  has_columns boolean := false;
  m_level text;
  m_source text;
  m_status text;
  m_effective_to timestamptz;
  has_row boolean := false;
BEGIN
  IF pg_catalog.to_regclass('public.memberships') IS NOT NULL THEN
    SELECT count(*) = 6
      INTO has_columns
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'memberships'
      AND column_name IN ('auth_user_id', 'email', 'level', 'source', 'status', 'effective_to');
  END IF;

  IF has_columns THEN
    BEGIN
      SELECT m.level::text, m.source::text, m.status::text, m.effective_to
        INTO m_level, m_source, m_status, m_effective_to
      FROM public.memberships m
      WHERE (p_auth_user_id IS NOT NULL AND m.auth_user_id = p_auth_user_id)
         OR (
           p_email IS NOT NULL AND p_email <> ''
           AND m.email IS NOT NULL AND pg_catalog.lower(m.email) = pg_catalog.lower(p_email)
         )
      ORDER BY CASE
        WHEN p_auth_user_id IS NOT NULL AND m.auth_user_id = p_auth_user_id THEN 0
        ELSE 1
      END
      LIMIT 1;
      has_row := FOUND;
    EXCEPTION
      WHEN undefined_table OR undefined_column THEN
        has_row := false;
    END;
  END IF;

  IF has_row THEN
    IF m_status = 'ended'
       OR (m_effective_to IS NOT NULL AND m_effective_to <= pg_catalog.now()) THEN
      NULL;
    ELSIF m_level = 'ground'
      AND m_source = 'manual'
      AND m_effective_to IS NOT NULL
      AND m_effective_to > pg_catalog.now() THEN
      RETURN 'trial';
    ELSIF m_level IN ('elite', 'next', 'ground')
      AND m_status IN ('active', 'past_due', 'cancel_pending') THEN
      RETURN m_level;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bootstrap_mcp_mentees AS mentee
    WHERE (p_auth_user_id IS NOT NULL AND mentee.auth_user_id = p_auth_user_id)
       OR (
         p_email IS NOT NULL AND p_email <> ''
         AND mentee.email IS NOT NULL
         AND pg_catalog.lower(mentee.email) = pg_catalog.lower(p_email)
       )
  ) THEN
    RETURN 'bootstrap';
  END IF;

  RETURN 'none';
EXCEPTION
  WHEN undefined_table OR undefined_column THEN
    RETURN 'none';
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_os_discount_class(uuid, text) FROM PUBLIC, anon, authenticated;

-- Current bootstrap_mcp_my_labels body from 20261115, plus discount_class.
-- Grants stay: EXECUTE for authenticated only. No GRANT to anon.
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

  user_email := bootstrap_os.actor_email();
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
    'discount_class', public.bootstrap_os_discount_class(uid, user_email),
    'note', 'Companies this login can open. A company may have several ideas; each idea is its own 0-1 board.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.bootstrap_mcp_my_labels() TO authenticated;

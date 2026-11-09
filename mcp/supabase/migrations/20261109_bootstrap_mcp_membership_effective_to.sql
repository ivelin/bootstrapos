-- Lapse a hosted membership when public.memberships.effective_to is in the past.
-- Manual 30-day trials (Web Wren / pirin.ai) stay status active with
-- effective_to = grant + 30d. Status alone never marks them ended, so whoami
-- kept showing Ground after the trial clock passed. A null effective_to stays
-- the stored level. A future effective_to stays the stored level.
--
-- OWNERSHIP: public.memberships is owned by the PIRIN-AI migration stream.
-- This repo only READs it. This file never creates or alters that table.
--
-- GRACEFUL DEGRADATION: if memberships is absent, return NULL (same as
-- 20261108). If the table exists but has no effective_to column, return
-- level/status verbatim and do not reference the column — older PGlite
-- fixtures and pre-column databases must not hit undefined_column and wipe
-- every membership to NULL.
--
-- Cos applies on supabase-pirin-ai. PR agents: PGlite / file lock only.
-- Do not apply this file from a PR agent.

CREATE OR REPLACE FUNCTION public.bootstrap_os_membership_for(p_auth_user_id uuid, p_email text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  has_effective_to boolean;
BEGIN
  IF to_regclass('public.memberships') IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'memberships'
      AND column_name = 'effective_to'
  )
  INTO has_effective_to;

  IF has_effective_to THEN
    SELECT jsonb_build_object(
      'level', CASE
        WHEN m.effective_to IS NOT NULL AND (m.effective_to)::timestamptz < now() THEN 'board'
        ELSE m.level::text
      END,
      'status', m.status::text
    )
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
  ELSE
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
  END IF;

  RETURN result;
EXCEPTION
  WHEN undefined_table OR undefined_column THEN
    RETURN NULL;
END;
$$;

-- The helper stays internal: only the SECURITY DEFINER labels RPC calls it.
REVOKE ALL ON FUNCTION public.bootstrap_os_membership_for(uuid, text) FROM PUBLIC, anon, authenticated;

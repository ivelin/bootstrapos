-- Rollback 20261113. Restores pre-confirm held_label / actor_email / accept / ensure create paths
-- from 20261111 + 20261108 + 20261015 + 20261029 + 20261028 shapes. Never apply on prod casually.

BEGIN;

CREATE OR REPLACE FUNCTION bootstrap_os.actor_email()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(lower(auth.jwt() ->> 'email'), '');
$$;

REVOKE ALL ON FUNCTION bootstrap_os.actor_email() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION bootstrap_os.actor_email() TO authenticated;

CREATE OR REPLACE FUNCTION public.bootstrap_os_held_label(p_company text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, bootstrap_os AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bootstrap_mcp_mentees m
    JOIN public.bootstrap_company_labels l ON l.mentee_id = m.id
    WHERE l.label = lower(p_company)
      AND (
        m.email = NULLIF(lower(auth.jwt() ->> 'email'), '')
        OR m.auth_user_id::text = NULLIF(auth.jwt() ->> 'sub', '')
      )
  );
$$;

REVOKE ALL ON FUNCTION public.bootstrap_os_held_label(text) FROM PUBLIC, anon;

COMMIT;

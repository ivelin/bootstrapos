-- Install path for one signup. Written once. Unknown stays manual.
-- source is grokbot, plugin, or manual. Anything else is rejected.
-- x-bootstrap-install-source is client-asserted and for analytics only.
-- It must never be used for authz, routing, or role-to-bot mapping.
-- Those use the per-call client param.
-- DO NOT apply from a PR cloud agent. Do not migrate or live-probe supabase-pirin-ai.

ALTER TABLE public.bootstrap_mcp_mentees
  ADD COLUMN IF NOT EXISTS source text;

ALTER TABLE public.bootstrap_mcp_mentees
  DROP CONSTRAINT IF EXISTS bootstrap_mcp_mentees_source_allow;
ALTER TABLE public.bootstrap_mcp_mentees
  ADD CONSTRAINT bootstrap_mcp_mentees_source_allow
  CHECK (source IS NULL OR source IN ('grokbot', 'plugin', 'manual'));

ALTER TABLE public.bootstrap_mcp_mentees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bootstrap_mcp_mentees FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.bootstrap_mcp_mentees FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, email, auth_user_id, created_at)
  ON TABLE public.bootstrap_mcp_mentees TO authenticated;

CREATE OR REPLACE FUNCTION public.bootstrap_mcp_mentees_source_once()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  -- One transition only: NULL to a value. A later update keeps the stored value.
  IF OLD.source IS NOT NULL THEN
    NEW.source := OLD.source;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bootstrap_mcp_mentees_source_once ON public.bootstrap_mcp_mentees;
CREATE TRIGGER bootstrap_mcp_mentees_source_once
  BEFORE UPDATE OF source ON public.bootstrap_mcp_mentees
  FOR EACH ROW
  EXECUTE FUNCTION public.bootstrap_mcp_mentees_source_once();

REVOKE ALL ON FUNCTION public.bootstrap_mcp_mentees_source_once() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  cname text;
BEGIN
  SELECT c.conname INTO cname
  FROM pg_constraint c
  WHERE c.conrelid = 'public.bootstrap_os_admin_audit'::regclass
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%create_company%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.bootstrap_os_admin_audit DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE public.bootstrap_os_admin_audit
  ADD CONSTRAINT bootstrap_os_admin_audit_op_check
  CHECK (op IN (
    'create_company',
    'grant_super_admin',
    'revoke_super_admin',
    'record_install_source'
  ));

ALTER TABLE public.bootstrap_os_admin_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bootstrap_os_admin_audit FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.bootstrap_os_admin_audit FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.bootstrap_mcp_record_install_source(p_source text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  uid uuid := auth.uid();
  user_email text;
  v_source text;
  mentee_id uuid;
  prior text;
  wrote boolean := false;
BEGIN
  IF uid IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 401, 'error', 'email_required');
  END IF;

  SELECT pg_catalog.lower(u.email) INTO user_email
  FROM auth.users AS u
  WHERE u.id = uid
    AND u.email_confirmed_at IS NOT NULL;
  IF user_email IS NULL OR user_email = '' THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 401, 'error', 'email_required');
  END IF;

  IF p_source IS NULL OR pg_catalog.btrim(p_source) = '' THEN
    v_source := 'manual';
  ELSE
    v_source := pg_catalog.lower(pg_catalog.btrim(p_source));
  END IF;
  IF v_source NOT IN ('grokbot', 'plugin', 'manual') THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 400, 'error', 'invalid_install_source');
  END IF;

  SELECT m.id, m.source INTO mentee_id, prior
  FROM public.bootstrap_mcp_mentees AS m
  WHERE m.auth_user_id = uid OR m.email = user_email
  ORDER BY CASE WHEN m.auth_user_id = uid THEN 0 ELSE 1 END
  LIMIT 1;

  IF mentee_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 403, 'error', 'not_invited');
  ELSIF prior IS NULL THEN
    UPDATE public.bootstrap_mcp_mentees
    SET source = v_source
    WHERE id = mentee_id
      AND source IS NULL
    RETURNING source INTO prior;
    wrote := prior IS NOT NULL;
    IF NOT wrote THEN
      SELECT source INTO prior FROM public.bootstrap_mcp_mentees WHERE id = mentee_id;
    END IF;
  END IF;

  IF wrote THEN
    INSERT INTO public.bootstrap_os_admin_audit (op, actor_mentee_id, actor_email, why)
    VALUES ('record_install_source', mentee_id, user_email, prior);
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'email', user_email,
    'source', COALESCE(prior, 'manual')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.bootstrap_mcp_read_install_source(p_email text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  uid uuid := auth.uid();
  user_email text;
  caller uuid;
  is_admin boolean := false;
  is_owner boolean := false;
  target_email text;
  found text;
BEGIN
  IF uid IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 403, 'error', 'forbidden');
  END IF;

  SELECT pg_catalog.lower(u.email) INTO user_email
  FROM auth.users AS u
  WHERE u.id = uid
    AND u.email_confirmed_at IS NOT NULL;
  IF user_email IS NULL OR user_email = '' THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 403, 'error', 'forbidden');
  END IF;

  SELECT m.id INTO caller
  FROM public.bootstrap_mcp_mentees AS m
  WHERE m.auth_user_id = uid OR m.email = user_email
  ORDER BY CASE WHEN m.auth_user_id = uid THEN 0 ELSE 1 END
  LIMIT 1;
  IF caller IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 403, 'error', 'forbidden');
  END IF;

  is_admin := EXISTS (
    SELECT 1 FROM public.bootstrap_os_roles AS r
    WHERE r.mentee_id = caller AND r.revoked_at IS NULL AND r.role = 'super_admin'
  );
  is_owner := EXISTS (
    SELECT 1 FROM public.bootstrap_os_roles AS r
    WHERE r.mentee_id = caller AND r.revoked_at IS NULL AND r.role = 'owner'
  );

  target_email := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_email, user_email)));
  IF target_email = '' THEN
    target_email := user_email;
  END IF;

  IF is_admin IS DISTINCT FROM true THEN
    IF is_owner IS DISTINCT FROM true OR target_email <> user_email THEN
      RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 403, 'error', 'forbidden');
    END IF;
  END IF;

  SELECT m.source INTO found
  FROM public.bootstrap_mcp_mentees AS m
  WHERE m.email = target_email;
  IF NOT EXISTS (
    SELECT 1 FROM public.bootstrap_mcp_mentees AS m WHERE m.email = target_email
  ) THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'status', 404, 'error', 'not_found');
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'email', target_email,
    'source', COALESCE(found, 'manual')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_mcp_record_install_source(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bootstrap_mcp_read_install_source(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_mcp_record_install_source(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_mcp_read_install_source(text) TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.bootstrap_mcp_record_install_source(text) FROM service_role';
    EXECUTE 'REVOKE ALL ON FUNCTION public.bootstrap_mcp_read_install_source(text) FROM service_role';
  END IF;
END $$;

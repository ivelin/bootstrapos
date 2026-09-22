-- Hosted company create + super_admin roles.
-- Cos applies on supabase-pirin-ai. PR agents: PGlite / file lock only.
-- Do not apply this file from a PR cloud agent. Do not seed a live email.
-- Fictional template seed is founder@example.test as member only.
-- A human seeds the sole live super_admin later. That address stays out of git.

CREATE TABLE IF NOT EXISTS public.bootstrap_os_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mentee_id uuid NOT NULL REFERENCES public.bootstrap_mcp_mentees (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('member', 'super_admin')),
  granted_by uuid REFERENCES public.bootstrap_mcp_mentees (id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS bootstrap_os_roles_one_live
  ON public.bootstrap_os_roles (mentee_id)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.bootstrap_os_companies (
  slug text PRIMARY KEY,
  display_name text,
  created_by uuid NOT NULL REFERENCES public.bootstrap_mcp_mentees (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bootstrap_os_companies_slug CHECK (slug ~ '^[a-z0-9][a-z0-9_-]{0,31}$')
);

CREATE TABLE IF NOT EXISTS public.bootstrap_os_admin_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  op text NOT NULL CHECK (op IN ('create_company', 'grant_super_admin', 'revoke_super_admin')),
  actor_mentee_id uuid,
  actor_email text NOT NULL,
  target_email text,
  slug text,
  why text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bootstrap_company_labels_label_idx
  ON public.bootstrap_company_labels (label);

ALTER TABLE public.bootstrap_os_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bootstrap_os_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bootstrap_os_admin_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bootstrap_os_roles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.bootstrap_os_companies FORCE ROW LEVEL SECURITY;
ALTER TABLE public.bootstrap_os_admin_audit FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.bootstrap_os_roles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.bootstrap_os_companies FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.bootstrap_os_admin_audit FROM PUBLIC, anon, authenticated;

-- No INSERT/UPDATE/DELETE/SELECT policies for authenticated. RPCs are SECURITY DEFINER.

CREATE OR REPLACE FUNCTION public.bootstrap_os_live_role(p_mentee uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.role
  FROM public.bootstrap_os_roles r
  WHERE r.mentee_id = p_mentee
    AND r.revoked_at IS NULL
  ORDER BY CASE r.role WHEN 'super_admin' THEN 0 ELSE 1 END
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.bootstrap_os_admin_gate()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  user_email text;
  found_id uuid;
  live text;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 403);
  END IF;

  SELECT lower(email) INTO user_email FROM auth.users WHERE id = uid;
  IF user_email IS NULL OR user_email = '' THEN
    user_email := NULLIF(lower(auth.jwt() ->> 'email'), '');
  END IF;

  SELECT id INTO found_id
  FROM public.bootstrap_mcp_mentees
  WHERE auth_user_id = uid OR (user_email IS NOT NULL AND email = user_email);

  IF found_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 403);
  END IF;

  live := public.bootstrap_os_live_role(found_id);
  IF live IS DISTINCT FROM 'super_admin' THEN
    RETURN jsonb_build_object('ok', false, 'status', 403);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'mentee_id', found_id,
    'email', COALESCE(user_email, (SELECT email FROM public.bootstrap_mcp_mentees WHERE id = found_id))
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

CREATE OR REPLACE FUNCTION public.bootstrap_os_grant_super_admin(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gate jsonb;
  v_email text := lower(trim(coalesce(p_email, '')));
  caller uuid;
  caller_email text;
  target uuid;
  live text;
BEGIN
  gate := public.bootstrap_os_admin_gate();
  IF coalesce((gate ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'status', 403);
  END IF;
  caller := (gate ->> 'mentee_id')::uuid;
  caller_email := gate ->> 'email';
  IF v_email = '' THEN
    RETURN jsonb_build_object('ok', false, 'status', 403);
  END IF;
  IF v_email = lower(coalesce(caller_email, '')) THEN
    RETURN jsonb_build_object('ok', false, 'status', 403, 'error', 'self_grant');
  END IF;

  SELECT id INTO target FROM public.bootstrap_mcp_mentees WHERE email = v_email;
  IF target IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 403);
  END IF;

  live := public.bootstrap_os_live_role(target);
  IF live IS DISTINCT FROM 'super_admin' THEN
    UPDATE public.bootstrap_os_roles
    SET revoked_at = now()
    WHERE mentee_id = target AND revoked_at IS NULL;
    INSERT INTO public.bootstrap_os_roles (mentee_id, role, granted_by, granted_at)
    VALUES (target, 'super_admin', caller, now());
  END IF;

  INSERT INTO public.bootstrap_os_admin_audit (op, actor_mentee_id, actor_email, target_email, why)
  VALUES ('grant_super_admin', caller, coalesce(caller_email, 'unknown'), v_email, 'grant');

  RETURN jsonb_build_object('ok', true, 'email', v_email, 'role', 'super_admin');
END;
$$;

CREATE OR REPLACE FUNCTION public.bootstrap_os_revoke_super_admin(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gate jsonb;
  v_email text := lower(trim(coalesce(p_email, '')));
  caller uuid;
  caller_email text;
  target uuid;
  revoked int := 0;
BEGIN
  gate := public.bootstrap_os_admin_gate();
  IF coalesce((gate ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'status', 403);
  END IF;
  caller := (gate ->> 'mentee_id')::uuid;
  caller_email := gate ->> 'email';
  IF v_email = '' THEN
    RETURN jsonb_build_object('ok', false, 'status', 403);
  END IF;

  SELECT id INTO target FROM public.bootstrap_mcp_mentees WHERE email = v_email;
  IF target IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 403);
  END IF;

  UPDATE public.bootstrap_os_roles
  SET revoked_at = now()
  WHERE mentee_id = target
    AND role = 'super_admin'
    AND revoked_at IS NULL;
  GET DIAGNOSTICS revoked = ROW_COUNT;
  IF revoked = 0 THEN
    RETURN jsonb_build_object('ok', false, 'status', 403);
  END IF;

  IF public.bootstrap_os_live_role(target) IS NULL THEN
    INSERT INTO public.bootstrap_os_roles (mentee_id, role, granted_by, granted_at)
    VALUES (target, 'member', caller, now());
  END IF;

  INSERT INTO public.bootstrap_os_admin_audit (op, actor_mentee_id, actor_email, target_email, why)
  VALUES ('revoke_super_admin', caller, coalesce(caller_email, 'unknown'), v_email, 'revoke');

  RETURN jsonb_build_object('ok', true, 'email', v_email, 'role', 'member');
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

  RETURN jsonb_build_object(
    'authenticated', true,
    'email', user_email,
    'labels', labels,
    'role', coalesce(live, 'unset'),
    'note', 'Companies this login can open. A company may have several ideas; each idea is its own 0-1 board.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_os_live_role(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bootstrap_os_admin_gate() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bootstrap_os_create_company(text, text, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bootstrap_os_grant_super_admin(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bootstrap_os_revoke_super_admin(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.bootstrap_os_create_company(text, text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_grant_super_admin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_revoke_super_admin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_mcp_my_labels() TO authenticated;

-- Fictional member seed only. Do not seed an admin email in this file.
INSERT INTO public.bootstrap_os_roles (mentee_id, role, granted_at)
SELECT m.id, 'member', now()
FROM public.bootstrap_mcp_mentees m
WHERE m.email = 'founder@example.test'
  AND NOT EXISTS (
    SELECT 1 FROM public.bootstrap_os_roles r
    WHERE r.mentee_id = m.id AND r.revoked_at IS NULL
  );

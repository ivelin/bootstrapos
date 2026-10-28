-- Self-serve create_company. A confirmed account opens up to 3 bet boards.
-- DO NOT apply from a PR cloud agent. Do not migrate or live-probe supabase-pirin-ai.
-- The scoped-invites AFTER trigger is not on main. The trigger below is the
-- same shape: the function sets app.actor_id, and the AFTER INSERT trigger
-- writes ids only.
-- Super-admin bootstrap_os_create_company is unchanged.
-- INSERT on the company tables stays revoked from authenticated.

ALTER TABLE bootstrap_os.companies
  ADD COLUMN IF NOT EXISTS created_by uuid;

COMMENT ON COLUMN bootstrap_os.companies.created_by IS
  'auth.uid() of the self-serve creator. Null on starter and super-admin rows, so those do not count toward the cap.';

ALTER TABLE bootstrap_os.company_acl DROP CONSTRAINT IF EXISTS company_acl_role;
ALTER TABLE bootstrap_os.company_acl
  ADD CONSTRAINT company_acl_role
  CHECK (role IN ('founder', 'founder_authorized', 'advisor', 'owner'));

ALTER TABLE public.bootstrap_os_roles DROP CONSTRAINT IF EXISTS bootstrap_os_roles_role_check;
ALTER TABLE public.bootstrap_os_roles
  ADD CONSTRAINT bootstrap_os_roles_role_check
  CHECK (role IN ('member', 'super_admin', 'owner'));

ALTER TABLE public.bootstrap_os_roles
  ADD COLUMN IF NOT EXISTS company_id uuid;

ALTER TABLE public.bootstrap_os_roles
  DROP CONSTRAINT IF EXISTS bootstrap_os_roles_company_id_fkey;
ALTER TABLE public.bootstrap_os_roles
  ADD CONSTRAINT bootstrap_os_roles_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES bootstrap_os.companies (id) ON DELETE CASCADE;

ALTER TABLE public.bootstrap_os_roles
  DROP CONSTRAINT IF EXISTS bootstrap_os_roles_owner_company;
ALTER TABLE public.bootstrap_os_roles
  ADD CONSTRAINT bootstrap_os_roles_owner_company
  CHECK (
    (role = 'owner' AND company_id IS NOT NULL)
    OR (role <> 'owner' AND company_id IS NULL)
  );

DROP INDEX IF EXISTS public.bootstrap_os_roles_one_live;
CREATE UNIQUE INDEX bootstrap_os_roles_one_live
  ON public.bootstrap_os_roles (mentee_id)
  WHERE revoked_at IS NULL AND role <> 'owner';

CREATE UNIQUE INDEX IF NOT EXISTS bootstrap_os_roles_one_owner
  ON public.bootstrap_os_roles (mentee_id, company_id)
  WHERE revoked_at IS NULL AND role = 'owner';

CREATE OR REPLACE FUNCTION public.bootstrap_os_live_role(p_mentee uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT r.role
  FROM public.bootstrap_os_roles r
  WHERE r.mentee_id = p_mentee
    AND r.revoked_at IS NULL
  ORDER BY CASE r.role WHEN 'super_admin' THEN 0 WHEN 'member' THEN 1 ELSE 2 END
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION bootstrap_os.has_role(p_company_id uuid, VARIADIC p_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM bootstrap_os.company_acl a
    WHERE a.company_id = p_company_id
      AND (
        a.role = ANY (p_roles)
        OR (
          a.role = 'owner'
          AND p_roles && ARRAY['founder', 'founder_authorized']::text[]
        )
      )
      AND (
        (a.principal_kind = 'email' AND a.principal = bootstrap_os.actor_email())
        OR (a.principal_kind = 'sub' AND a.principal = bootstrap_os.actor_sub())
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.bootstrap_os_audit_self_serve_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor text := nullif(pg_catalog.current_setting('app.actor_id', true), '');
BEGIN
  IF actor IS NULL OR NEW.created_by IS NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO bootstrap_os.audit_events (company_id, who, client, what_changed)
  VALUES (
    NEW.id,
    actor,
    'create_company_self_serve',
    pg_catalog.jsonb_build_object('company_id', NEW.id, 'actor_id', actor::uuid)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_self_serve_audit ON bootstrap_os.companies;
CREATE TRIGGER companies_self_serve_audit
  AFTER INSERT ON bootstrap_os.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.bootstrap_os_audit_self_serve_company();

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

REVOKE ALL ON FUNCTION public.bootstrap_os_audit_self_serve_company() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_company_self_serve(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_company_self_serve(text) TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.create_company_self_serve(text) FROM service_role';
    EXECUTE 'REVOKE ALL ON FUNCTION public.bootstrap_os_audit_self_serve_company() FROM service_role';
  END IF;
END $$;

REVOKE INSERT ON TABLE bootstrap_os.companies FROM PUBLIC, anon, authenticated;
REVOKE INSERT ON TABLE public.bootstrap_os_companies FROM PUBLIC, anon, authenticated;

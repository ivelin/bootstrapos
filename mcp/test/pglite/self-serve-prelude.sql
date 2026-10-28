-- Fixture for self-serve company tests. Never apply to supabase-pirin-ai.
-- Mirrors the tables the 20261028 migration alters. Auth is a local stub.

CREATE SCHEMA IF NOT EXISTS bootstrap_os;
CREATE SCHEMA IF NOT EXISTS auth;

DO $$ BEGIN
  CREATE ROLE authenticated NOINHERIT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE ROLE anon NOINHERIT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text,
  email_confirmed_at timestamptz
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT jsonb_build_object(
    'email', NULLIF(current_setting('request.jwt.claim.email', true), ''),
    'sub', NULLIF(current_setting('request.jwt.claim.sub', true), '')
  )
$$;

GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
GRANT EXECUTE ON FUNCTION auth.jwt() TO authenticated;

CREATE TABLE IF NOT EXISTS public.bootstrap_mcp_mentees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  auth_user_id uuid UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bootstrap_mcp_mentees_email_lower CHECK (email = lower(email))
);

CREATE TABLE IF NOT EXISTS public.bootstrap_company_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mentee_id uuid NOT NULL REFERENCES public.bootstrap_mcp_mentees (id) ON DELETE CASCADE,
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bootstrap_company_labels_slug CHECK (label ~ '^[a-z0-9][a-z0-9_-]{0,31}$'),
  CONSTRAINT bootstrap_company_labels_unique UNIQUE (mentee_id, label)
);

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

CREATE TABLE IF NOT EXISTS bootstrap_os.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  label text NOT NULL,
  starter boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT companies_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9_-]{0,63}$')
);

CREATE TABLE IF NOT EXISTS bootstrap_os.company_acl (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES bootstrap_os.companies (id) ON DELETE CASCADE,
  principal text NOT NULL,
  principal_kind text NOT NULL,
  role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_acl_kind CHECK (principal_kind IN ('email', 'sub')),
  CONSTRAINT company_acl_role CHECK (role IN ('founder', 'founder_authorized', 'advisor')),
  CONSTRAINT company_acl_email_lower CHECK (
    principal_kind <> 'email' OR principal = lower(principal)
  ),
  CONSTRAINT company_acl_unique UNIQUE (company_id, principal, principal_kind)
);

CREATE TABLE IF NOT EXISTS bootstrap_os.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES bootstrap_os.companies (id) ON DELETE CASCADE,
  idea_id uuid,
  who text NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  client text NOT NULL,
  what_changed jsonb NOT NULL,
  CONSTRAINT audit_events_what_changed_object CHECK (jsonb_typeof(what_changed) = 'object')
);

CREATE OR REPLACE FUNCTION bootstrap_os.actor_email()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(lower(auth.jwt() ->> 'email'), '')
$$;

CREATE OR REPLACE FUNCTION bootstrap_os.actor_sub()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(auth.jwt() ->> 'sub', '')
$$;

CREATE OR REPLACE FUNCTION bootstrap_os.is_member(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM bootstrap_os.company_acl a
    WHERE a.company_id = p_company_id
      AND (
        (a.principal_kind = 'email' AND a.principal = bootstrap_os.actor_email())
        OR (a.principal_kind = 'sub' AND a.principal = bootstrap_os.actor_sub())
      )
  )
$$;

ALTER TABLE bootstrap_os.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE bootstrap_os.companies FORCE ROW LEVEL SECURITY;
ALTER TABLE bootstrap_os.company_acl ENABLE ROW LEVEL SECURITY;
ALTER TABLE bootstrap_os.company_acl FORCE ROW LEVEL SECURITY;
ALTER TABLE public.bootstrap_os_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bootstrap_os_companies FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE bootstrap_os.companies FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE bootstrap_os.company_acl FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.bootstrap_os_companies FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA bootstrap_os TO authenticated;
GRANT SELECT ON TABLE bootstrap_os.companies TO authenticated;
GRANT SELECT ON TABLE bootstrap_os.company_acl TO authenticated;
GRANT SELECT ON TABLE bootstrap_os.audit_events TO authenticated;

DROP POLICY IF EXISTS companies_select_member ON bootstrap_os.companies;
CREATE POLICY companies_select_member
  ON bootstrap_os.companies
  FOR SELECT
  TO authenticated
  USING (bootstrap_os.is_member(id));

DROP POLICY IF EXISTS acl_select_self ON bootstrap_os.company_acl;
CREATE POLICY acl_select_self
  ON bootstrap_os.company_acl
  FOR SELECT
  TO authenticated
  USING (
    (principal_kind = 'email' AND principal = bootstrap_os.actor_email())
    OR (principal_kind = 'sub' AND principal = bootstrap_os.actor_sub())
  );

-- PGlite twin of 20260928_bootstrap_os_roles.sql.
-- NEVER apply this to supabase-pirin-ai. NEVER live-probe prod from a PR agent.
-- Apply after mcp/test/pglite/identity-schema.sql.
-- Auth is app.auth_uid / app.auth_email (no auth.users). Ids are text.

CREATE TABLE bootstrap_os_roles (
  id text PRIMARY KEY,
  mentee_id text NOT NULL REFERENCES bootstrap_mcp_mentees (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('member', 'super_admin')),
  granted_by text REFERENCES bootstrap_mcp_mentees (id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE UNIQUE INDEX bootstrap_os_roles_one_live
  ON bootstrap_os_roles (mentee_id)
  WHERE revoked_at IS NULL;

CREATE TABLE bootstrap_os_companies (
  slug text PRIMARY KEY,
  display_name text,
  created_by text NOT NULL REFERENCES bootstrap_mcp_mentees (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bootstrap_os_companies_slug CHECK (slug ~ '^[a-z0-9][a-z0-9_-]{0,31}$')
);

CREATE TABLE bootstrap_os_admin_audit (
  id text PRIMARY KEY,
  op text NOT NULL CHECK (op IN ('create_company', 'grant_super_admin', 'revoke_super_admin')),
  actor_mentee_id text,
  actor_email text NOT NULL,
  target_email text,
  slug text,
  why text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE bootstrap_os_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bootstrap_os_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE bootstrap_os_admin_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE bootstrap_os_roles FORCE ROW LEVEL SECURITY;
ALTER TABLE bootstrap_os_companies FORCE ROW LEVEL SECURITY;
ALTER TABLE bootstrap_os_admin_audit FORCE ROW LEVEL SECURITY;

REVOKE ALL ON bootstrap_os_roles FROM PUBLIC, mentee_reader;
REVOKE ALL ON bootstrap_os_companies FROM PUBLIC, mentee_reader;
REVOKE ALL ON bootstrap_os_admin_audit FROM PUBLIC, mentee_reader;

-- No policies. No INSERT for the reader role.

CREATE OR REPLACE FUNCTION bootstrap_os_live_role(p_mentee text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.role
  FROM bootstrap_os_roles r
  WHERE r.mentee_id = p_mentee
    AND r.revoked_at IS NULL
  ORDER BY CASE r.role WHEN 'super_admin' THEN 0 ELSE 1 END
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION bootstrap_os_admin_gate()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid text := nullif(current_setting('app.auth_uid', true), '');
  user_email text := lower(nullif(current_setting('app.auth_email', true), ''));
  found_id text;
  live text;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 403);
  END IF;

  SELECT id INTO found_id
  FROM bootstrap_mcp_mentees
  WHERE auth_user_id = uid OR (user_email IS NOT NULL AND email = user_email);

  IF found_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 403);
  END IF;

  live := bootstrap_os_live_role(found_id);
  IF live IS DISTINCT FROM 'super_admin' THEN
    RETURN jsonb_build_object('ok', false, 'status', 403);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'mentee_id', found_id,
    'email', COALESCE(user_email, (SELECT email FROM bootstrap_mcp_mentees WHERE id = found_id))
  );
END;
$$;

CREATE OR REPLACE FUNCTION bootstrap_os_create_company(
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
  caller text;
  caller_email text;
BEGIN
  gate := bootstrap_os_admin_gate();
  IF coalesce((gate ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'status', 403);
  END IF;
  IF p_founder_yes IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'status', 403, 'error', 'founder_yes_required');
  END IF;
  IF v_slug !~ '^[a-z0-9][a-z0-9_-]{0,31}$' THEN
    RETURN jsonb_build_object('ok', false, 'status', 403, 'error', 'invalid_slug');
  END IF;
  IF EXISTS (SELECT 1 FROM bootstrap_company_labels l WHERE l.label = v_slug)
     OR EXISTS (SELECT 1 FROM bootstrap_os_companies c WHERE c.slug = v_slug) THEN
    RETURN jsonb_build_object('ok', false, 'status', 409, 'error', 'slug_taken');
  END IF;

  caller := gate ->> 'mentee_id';
  caller_email := gate ->> 'email';

  INSERT INTO bootstrap_os_companies (slug, display_name, created_by)
  VALUES (v_slug, v_name, caller);
  INSERT INTO bootstrap_company_labels (id, mentee_id, label)
  VALUES ('lab-' || v_slug || '-' || caller, caller, v_slug);
  INSERT INTO bootstrap_os_admin_audit (id, op, actor_mentee_id, actor_email, slug, why)
  VALUES (
    'aud-create-' || v_slug || '-' || caller,
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

CREATE OR REPLACE FUNCTION bootstrap_os_grant_super_admin(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gate jsonb;
  v_email text := lower(trim(coalesce(p_email, '')));
  caller text;
  caller_email text;
  target text;
  live text;
BEGIN
  gate := bootstrap_os_admin_gate();
  IF coalesce((gate ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'status', 403);
  END IF;
  caller := gate ->> 'mentee_id';
  caller_email := gate ->> 'email';
  IF v_email = '' THEN
    RETURN jsonb_build_object('ok', false, 'status', 403);
  END IF;
  IF v_email = lower(coalesce(caller_email, '')) THEN
    RETURN jsonb_build_object('ok', false, 'status', 403, 'error', 'self_grant');
  END IF;

  SELECT id INTO target FROM bootstrap_mcp_mentees WHERE email = v_email;
  IF target IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 403);
  END IF;

  live := bootstrap_os_live_role(target);
  IF live IS DISTINCT FROM 'super_admin' THEN
    UPDATE bootstrap_os_roles
    SET revoked_at = now()
    WHERE mentee_id = target AND revoked_at IS NULL;
    INSERT INTO bootstrap_os_roles (id, mentee_id, role, granted_by, granted_at)
    VALUES (
      'role-grant-' || md5(random()::text || clock_timestamp()::text),
      target,
      'super_admin',
      caller,
      now()
    );
  END IF;

  INSERT INTO bootstrap_os_admin_audit (id, op, actor_mentee_id, actor_email, target_email, why)
  VALUES (
    'aud-grant-' || md5(random()::text || clock_timestamp()::text),
    'grant_super_admin',
    caller,
    coalesce(caller_email, 'unknown'),
    v_email,
    'grant'
  );

  RETURN jsonb_build_object('ok', true, 'email', v_email, 'role', 'super_admin');
END;
$$;

CREATE OR REPLACE FUNCTION bootstrap_os_revoke_super_admin(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gate jsonb;
  v_email text := lower(trim(coalesce(p_email, '')));
  caller text;
  caller_email text;
  target text;
  admins bigint := 0;
  revoked int := 0;
BEGIN
  gate := bootstrap_os_admin_gate();
  IF coalesce((gate ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'status', 403);
  END IF;
  caller := gate ->> 'mentee_id';
  caller_email := gate ->> 'email';
  IF v_email = '' THEN
    RETURN jsonb_build_object('ok', false, 'status', 403);
  END IF;

  SELECT id INTO target FROM bootstrap_mcp_mentees WHERE email = v_email;
  IF target IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 403);
  END IF;

  -- Serialize every revoke before the live-admin count.
  -- Lock key 202609281 is bootstrap_os_revoke_super_admin only. Do not reuse.
  -- Advisory xact lock, not SELECT ... FOR UPDATE: under READ COMMITTED a
  -- second revoke can count live super_admins before it waits on row locks,
  -- so both transactions can see two live admins and each remove one. Both
  -- paths take this lock first, so the waiter re-counts after the first
  -- commit and cannot leave zero live super_admins.
  PERFORM pg_advisory_xact_lock(202609281);

  -- Refuse before any role or audit write. The last live super_admin stays.
  SELECT count(*) INTO admins
  FROM bootstrap_os_roles
  WHERE role = 'super_admin' AND revoked_at IS NULL;
  IF admins <= 1 AND EXISTS (
    SELECT 1 FROM bootstrap_os_roles
    WHERE mentee_id = target
      AND role = 'super_admin'
      AND revoked_at IS NULL
  ) THEN
    RETURN jsonb_build_object('ok', false, 'status', 409, 'error', 'last_super_admin');
  END IF;

  UPDATE bootstrap_os_roles
  SET revoked_at = now()
  WHERE mentee_id = target
    AND role = 'super_admin'
    AND revoked_at IS NULL;
  GET DIAGNOSTICS revoked = ROW_COUNT;
  IF revoked = 0 THEN
    RETURN jsonb_build_object('ok', false, 'status', 403);
  END IF;

  IF bootstrap_os_live_role(target) IS NULL THEN
    INSERT INTO bootstrap_os_roles (id, mentee_id, role, granted_by, granted_at)
    VALUES (
      'role-member-' || md5(random()::text || clock_timestamp()::text),
      target,
      'member',
      caller,
      now()
    );
  END IF;

  INSERT INTO bootstrap_os_admin_audit (id, op, actor_mentee_id, actor_email, target_email, why)
  VALUES (
    'aud-revoke-' || md5(random()::text || clock_timestamp()::text),
    'revoke_super_admin',
    caller,
    coalesce(caller_email, 'unknown'),
    v_email,
    'revoke'
  );

  RETURN jsonb_build_object('ok', true, 'email', v_email, 'role', 'member');
END;
$$;

CREATE OR REPLACE FUNCTION bootstrap_mcp_my_labels()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid text := current_setting('app.auth_uid', true);
  user_email text := lower(nullif(current_setting('app.auth_email', true), ''));
  found_id text;
  labels jsonb;
  live text;
BEGIN
  IF uid IS NULL OR uid = '' THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT id INTO found_id
  FROM bootstrap_mcp_mentees
  WHERE auth_user_id = uid OR (user_email IS NOT NULL AND email = user_email);

  IF found_id IS NULL THEN
    RETURN jsonb_build_object(
      'authenticated', false,
      'email', user_email,
      'labels', '[]'::jsonb,
      'role', 'unset',
      'reason', 'not_invited'
    );
  END IF;

  UPDATE bootstrap_mcp_mentees
  SET auth_user_id = uid
  WHERE id = found_id
    AND auth_user_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM bootstrap_mcp_mentees m2 WHERE m2.auth_user_id = uid
    );

  SELECT coalesce(jsonb_agg(l.label ORDER BY l.label), '[]'::jsonb)
  INTO labels
  FROM bootstrap_company_labels l
  WHERE l.mentee_id = found_id;

  live := bootstrap_os_live_role(found_id);

  RETURN jsonb_build_object(
    'authenticated', true,
    'email', COALESCE(user_email, (SELECT email FROM bootstrap_mcp_mentees WHERE id = found_id)),
    'labels', labels,
    'role', coalesce(live, 'unset'),
    'note', 'Companies this login can open. A company may have several ideas; each idea is its own 0-1 board.'
  );
END;
$$;

-- mentee_reader is the authenticated analog. anon does not exist in this twin.
-- Internal helpers stay owner-only. The three RPCs and whoami match the prod grants.
REVOKE ALL ON FUNCTION bootstrap_os_live_role(text) FROM PUBLIC, mentee_reader;
REVOKE ALL ON FUNCTION bootstrap_os_admin_gate() FROM PUBLIC, mentee_reader;
REVOKE ALL ON FUNCTION bootstrap_os_create_company(text, text, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION bootstrap_os_grant_super_admin(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION bootstrap_os_revoke_super_admin(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION bootstrap_mcp_my_labels() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION bootstrap_os_create_company(text, text, boolean, text) TO mentee_reader;
GRANT EXECUTE ON FUNCTION bootstrap_os_grant_super_admin(text) TO mentee_reader;
GRANT EXECUTE ON FUNCTION bootstrap_os_revoke_super_admin(text) TO mentee_reader;
GRANT EXECUTE ON FUNCTION bootstrap_mcp_my_labels() TO mentee_reader;

-- Fictional member seed only. Company B canary is fixture data, not a secret.
INSERT INTO bootstrap_os_roles (id, mentee_id, role, granted_at)
SELECT 'role-founder-member', id, 'member', now()
FROM bootstrap_mcp_mentees
WHERE email = 'founder@example.test';

INSERT INTO bootstrap_os_companies (slug, display_name, created_by)
SELECT 'bravo', 'bravo-only-canary-token', id
FROM bootstrap_mcp_mentees
WHERE email = 'mentee-b@example.test';

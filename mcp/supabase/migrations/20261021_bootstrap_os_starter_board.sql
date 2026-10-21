-- Private starter bet board. One per confirmed signup.
-- No invites. Cannot be promoted to a real company.
-- DO NOT apply from a PR cloud agent. Do not migrate or live-probe supabase-pirin-ai.
-- A later founder_seed invite is the only path to a real company. Not this migration.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS bootstrap_os.starter_boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES bootstrap_os.companies (id) ON DELETE CASCADE,
  owner_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT starter_boards_owner_email_lower CHECK (owner_email = lower(owner_email)),
  CONSTRAINT starter_boards_one_per_account UNIQUE (owner_email)
);

ALTER TABLE bootstrap_os.starter_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE bootstrap_os.starter_boards FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE bootstrap_os.starter_boards FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION bootstrap_os.starter_boards_locked()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'starter bet board cannot be promoted';
END;
$$;

DROP TRIGGER IF EXISTS starter_boards_no_promote ON bootstrap_os.starter_boards;
CREATE TRIGGER starter_boards_no_promote
  BEFORE UPDATE OR DELETE ON bootstrap_os.starter_boards
  FOR EACH ROW EXECUTE FUNCTION bootstrap_os.starter_boards_locked();

CREATE OR REPLACE FUNCTION public.bootstrap_os_starter_is_sandbox(p_slug text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, bootstrap_os
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM bootstrap_os.starter_boards s
    JOIN bootstrap_os.companies c ON c.id = s.company_id
    WHERE c.slug = lower(trim(coalesce(p_slug, '')))
  );
$$;

REVOKE ALL ON FUNCTION public.bootstrap_os_starter_is_sandbox(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_starter_is_sandbox(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.bootstrap_os_create_starter_board()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, bootstrap_os
AS $$
DECLARE
  v_email text := NULLIF(lower(auth.jwt() ->> 'email'), '');
  v_slug text;
  v_mentee uuid;
  v_company uuid;
BEGIN
  IF v_email IS NULL OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'confirmed_signup_required');
  END IF;

  SELECT c.slug INTO v_slug
  FROM bootstrap_os.starter_boards s
  JOIN bootstrap_os.companies c ON c.id = s.company_id
  WHERE s.owner_email = v_email;
  IF v_slug IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'created', false,
      'slug', v_slug,
      'invites', false,
      'promotable', false
    );
  END IF;

  v_slug := 'sb' || substr(md5(v_email), 1, 8);

  INSERT INTO public.bootstrap_mcp_mentees (email)
  VALUES (v_email)
  ON CONFLICT (email) DO NOTHING;
  SELECT id INTO v_mentee FROM public.bootstrap_mcp_mentees WHERE email = v_email;

  INSERT INTO bootstrap_os.companies (slug, label)
  VALUES (v_slug, 'Starter')
  RETURNING id INTO v_company;

  INSERT INTO bootstrap_os.company_acl (company_id, principal, principal_kind, role)
  VALUES (v_company, v_email, 'email', 'founder');

  INSERT INTO public.bootstrap_company_labels (mentee_id, label)
  VALUES (v_mentee, v_slug);

  INSERT INTO bootstrap_os.starter_boards (company_id, owner_email)
  VALUES (v_company, v_email);

  RETURN jsonb_build_object(
    'ok', true,
    'created', true,
    'slug', v_slug,
    'invites', false,
    'promotable', false
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'starter_cap');
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_os_create_starter_board() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_create_starter_board() TO authenticated;

CREATE OR REPLACE FUNCTION public.bootstrap_mcp_invites_block_starter()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.bootstrap_os_starter_is_sandbox(NEW.company_label) THEN
    RAISE EXCEPTION 'starter bet board cannot send invites';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bootstrap_mcp_invites_block_starter ON public.bootstrap_mcp_invites;
CREATE TRIGGER bootstrap_mcp_invites_block_starter
  BEFORE INSERT ON public.bootstrap_mcp_invites
  FOR EACH ROW EXECUTE FUNCTION public.bootstrap_mcp_invites_block_starter();

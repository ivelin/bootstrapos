-- Private starter bet board. One per confirmed signup.
-- No invites. Cannot be promoted to a real company.
-- DO NOT apply from a PR cloud agent. Do not migrate or live-probe supabase-pirin-ai.
-- A later founder_seed invite is the only path to a real company. Not this migration.

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
SET search_path = bootstrap_os, public
AS $$
BEGIN
  RAISE EXCEPTION 'starter bet board cannot be promoted';
END;
$$;

DROP TRIGGER IF EXISTS starter_boards_no_promote ON bootstrap_os.starter_boards;
CREATE TRIGGER starter_boards_no_promote
  BEFORE UPDATE ON bootstrap_os.starter_boards
  FOR EACH ROW EXECUTE FUNCTION bootstrap_os.starter_boards_locked();

REVOKE ALL ON FUNCTION bootstrap_os.starter_boards_locked() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION bootstrap_os.starter_acl_owner_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = bootstrap_os, public
AS $$
DECLARE
  owner text;
BEGIN
  SELECT s.owner_email INTO owner
  FROM bootstrap_os.starter_boards s
  WHERE s.company_id = NEW.company_id;
  IF owner IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.principal_kind = 'email'
     AND lower(NEW.principal) = owner
     AND NEW.role = 'founder' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'starter bet board cannot add members';
END;
$$;

DROP TRIGGER IF EXISTS starter_acl_owner_only ON bootstrap_os.company_acl;
CREATE TRIGGER starter_acl_owner_only
  BEFORE INSERT ON bootstrap_os.company_acl
  FOR EACH ROW EXECUTE FUNCTION bootstrap_os.starter_acl_owner_only();

REVOKE ALL ON FUNCTION bootstrap_os.starter_acl_owner_only() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION bootstrap_os.starter_block_webhook()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = bootstrap_os, public
AS $$
BEGIN
  IF NEW.channel = 'webhook' AND EXISTS (
    SELECT 1 FROM bootstrap_os.starter_boards s WHERE s.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'starter bet board cannot send webhooks';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS starter_block_webhook ON bootstrap_os.notify_outbox;
CREATE TRIGGER starter_block_webhook
  BEFORE INSERT ON bootstrap_os.notify_outbox
  FOR EACH ROW EXECUTE FUNCTION bootstrap_os.starter_block_webhook();

REVOKE ALL ON FUNCTION bootstrap_os.starter_block_webhook() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION bootstrap_os.starter_block_subscriber()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = bootstrap_os, public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM bootstrap_os.starter_boards s WHERE s.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'starter bet board cannot send webhooks';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS starter_block_subscriber ON bootstrap_os.board_subscribers;
CREATE TRIGGER starter_block_subscriber
  BEFORE INSERT ON bootstrap_os.board_subscribers
  FOR EACH ROW EXECUTE FUNCTION bootstrap_os.starter_block_subscriber();

REVOKE ALL ON FUNCTION bootstrap_os.starter_block_subscriber() FROM PUBLIC, anon, authenticated;

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

CREATE OR REPLACE FUNCTION public.bootstrap_os_my_starter_slug()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, bootstrap_os
AS $$
  SELECT c.slug
  FROM bootstrap_os.starter_boards s
  JOIN bootstrap_os.companies c ON c.id = s.company_id
  WHERE s.owner_email = NULLIF(lower(auth.jwt() ->> 'email'), '')
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_os_my_starter_slug() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_my_starter_slug() TO authenticated;

CREATE OR REPLACE FUNCTION public.bootstrap_os_admin_company_count()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, bootstrap_os
AS $$
BEGIN
  RETURN (
    SELECT count(*)::int
    FROM public.bootstrap_os_companies reg
    WHERE NOT EXISTS (
      SELECT 1
      FROM bootstrap_os.starter_boards s
      JOIN bootstrap_os.companies c ON c.id = s.company_id
      WHERE c.slug = reg.slug
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_os_admin_company_count() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.bootstrap_os_create_starter_board()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, bootstrap_os
AS $$
DECLARE
  v_email text := NULLIF(lower(auth.jwt() ->> 'email'), '');
  v_slug text;
  v_existing text;
  v_mentee uuid;
  v_company uuid;
  attempt int;
BEGIN
  IF v_email IS NULL OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'confirmed_signup_required');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('starter-board:' || v_email));

  SELECT c.slug INTO v_existing
  FROM bootstrap_os.starter_boards s
  JOIN bootstrap_os.companies c ON c.id = s.company_id
  WHERE s.owner_email = v_email;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'created', false,
      'slug', v_existing,
      'invites', false,
      'promotable', false
    );
  END IF;

  INSERT INTO public.bootstrap_mcp_mentees (email)
  VALUES (v_email)
  ON CONFLICT (email) DO NOTHING;
  SELECT id INTO v_mentee FROM public.bootstrap_mcp_mentees WHERE email = v_email;

  FOR attempt IN 1..8 LOOP
    v_slug := 'sb' || substr(md5(gen_random_uuid()::text), 1, 8);
    BEGIN
      INSERT INTO bootstrap_os.companies (slug, label)
      VALUES (v_slug, 'Starter')
      RETURNING id INTO v_company;
    EXCEPTION
      WHEN unique_violation THEN
        CONTINUE;
    END;

    INSERT INTO bootstrap_os.company_acl (company_id, principal, principal_kind, role)
    VALUES (v_company, v_email, 'email', 'founder');

    INSERT INTO public.bootstrap_company_labels (mentee_id, label)
    VALUES (v_mentee, v_slug);

    INSERT INTO bootstrap_os.starter_boards (company_id, owner_email)
    VALUES (v_company, v_email)
    ON CONFLICT (owner_email) DO NOTHING;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true,
        'created', true,
        'slug', v_slug,
        'invites', false,
        'promotable', false
      );
    END IF;

    DELETE FROM bootstrap_os.company_acl WHERE company_id = v_company;
    DELETE FROM public.bootstrap_company_labels
    WHERE mentee_id = v_mentee AND label = v_slug;
    DELETE FROM bootstrap_os.companies WHERE id = v_company;

    SELECT c.slug INTO v_existing
    FROM bootstrap_os.starter_boards s
    JOIN bootstrap_os.companies c ON c.id = s.company_id
    WHERE s.owner_email = v_email;
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object(
        'ok', true,
        'created', false,
        'slug', v_existing,
        'invites', false,
        'promotable', false
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', false, 'error', 'starter_cap');
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_os_create_starter_board() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_create_starter_board() TO authenticated;

CREATE OR REPLACE FUNCTION public.bootstrap_mcp_invites_block_starter()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, bootstrap_os
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

REVOKE ALL ON FUNCTION public.bootstrap_mcp_invites_block_starter() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.bootstrap_os_change_acl(
  p_company text,
  p_principal text,
  p_principal_kind text,
  p_role text,
  p_op text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, bootstrap_os
AS $$
DECLARE
  cid uuid;
  v_kind text := lower(trim(coalesce(p_principal_kind, '')));
  v_principal text := trim(coalesce(p_principal, ''));
  v_role text := lower(trim(coalesce(p_role, '')));
  v_op text := lower(trim(coalesce(p_op, '')));
  before_row bootstrap_os.company_acl%ROWTYPE;
BEGIN
  IF NOT public.bootstrap_os_held_label(p_company) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'company not visible');
  END IF;
  IF public.bootstrap_os_starter_is_sandbox(p_company) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sandbox_cannot_share');
  END IF;
  IF v_kind NOT IN ('email', 'sub') OR v_principal = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid principal');
  END IF;
  IF v_kind = 'email' THEN
    v_principal := lower(v_principal);
  END IF;
  IF v_role NOT IN ('founder', 'founder_authorized', 'advisor') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid role');
  END IF;
  IF v_op NOT IN ('grant', 'revoke') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid op');
  END IF;
  cid := public.bootstrap_os_ensure_company(p_company);
  IF NOT bootstrap_os.has_role(cid, 'founder', 'founder_authorized') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'founder only');
  END IF;
  SELECT * INTO before_row FROM bootstrap_os.company_acl
  WHERE company_id = cid AND principal = v_principal AND principal_kind = v_kind;
  IF v_op = 'grant' THEN
    INSERT INTO bootstrap_os.company_acl (company_id, principal, principal_kind, role)
    VALUES (cid, v_principal, v_kind, v_role)
    ON CONFLICT (company_id, principal, principal_kind) DO NOTHING;
  ELSE
    DELETE FROM bootstrap_os.company_acl
    WHERE company_id = cid AND principal = v_principal AND principal_kind = v_kind;
  END IF;
  PERFORM bootstrap_os.emit_audit(
    cid,
    NULL,
    coalesce(bootstrap_os.actor_principal(), 'acl'),
    'mcp',
    jsonb_build_object(
      'op', v_op,
      'via', 'acl',
      'principal_kind', v_kind,
      'role', v_role,
      'before', CASE
        WHEN before_row.id IS NULL THEN NULL
        ELSE jsonb_build_object(
          'principal', before_row.principal,
          'principalKind', before_row.principal_kind,
          'role', before_row.role
        )
      END,
      'after', CASE
        WHEN v_op = 'revoke' THEN NULL
        ELSE jsonb_build_object(
          'principal', v_principal,
          'principalKind', v_kind,
          'role', v_role
        )
      END
    )
  );
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_os_change_acl(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_change_acl(text, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION bootstrap_os.portfolio_view(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = bootstrap_os, public
AS $$
DECLARE
  live_n int;
  ranked jsonb;
  unscored jsonb;
BEGIN
  IF EXISTS (
    SELECT 1 FROM bootstrap_os.starter_boards s WHERE s.company_id = p_company_id
  ) THEN
    RETURN jsonb_build_object(
      'applies', false,
      'reason', 'a starter bet board is not in the portfolio',
      'formula', 'impact + evidence + leverage',
      'ranked', '[]'::jsonb,
      'unscored', '[]'::jsonb
    );
  END IF;
  SELECT count(*)::int INTO live_n
  FROM bootstrap_os.ideas i
  WHERE i.company_id = p_company_id
    AND i.current_gate <> 'kill'
    AND NOT EXISTS (
      SELECT 1 FROM bootstrap_os.starter_boards s WHERE s.company_id = i.company_id
    );
  IF live_n < 2 THEN
    RETURN jsonb_build_object(
      'applies', false,
      'reason', 'portfolio scoring applies when two or more live (non-kill) ideas are on the board',
      'formula', 'impact + evidence + leverage',
      'ranked', '[]'::jsonb,
      'unscored', '[]'::jsonb
    );
  END IF;
  SELECT coalesce(
    jsonb_agg(row_score ORDER BY (row_score->>'total')::int DESC, row_score->>'slug'),
    '[]'::jsonb
  )
  INTO ranked
  FROM (
    SELECT jsonb_strip_nulls(jsonb_build_object(
      'slug', i.slug,
      'name', i.name,
      'impact', (s->>'impact')::int,
      'evidence', (s->>'evidence')::int,
      'leverage', (s->>'leverage')::int,
      'total', (s->>'impact')::int + (s->>'evidence')::int + (s->>'leverage')::int,
      'why', s->>'why',
      'scoredAt', s->>'scoredAt',
      'scoredBy', s->>'scoredBy'
    )) AS row_score
    FROM bootstrap_os.ideas i
    CROSS JOIN LATERAL (
      SELECT bootstrap_os.read_portfolio_score(i.scoreboard->'portfolioScore') AS s
    ) x
    WHERE i.company_id = p_company_id
      AND i.current_gate <> 'kill'
      AND x.s IS NOT NULL
  ) q;
  SELECT coalesce(
    jsonb_agg(jsonb_build_object('slug', i.slug, 'name', i.name) ORDER BY i.slug),
    '[]'::jsonb
  )
  INTO unscored
  FROM bootstrap_os.ideas i
  WHERE i.company_id = p_company_id
    AND i.current_gate <> 'kill'
    AND bootstrap_os.read_portfolio_score(i.scoreboard->'portfolioScore') IS NULL;
  RETURN jsonb_build_object(
    'applies', true,
    'formula', 'impact + evidence + leverage',
    'ranked', ranked,
    'unscored', unscored
  );
END;
$$;

REVOKE ALL ON FUNCTION bootstrap_os.portfolio_view(uuid) FROM PUBLIC, anon, authenticated;

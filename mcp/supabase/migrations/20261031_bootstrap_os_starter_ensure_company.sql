-- Starter boards already store the owner in company_acl.
-- ensure_company inserts founder_authorized on every call.
-- starter_acl_owner_only runs BEFORE INSERT, so ON CONFLICT DO NOTHING never runs.
-- Skip that insert when this email already has a row. Leave the trigger in place.
-- Seed the same default idea ensure_company seeds for a new company.
-- Do not migrate or live-probe supabase-pirin-ai from a PR cloud agent.

CREATE OR REPLACE FUNCTION public.bootstrap_os_ensure_company(p_company text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, bootstrap_os
AS $$
DECLARE
  v_slug text := lower(p_company);
  cid uuid;
  email text := NULLIF(lower(auth.jwt() ->> 'email'), '');
BEGIN
  IF NOT public.bootstrap_os_held_label(v_slug) THEN
    RAISE EXCEPTION 'company not visible';
  END IF;
  SELECT c.id INTO cid FROM bootstrap_os.companies c WHERE c.slug = v_slug;
  IF cid IS NULL THEN
    INSERT INTO bootstrap_os.companies (slug, label) VALUES (v_slug, v_slug) RETURNING id INTO cid;
    INSERT INTO bootstrap_os.ideas (company_id, slug, name, journey_phase, loop_stage, current_gate, scoreboard)
    VALUES (cid, 'default', v_slug, 1, 1, 'hold',
      jsonb_build_object('schema_version', 1, 'readyForHumanEyes', jsonb_build_object('status', 'unknown'),
        'autonomyPosture', 'strict', 'openQuestions', '[]'::jsonb, 'constraint_this_week', ''));
  END IF;
  IF email IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM bootstrap_os.company_acl AS existing
    WHERE existing.company_id = cid
      AND existing.principal = email
      AND existing.principal_kind = 'email'
  ) THEN
    INSERT INTO bootstrap_os.company_acl (company_id, principal, principal_kind, role)
    VALUES (cid, email, 'email', 'founder_authorized')
    ON CONFLICT (company_id, principal, principal_kind) DO NOTHING;
  END IF;
  RETURN cid;
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_os_ensure_company(text) FROM PUBLIC, anon;

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
      INSERT INTO bootstrap_os.companies (slug, label, starter)
      VALUES (v_slug, 'Starter', true)
      RETURNING id INTO v_company;
    EXCEPTION
      WHEN unique_violation THEN
        CONTINUE;
    END;

    INSERT INTO bootstrap_os.company_acl (company_id, principal, principal_kind, role)
    VALUES (v_company, v_email, 'email', 'founder');

    INSERT INTO bootstrap_os.ideas (company_id, slug, name, journey_phase, loop_stage, current_gate, scoreboard)
    VALUES (
      v_company,
      'default',
      v_slug,
      1,
      1,
      'hold',
      jsonb_build_object(
        'schema_version', 1,
        'readyForHumanEyes', jsonb_build_object('status', 'unknown'),
        'autonomyPosture', 'strict',
        'openQuestions', '[]'::jsonb,
        'constraint_this_week', ''
      )
    );

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

    DELETE FROM bootstrap_os.ideas WHERE company_id = v_company;
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

INSERT INTO bootstrap_os.ideas (company_id, slug, name, journey_phase, loop_stage, current_gate, scoreboard)
SELECT
  c.id,
  'default',
  c.slug,
  1,
  1,
  'hold',
  jsonb_build_object(
    'schema_version', 1,
    'readyForHumanEyes', jsonb_build_object('status', 'unknown'),
    'autonomyPosture', 'strict',
    'openQuestions', '[]'::jsonb,
    'constraint_this_week', ''
  )
FROM bootstrap_os.companies c
JOIN bootstrap_os.starter_boards s ON s.company_id = c.id
WHERE NOT EXISTS (
  SELECT 1 FROM bootstrap_os.ideas i WHERE i.company_id = c.id
);

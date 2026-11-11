-- change_acl email grants write the company label; revokes remove it.
-- A same-role grant writes that one email's company label when the label is missing.
-- Cos applies on supabase-pirin-ai. PR agents: PGlite/pg16 only. Do not apply from a PR agent.
-- No mass backfill. No GRANT to anon.

BEGIN;

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
  after_row bootstrap_os.company_acl%ROWTYPE;
  v_self int;
  v_deleted int := 0;
  v_rank4 int := 0;
  v_label_backfill boolean := false;
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
  IF v_role NOT IN ('founder', 'owner', 'founder_authorized', 'editor', 'advisor', 'commenter') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid role');
  END IF;
  IF v_op NOT IN ('grant', 'revoke') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid op');
  END IF;
  -- Existing boards are resolved without ensure_company so that function's
  -- transaction advisory lock does not pin the slug until commit.
  SELECT c.id INTO cid
  FROM bootstrap_os.companies c
  WHERE c.slug = lower(trim(p_company));
  IF cid IS NULL THEN
    cid := public.bootstrap_os_ensure_company(p_company);
  END IF;
  -- Owner tier only (founder or owner). Editor and commenter stay refused.
  IF NOT bootstrap_os.has_rank(cid, 4) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_role', 'message', 'Only board owners can change roles.');
  END IF;
  SELECT COALESCE(
    (
      SELECT MAX(bootstrap_os.rank_of(a.role))
      FROM bootstrap_os.company_acl a
      WHERE a.company_id = cid
        AND (
          (a.principal_kind = 'email' AND a.principal = bootstrap_os.actor_email())
          OR (a.principal_kind = 'sub' AND a.principal = bootstrap_os.actor_sub())
        )
    ),
    CASE WHEN public.bootstrap_os_held_label(p_company) THEN 2 ELSE 0 END
  ) INTO v_self;
  IF v_op = 'grant' AND bootstrap_os.rank_of(v_role) > v_self THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_role', 'message', 'You cannot grant a role above your own.');
  END IF;
  -- Serialize grant and revoke so the ACL read and the write see one snapshot.
  PERFORM pg_advisory_xact_lock(hashtextextended(cid::text, 0));
  SELECT * INTO before_row FROM bootstrap_os.company_acl
  WHERE company_id = cid AND principal = v_principal AND principal_kind = v_kind;
  IF v_op = 'revoke' AND before_row.id IS NOT NULL AND bootstrap_os.rank_of(before_row.role) > v_self THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_role', 'message', 'You cannot remove a role above your own.');
  END IF;
  IF v_op = 'grant' AND before_row.id IS NOT NULL AND before_row.role IS DISTINCT FROM v_role THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'role_conflict',
      'message', format('already has role %s; revoke first', before_row.role)
    );
  END IF;
  IF v_op = 'grant' THEN
    IF before_row.id IS NULL THEN
      IF v_kind = 'email' THEN
        PERFORM public.bootstrap_os_grant_acl_internal(cid, v_principal, v_role, true);
      ELSE
        -- Helper is email-only. Sub grants stay a direct ACL insert.
        INSERT INTO bootstrap_os.company_acl (company_id, principal, principal_kind, role)
        VALUES (cid, v_principal, v_kind, v_role)
        ON CONFLICT (company_id, principal, principal_kind) DO NOTHING;
      END IF;
      SELECT * INTO after_row FROM bootstrap_os.company_acl
      WHERE company_id = cid AND principal = v_principal AND principal_kind = v_kind;
      IF after_row.id IS NULL OR after_row.role IS DISTINCT FROM v_role THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'role_conflict',
          'message', format('already has role %s; revoke first', coalesce(after_row.role, 'unknown'))
        );
      END IF;
    ELSIF v_kind = 'email' AND NOT EXISTS (
      SELECT 1
      FROM public.bootstrap_company_labels AS lab
      JOIN public.bootstrap_mcp_mentees AS men ON men.id = lab.mentee_id
      JOIN bootstrap_os.companies AS co ON co.id = cid
      WHERE men.email = v_principal AND lab.label = co.slug
    ) THEN
      INSERT INTO public.bootstrap_mcp_mentees (email)
      VALUES (v_principal)
      ON CONFLICT (email) DO NOTHING;
      INSERT INTO public.bootstrap_company_labels (mentee_id, label)
      SELECT men.id, co.slug
      FROM public.bootstrap_mcp_mentees AS men
      CROSS JOIN bootstrap_os.companies AS co
      WHERE men.email = v_principal AND co.id = cid
      ON CONFLICT (mentee_id, label) DO NOTHING;
      v_label_backfill := true;
    END IF;
  ELSE
    SELECT count(*) INTO v_rank4
    FROM bootstrap_os.company_acl a
    WHERE a.company_id = cid AND bootstrap_os.rank_of(a.role) >= 4;
    IF before_row.id IS NOT NULL AND bootstrap_os.rank_of(before_row.role) >= 4 AND v_rank4 <= 1 THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'last_owner',
        'message', 'This board must keep an owner.'
      );
    END IF;
    DELETE FROM bootstrap_os.company_acl
    WHERE company_id = cid AND principal = v_principal AND principal_kind = v_kind;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    IF v_kind = 'email' AND v_deleted > 0 THEN
      DELETE FROM public.bootstrap_company_labels AS lab
      USING public.bootstrap_mcp_mentees AS men, bootstrap_os.companies AS co
      WHERE lab.mentee_id = men.id
        AND men.email = v_principal
        AND co.id = cid
        AND lab.label = co.slug;
    END IF;
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
      'labelBackfill', v_label_backfill,
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

COMMIT;

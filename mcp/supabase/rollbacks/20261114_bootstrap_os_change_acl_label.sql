-- Restores public.bootstrap_os_change_acl to the 20261111 body.
-- 20261114 creates no new objects.

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
  v_self int;
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
  cid := public.bootstrap_os_ensure_company(p_company);
  IF NOT bootstrap_os.has_rank(cid, 3) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_role', 'message', 'Your role on this board can comment, but not edit. Ask the founder to invite you to edit.');
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
  SELECT * INTO before_row FROM bootstrap_os.company_acl
  WHERE company_id = cid AND principal = v_principal AND principal_kind = v_kind;
  IF v_op = 'grant' AND bootstrap_os.rank_of(v_role) > v_self THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_role', 'message', 'Your role on this board can comment, but not edit. Ask the founder to invite you to edit.');
  END IF;
  IF v_op = 'revoke' AND before_row.id IS NOT NULL AND bootstrap_os.rank_of(before_row.role) >= v_self THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_role', 'message', 'Your role on this board can comment, but not edit. Ask the founder to invite you to edit.');
  END IF;
  IF v_op = 'grant' THEN
    IF v_kind = 'email' THEN
      PERFORM public.bootstrap_os_grant_acl_internal(cid, v_principal, v_role, false);
    ELSE
      -- Helper is email-only. Sub grants stay a direct ACL insert.
      INSERT INTO bootstrap_os.company_acl (company_id, principal, principal_kind, role)
      VALUES (cid, v_principal, v_kind, v_role)
      ON CONFLICT (company_id, principal, principal_kind) DO NOTHING;
    END IF;
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

COMMIT;

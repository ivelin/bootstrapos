-- Restores bootstrap_mcp_my_labels to the 20261115 body and drops the
-- derived discount-class helper. Not part of the forward stream.

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
  membership jsonb;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  user_email := bootstrap_os.actor_email();
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
  membership := public.bootstrap_os_membership_for(uid, user_email);

  RETURN jsonb_build_object(
    'authenticated', true,
    'email', user_email,
    'labels', labels,
    'role', coalesce(live, 'unset'),
    'membership_level', membership ->> 'level',
    'membership_status', membership ->> 'status',
    'note', 'Companies this login can open. A company may have several ideas; each idea is its own 0-1 board.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.bootstrap_mcp_my_labels() TO authenticated;

DROP FUNCTION IF EXISTS public.bootstrap_os_discount_class(uuid, text);

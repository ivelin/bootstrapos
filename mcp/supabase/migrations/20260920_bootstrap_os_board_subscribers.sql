-- Hosted board subscribers + webhook deliveries. change_acl for grants subscribe depends on.
-- Cos applies on supabase-pirin-ai. PR agents: PGlite / file lock only.
-- Do not migrate/seed/live-probe supabase-pirin-ai from a PR cloud agent.
-- Email channel stays enqueue-only. No Resend / SMTP from this repo.

CREATE OR REPLACE FUNCTION bootstrap_os.audit_idea_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bootstrap_os, public
AS $$
BEGIN
  PERFORM bootstrap_os.emit_audit(
    NEW.company_id,
    NEW.id,
    COALESCE(bootstrap_os.actor_principal(), NEW.name),
    COALESCE(NULLIF(current_setting('app.client', true), ''), 'put_journey'),
    jsonb_build_object(
      'via', 'put_journey',
      'journey_phase', NEW.journey_phase,
      'loop_stage', NEW.loop_stage,
      'current_gate', NEW.current_gate,
      'constraint_this_week', COALESCE(NEW.scoreboard->>'constraint_this_week', '')
    )
  );
  PERFORM bootstrap_os.enqueue_board_notify(
    NEW.company_id,
    NEW.id,
    'put_journey',
    COALESCE(bootstrap_os.actor_principal(), NEW.name),
    COALESCE(NULLIF(current_setting('app.notify_summary', true), ''), 'board write')
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION bootstrap_os.notify_bundle(
  p_company_id uuid,
  p_idea_id uuid,
  p_event text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, bootstrap_os
AS $$
DECLARE
  deliveries jsonb;
  n_webhook int;
  n_email int;
BEGIN
  SELECT
    coalesce(
      jsonb_agg(jsonb_build_object('url', s.webhook_url, 'payload', o.payload))
        FILTER (WHERE o.channel = 'webhook'),
      '[]'::jsonb
    ),
    count(*) FILTER (WHERE o.channel = 'webhook'),
    count(*) FILTER (WHERE o.channel = 'email')
  INTO deliveries, n_webhook, n_email
  FROM bootstrap_os.notify_outbox o
  JOIN bootstrap_os.board_subscribers s ON s.id = o.subscriber_id
  WHERE o.company_id = p_company_id
    AND (p_idea_id IS NULL OR o.idea_id = p_idea_id)
    AND o.event_type = p_event
    AND o.created_at = now();

  RETURN jsonb_build_object(
    'notify', jsonb_build_object(
      'webhook', coalesce(n_webhook, 0),
      'emailQueued', coalesce(n_email, 0)
    ),
    'webhookDeliveries', coalesce(deliveries, '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.bootstrap_os_subscribe_board(
  p_company text,
  p_idea text,
  p_principal text,
  p_principal_kind text,
  p_webhook_url text,
  p_email_opt_in boolean DEFAULT FALSE
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, bootstrap_os
AS $$
DECLARE
  cid uuid;
  iid uuid;
  v_kind text := lower(trim(coalesce(p_principal_kind, '')));
  v_principal text := trim(coalesce(p_principal, ''));
  v_url text := trim(coalesce(p_webhook_url, ''));
  row_sub bootstrap_os.board_subscribers%ROWTYPE;
BEGIN
  IF NOT public.bootstrap_os_held_label(p_company) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'company not visible');
  END IF;
  IF v_kind NOT IN ('email', 'sub') OR v_principal = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid principal');
  END IF;
  IF v_kind = 'email' THEN
    v_principal := lower(v_principal);
  END IF;
  IF v_url !~ '^https://' OR char_length(v_url) < 10 OR char_length(v_url) > 2048 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'webhook URL must be https');
  END IF;
  cid := public.bootstrap_os_ensure_company(p_company);
  IF NOT bootstrap_os.has_role(cid, 'founder', 'founder_authorized') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'founder or founder-authorized grant only');
  END IF;
  IF NOT bootstrap_os.subscriber_is_acl_member(cid, v_principal, v_kind) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'subscriber must already have ACL access');
  END IF;
  IF p_idea IS NOT NULL AND length(trim(p_idea)) > 0 THEN
    SELECT i.id INTO iid FROM bootstrap_os.ideas i
    WHERE i.company_id = cid AND i.slug = lower(trim(p_idea));
    IF iid IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'idea not visible');
    END IF;
  END IF;
  SELECT * INTO row_sub FROM bootstrap_os.board_subscribers s
  WHERE s.company_id = cid
    AND s.principal = v_principal
    AND s.principal_kind = v_kind
    AND coalesce(s.idea_id, '00000000-0000-0000-0000-000000000000'::uuid)
      = coalesce(iid, '00000000-0000-0000-0000-000000000000'::uuid);
  IF row_sub.id IS NULL THEN
    INSERT INTO bootstrap_os.board_subscribers (
      company_id, idea_id, principal, principal_kind, webhook_url, email_opt_in, created_by
    ) VALUES (
      cid, iid, v_principal, v_kind, v_url, coalesce(p_email_opt_in, false),
      coalesce(bootstrap_os.actor_principal(), 'unknown')
    )
    RETURNING * INTO row_sub;
  END IF;
  RETURN jsonb_build_object(
    'ok', true,
    'subscriber', jsonb_build_object(
      'principal', row_sub.principal,
      'principalKind', row_sub.principal_kind,
      'emailOptIn', row_sub.email_opt_in,
      'ideaId', row_sub.idea_id,
      'webhookUrl', row_sub.webhook_url
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.bootstrap_os_unsubscribe_board(
  p_company text,
  p_idea text,
  p_principal text,
  p_principal_kind text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, bootstrap_os
AS $$
DECLARE
  cid uuid;
  iid uuid;
  v_kind text := lower(trim(coalesce(p_principal_kind, '')));
  v_principal text := trim(coalesce(p_principal, ''));
  n int := 0;
BEGIN
  IF NOT public.bootstrap_os_held_label(p_company) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'company not visible');
  END IF;
  IF v_kind NOT IN ('email', 'sub') OR v_principal = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid principal');
  END IF;
  IF v_kind = 'email' THEN
    v_principal := lower(v_principal);
  END IF;
  cid := public.bootstrap_os_ensure_company(p_company);
  IF NOT bootstrap_os.has_role(cid, 'founder', 'founder_authorized') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'founder or founder-authorized grant only');
  END IF;
  IF p_idea IS NOT NULL AND length(trim(p_idea)) > 0 THEN
    SELECT i.id INTO iid FROM bootstrap_os.ideas i
    WHERE i.company_id = cid AND i.slug = lower(trim(p_idea));
    IF iid IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'idea not visible');
    END IF;
  END IF;
  DELETE FROM bootstrap_os.board_subscribers s
  WHERE s.company_id = cid
    AND s.principal = v_principal
    AND s.principal_kind = v_kind
    AND coalesce(s.idea_id, '00000000-0000-0000-0000-000000000000'::uuid)
      = coalesce(iid, '00000000-0000-0000-0000-000000000000'::uuid);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'removed', n);
END;
$$;

CREATE OR REPLACE FUNCTION public.bootstrap_os_list_subscribers(p_company text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, bootstrap_os
AS $$
DECLARE
  cid uuid;
  company_row bootstrap_os.companies%ROWTYPE;
  subs jsonb;
BEGIN
  IF NOT public.bootstrap_os_held_label(p_company) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'company not visible');
  END IF;
  cid := public.bootstrap_os_ensure_company(p_company);
  SELECT * INTO company_row FROM bootstrap_os.companies WHERE id = cid;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'principal', s.principal,
    'principalKind', s.principal_kind,
    'emailOptIn', s.email_opt_in,
    'ideaId', s.idea_id,
    'webhookUrl', s.webhook_url
  ) ORDER BY s.principal), '[]'::jsonb)
  INTO subs
  FROM bootstrap_os.board_subscribers s
  WHERE s.company_id = cid;
  RETURN jsonb_build_object(
    'ok', true,
    'company', jsonb_build_object('slug', company_row.slug, 'label', company_row.label),
    'subscribers', subs
  );
END;
$$;

-- Hosted ensure_company grants founder_authorized, not founder. Same write gate as subscribe.
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
BEGIN
  IF NOT public.bootstrap_os_held_label(p_company) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'company not visible');
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
  IF v_op = 'grant' THEN
    INSERT INTO bootstrap_os.company_acl (company_id, principal, principal_kind, role)
    VALUES (cid, v_principal, v_kind, v_role)
    ON CONFLICT (company_id, principal, principal_kind) DO NOTHING;
  ELSE
    DELETE FROM bootstrap_os.company_acl
    WHERE company_id = cid AND principal = v_principal AND principal_kind = v_kind;
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.bootstrap_os_list_webhook_deliveries_for_event(
  p_company text,
  p_idea text,
  p_event text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, bootstrap_os
AS $$
DECLARE
  cid uuid;
  iid uuid;
  v_event text := trim(coalesce(p_event, ''));
  bundle jsonb;
  latest timestamptz;
  deliveries jsonb;
  n_webhook int;
  n_email int;
BEGIN
  IF NOT public.bootstrap_os_held_label(p_company) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'company not visible');
  END IF;
  IF v_event NOT IN ('put_journey', 'post_comment', 'gate_event') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid event');
  END IF;
  cid := public.bootstrap_os_ensure_company(p_company);
  SELECT i.id INTO iid FROM bootstrap_os.ideas i
  WHERE i.company_id = cid AND i.slug = lower(coalesce(nullif(p_idea, ''), 'default'));
  SELECT max(o.created_at) INTO latest
  FROM bootstrap_os.notify_outbox o
  WHERE o.company_id = cid
    AND (iid IS NULL OR o.idea_id = iid)
    AND o.event_type = v_event;
  SELECT
    coalesce(
      jsonb_agg(jsonb_build_object('url', s.webhook_url, 'payload', o.payload))
        FILTER (WHERE o.channel = 'webhook'),
      '[]'::jsonb
    ),
    count(*) FILTER (WHERE o.channel = 'webhook'),
    count(*) FILTER (WHERE o.channel = 'email')
  INTO deliveries, n_webhook, n_email
  FROM bootstrap_os.notify_outbox o
  JOIN bootstrap_os.board_subscribers s ON s.id = o.subscriber_id
  WHERE o.company_id = cid
    AND (iid IS NULL OR o.idea_id = iid)
    AND o.event_type = v_event
    AND (latest IS NULL OR o.created_at = latest);
  bundle := jsonb_build_object(
    'ok', true,
    'notify', jsonb_build_object(
      'webhook', coalesce(n_webhook, 0),
      'emailQueued', coalesce(n_email, 0)
    ),
    'webhookDeliveries', coalesce(deliveries, '[]'::jsonb)
  );
  RETURN bundle;
END;
$$;

CREATE OR REPLACE FUNCTION public.bootstrap_os_put_journey(
  p_company text, p_idea text, p_why text, p_founder_yes boolean,
  p_journey_phase int DEFAULT NULL, p_loop_stage int DEFAULT NULL,
  p_current_gate text DEFAULT NULL, p_constraint text DEFAULT NULL,
  p_founder_written_decision text DEFAULT NULL,
  p_scoreboard jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, bootstrap_os AS $$
DECLARE
  cid uuid;
  idea_row bootstrap_os.ideas%ROWTYPE;
  email text := NULLIF(lower(auth.jwt() ->> 'email'), '');
  board jsonb;
  bundle jsonb;
BEGIN
  IF p_founder_yes IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'founder yes required in the agent chat');
  END IF;
  cid := public.bootstrap_os_ensure_company(p_company);
  SELECT * INTO idea_row FROM bootstrap_os.ideas
  WHERE company_id = cid AND slug = lower(coalesce(nullif(p_idea, ''), 'default'));
  IF idea_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'idea not found; call create_idea first');
  END IF;
  PERFORM set_config('app.notify_summary', left(coalesce(p_why, 'board write'), 80), true);
  IF p_journey_phase IS NOT NULL THEN idea_row.journey_phase := p_journey_phase; END IF;
  IF p_loop_stage IS NOT NULL THEN idea_row.loop_stage := p_loop_stage; END IF;
  IF p_current_gate IS NOT NULL THEN idea_row.current_gate := p_current_gate::bootstrap_os.gate_decision; END IF;
  IF p_scoreboard IS NOT NULL AND jsonb_typeof(p_scoreboard) = 'object' THEN
    idea_row.scoreboard := coalesce(idea_row.scoreboard, '{}'::jsonb) || (p_scoreboard - 'owner' - 'owners' - 'ownerName' - 'ownerEmail');
  END IF;
  IF p_constraint IS NOT NULL THEN
    idea_row.scoreboard := jsonb_set(coalesce(idea_row.scoreboard, '{}'::jsonb), '{constraint_this_week}', to_jsonb(left(p_constraint, 280)));
  END IF;
  UPDATE bootstrap_os.ideas SET journey_phase = idea_row.journey_phase, loop_stage = idea_row.loop_stage,
    current_gate = idea_row.current_gate, scoreboard = idea_row.scoreboard, updated_at = now() WHERE id = idea_row.id;
  INSERT INTO bootstrap_os.gate_events (idea_id, action, why, who)
  VALUES (idea_row.id, idea_row.current_gate, p_why, coalesce(email, 'unknown'));
  PERFORM bootstrap_os.emit_audit(cid, idea_row.id, coalesce(email, 'unknown'), 'mcp',
    jsonb_build_object('op', 'put_journey', 'why', p_why, 'gate', idea_row.current_gate));
  board := public.bootstrap_os_get_journey(p_company, idea_row.slug);
  bundle := bootstrap_os.notify_bundle(cid, idea_row.id, 'put_journey');
  RETURN board || bundle;
END;
$$;

CREATE OR REPLACE FUNCTION public.bootstrap_os_post_comment(p_company text, p_idea text, p_body text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, bootstrap_os AS $$
DECLARE
  cid uuid;
  iid uuid;
  email text := NULLIF(lower(auth.jwt() ->> 'email'), '');
  bundle jsonb;
BEGIN
  cid := public.bootstrap_os_ensure_company(p_company);
  SELECT id INTO iid FROM bootstrap_os.ideas
  WHERE company_id = cid AND slug = lower(coalesce(nullif(p_idea, ''), 'default'));
  IF iid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'idea not found; call create_idea first');
  END IF;
  INSERT INTO bootstrap_os.comments (idea_id, body, who) VALUES (iid, p_body, coalesce(email, 'unknown'));
  PERFORM bootstrap_os.emit_audit(cid, iid, coalesce(email, 'unknown'), 'mcp',
    jsonb_build_object('op', 'post_comment'));
  bundle := bootstrap_os.notify_bundle(cid, iid, 'post_comment');
  RETURN jsonb_build_object('ok', true, 'clocksUnchanged', true) || bundle;
END;
$$;

REVOKE ALL ON FUNCTION bootstrap_os.audit_idea_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION bootstrap_os.notify_bundle(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.bootstrap_os_subscribe_board(text, text, text, text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bootstrap_os_unsubscribe_board(text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bootstrap_os_list_subscribers(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bootstrap_os_change_acl(text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bootstrap_os_list_webhook_deliveries_for_event(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bootstrap_os_put_journey(text, text, text, boolean, int, int, text, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bootstrap_os_post_comment(text, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.bootstrap_os_subscribe_board(text, text, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_unsubscribe_board(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_list_subscribers(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_change_acl(text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_list_webhook_deliveries_for_event(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_put_journey(text, text, text, boolean, int, int, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_post_comment(text, text, text) TO authenticated;

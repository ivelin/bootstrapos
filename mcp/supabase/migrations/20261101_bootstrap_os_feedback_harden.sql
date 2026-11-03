-- Feedback harden. Operator applies on supabase-pirin-ai. PR agents: PGlite only.
-- Do not edit 20260930_bootstrap_os_submit_feedback.sql. It is already applied.
-- Do not migrate/seed/live-probe supabase-pirin-ai from a PR cloud agent.
-- Supabase default privileges grant EXECUTE to anon. Revoke that. Keep authenticated.

CREATE OR REPLACE FUNCTION bootstrap_os.feedback_fingerprint(
  p_tool text,
  p_kind text,
  p_summary text,
  p_actor text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT md5(
    'bootstrap-os' || E'\n' ||
    coalesce(nullif(trim(p_tool), ''), '') || E'\n' ||
    coalesce(p_kind, '') || E'\n' ||
    md5(lower(regexp_replace(trim(coalesce(p_summary, '')), '[[:space:]]+', ' ', 'g'))) || E'\n' ||
    coalesce(lower(trim(p_actor)), '')
  );
$$;

CREATE OR REPLACE FUNCTION public.bootstrap_os_submit_feedback(p_body jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, bootstrap_os
AS $$
DECLARE
  v_sub text := NULLIF(auth.jwt() ->> 'sub', '');
  v_email text := NULLIF(lower(auth.jwt() ->> 'email'), '');
  v_actor text := COALESCE(v_sub, v_email);
  v_kind text := NULLIF(trim(coalesce(p_body->>'kind', '')), '');
  v_summary text;
  v_level text := COALESCE(NULLIF(trim(coalesce(p_body->>'context_level', '')), ''), 'identity_only');
  v_severity text := COALESCE(NULLIF(trim(coalesce(p_body->>'severity', '')), ''), 'annoying');
  v_tool text := NULLIF(trim(coalesce(p_body->>'tool', '')), '');
  v_submission text := NULLIF(trim(coalesce(p_body->>'submission_id', '')), '');
  v_fp text;
  v_id text;
  v_existing text;
  v_reasoning text;
  v_keys jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sign in to Bootstrap OS and ask again.');
  END IF;
  IF COALESCE(p_body->>'user_consented', '') IS DISTINCT FROM 'true' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Needs a yes in this chat.');
  END IF;
  IF v_kind IS NULL OR v_kind NOT IN ('bug', 'missing_capability', 'confusing_output', 'docs') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'That kind is not one of the four.');
  END IF;
  IF p_body->>'summary' IS NULL OR length(trim(p_body->>'summary')) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Say what happened.');
  END IF;
  IF length(trim(p_body->>'summary')) > 2000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Summary is too long.');
  END IF;
  IF length(trim(coalesce(p_body->>'expected', ''))) > 2000
     OR length(trim(coalesce(p_body->>'actual', ''))) > 2000
     OR length(trim(coalesce(p_body->>'intent_context', ''))) > 500
     OR length(trim(coalesce(p_body->>'reasoning', ''))) > 8000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'That note is too long.');
  END IF;
  IF v_level NOT IN ('identity_only', 'tool_trace', 'reasoning_trace') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'That context level is not one of the three.');
  END IF;
  IF v_severity NOT IN ('blocker', 'annoying', 'wish') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'That severity is not one of the three.');
  END IF;
  IF v_level = 'identity_only' AND (
    length(trim(coalesce(p_body->>'reasoning', ''))) > 0
    OR (jsonb_typeof(p_body->'argument_keys') = 'array' AND jsonb_array_length(p_body->'argument_keys') > 0)
    OR length(trim(coalesce(p_body->>'error_code', ''))) > 0
    OR length(trim(coalesce(p_body->>'latency_ms', ''))) > 0
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Leave the trace off this ticket.');
  END IF;
  IF v_tool IS NOT NULL AND v_tool !~ '^[A-Za-z0-9_]{1,80}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Name the tool in plain letters.');
  END IF;
  IF v_submission IS NOT NULL AND v_submission !~ '^[A-Za-z0-9_-]{8,80}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'The submission id must be 8 to 80 plain letters.');
  END IF;
  IF v_level = 'reasoning_trace' AND length(trim(coalesce(p_body->>'reasoning', ''))) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Needs the pasted note.');
  END IF;

  v_summary := bootstrap_os.redact_feedback_text(trim(p_body->>'summary'), v_email);
  v_fp := bootstrap_os.feedback_fingerprint(v_tool, v_kind, v_summary, v_actor);

  SELECT id INTO v_existing
  FROM bootstrap_os.feedback
  WHERE actor_id = v_actor
    AND created_at > now() - interval '24 hours'
    AND (
      (v_submission IS NOT NULL AND submission_id = v_submission)
      OR fingerprint = v_fp
    )
  ORDER BY created_at DESC
  LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'id', v_existing,
      'line', 'Already filed ' || v_existing || '. A person reads it.',
      'duplicate', true
    );
  END IF;

  v_id := 'fb_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16);
  INSERT INTO bootstrap_os.feedback (
    id, product, actor_id, tenant_id, kind, summary, expected, actual, tool, severity,
    intent_context, context_level, plugin_version, skill_version, bot_id, request_id,
    submission_id, client_name, client_version, server_version, deploy_sha, protocol_version,
    http_user_agent, fingerprint
  ) VALUES (
    v_id,
    'bootstrap-os',
    v_actor,
    v_actor,
    v_kind,
    v_summary,
    NULLIF(bootstrap_os.redact_feedback_text(trim(coalesce(p_body->>'expected', '')), v_email), ''),
    NULLIF(bootstrap_os.redact_feedback_text(trim(coalesce(p_body->>'actual', '')), v_email), ''),
    v_tool,
    v_severity,
    NULLIF(bootstrap_os.redact_feedback_text(trim(coalesce(p_body->>'intent_context', '')), v_email), ''),
    v_level,
    NULLIF(left(trim(coalesce(p_body->>'plugin_version', '')), 80), ''),
    NULLIF(left(trim(coalesce(p_body->>'skill_version', '')), 80), ''),
    NULLIF(left(trim(coalesce(p_body->>'bot_id', '')), 80), ''),
    NULLIF(left(trim(coalesce(p_body->>'request_id', '')), 80), ''),
    v_submission,
    NULLIF(left(trim(coalesce(p_body->>'client_name', '')), 80), ''),
    NULLIF(left(trim(coalesce(p_body->>'client_version', '')), 80), ''),
    NULLIF(left(trim(coalesce(p_body->>'server_version', '')), 40), ''),
    NULLIF(left(trim(coalesce(p_body->>'deploy_sha', '')), 80), ''),
    NULLIF(left(trim(coalesce(p_body->>'protocol_version', '')), 40), ''),
    NULLIF(left(trim(coalesce(p_body->>'http_user_agent', '')), 200), ''),
    v_fp
  );
  INSERT INTO bootstrap_os.feedback_status (feedback_id, status, cluster_id)
  VALUES (v_id, 'new', v_fp);

  IF v_level IN ('tool_trace', 'reasoning_trace') THEN
    v_keys := CASE WHEN jsonb_typeof(p_body->'argument_keys') = 'array' THEN p_body->'argument_keys' ELSE '[]'::jsonb END;
    v_reasoning := NULLIF(bootstrap_os.redact_feedback_text(trim(coalesce(p_body->>'reasoning', '')), v_email), '');
    INSERT INTO bootstrap_os.feedback_blob (feedback_id, body, expires_at)
    VALUES (
      v_id,
      jsonb_strip_nulls(jsonb_build_object(
        'argumentKeys', v_keys,
        'errorCode', NULLIF(left(trim(coalesce(p_body->>'error_code', '')), 80), ''),
        'latencyMs', CASE WHEN (p_body->>'latency_ms') ~ '^[0-9]+$' THEN (p_body->>'latency_ms')::int ELSE NULL END,
        'reasoning', v_reasoning
      )),
      now() + interval '30 days'
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_id,
    'line', 'Filed ' || v_id || '. A person reads it.',
    'duplicate', false
  );
END;
$$;


DROP FUNCTION IF EXISTS bootstrap_os.feedback_fingerprint(text, text, text);

CREATE OR REPLACE FUNCTION public.bootstrap_os_list_feedback(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, bootstrap_os
AS $$
DECLARE
  v_gate jsonb;
  v_limit integer;
  v_rows jsonb;
BEGIN
  v_gate := public.bootstrap_os_admin_gate();
  IF COALESCE(v_gate->>'ok', '') IS DISTINCT FROM 'true' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'A super admin reads this list.');
  END IF;
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT f.id, f.created_at, f.kind, f.severity, COALESCE(s.status, 'new') AS status, f.summary
    FROM bootstrap_os.feedback f
    LEFT JOIN bootstrap_os.feedback_status s ON s.feedback_id = f.id
    ORDER BY f.created_at DESC
    LIMIT v_limit
  ) t;
  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_os_submit_feedback(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bootstrap_os_list_feedback(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION bootstrap_os.redact_feedback_text(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION bootstrap_os.feedback_fingerprint(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_submit_feedback(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_list_feedback(integer) TO authenticated;

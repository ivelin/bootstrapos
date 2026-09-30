-- submit_feedback: append-only ticket. Actor comes from auth.jwt(), never from the body.
-- No UPDATE of the payload. No DELETE. Mail is not sent here.
-- Cos applies on supabase-pirin-ai. PR agents: PGlite / file lock only.
-- Do not migrate/seed/live-probe supabase-pirin-ai from a PR cloud agent.

CREATE SCHEMA IF NOT EXISTS bootstrap_os;

CREATE TABLE IF NOT EXISTS bootstrap_os.feedback (
  id text PRIMARY KEY,
  product text NOT NULL DEFAULT 'bootstrap-os',
  actor_id text NOT NULL,
  tenant_id text NOT NULL,
  kind text NOT NULL,
  summary text NOT NULL,
  expected text,
  actual text,
  tool text,
  severity text NOT NULL DEFAULT 'annoying',
  intent_context text,
  context_level text NOT NULL DEFAULT 'identity_only',
  plugin_version text,
  skill_version text,
  bot_id text,
  request_id text,
  submission_id text,
  client_name text,
  client_version text,
  server_version text,
  deploy_sha text,
  protocol_version text,
  http_user_agent text,
  fingerprint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bootstrap_os.feedback_status (
  feedback_id text PRIMARY KEY REFERENCES bootstrap_os.feedback(id),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'seen', 'clustered', 'shipped', 'wontfix')),
  cluster_id text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bootstrap_os.feedback_blob (
  feedback_id text PRIMARY KEY REFERENCES bootstrap_os.feedback(id),
  body jsonb NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS feedback_actor_fingerprint_idx
  ON bootstrap_os.feedback (actor_id, fingerprint, created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_actor_submission_idx
  ON bootstrap_os.feedback (actor_id, submission_id, created_at DESC);

CREATE OR REPLACE FUNCTION bootstrap_os.redact_feedback_text(p_text text, p_actor_email text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  out text := COALESCE(p_text, '');
  matches text[];
  one text;
BEGIN
  out := regexp_replace(out, 'Bearer[[:space:]]+[^[:space:]]+', '[redacted]', 'gi');
  out := regexp_replace(out, '(sk|pk|rk|bos)_[A-Za-z0-9_]{8,}', '[redacted]', 'gi');
  out := regexp_replace(out, '(postgres|postgresql|mysql|mongodb)(\+[a-z]+)?://[^[:space:]]+', '[redacted]', 'gi');
  out := regexp_replace(out, 'eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}', '[redacted]', 'g');
  out := regexp_replace(out, 'Cookie:[[:space:]]*[^[:space:]]+', '[redacted]', 'gi');
  out := regexp_replace(out, '\+?[0-9][0-9[:space:].()-]{8,}[0-9]', '[redacted]', 'g');
  matches := ARRAY(
    SELECT m[1] FROM regexp_matches(
      out,
      '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}',
      'gi'
    ) AS m
  );
  IF matches IS NOT NULL THEN
    FOREACH one IN ARRAY matches LOOP
      IF p_actor_email IS NULL OR lower(one) <> lower(p_actor_email) THEN
        out := replace(out, one, '[redacted]');
      END IF;
    END LOOP;
  END IF;
  RETURN left(out, 32000);
END;
$$;

CREATE OR REPLACE FUNCTION bootstrap_os.feedback_fingerprint(p_tool text, p_kind text, p_summary text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT md5(
    'bootstrap-os' || E'\n' ||
    coalesce(nullif(trim(p_tool), ''), '') || E'\n' ||
    coalesce(p_kind, '') || E'\n' ||
    left(lower(regexp_replace(trim(coalesce(p_summary, '')), '[[:space:]]+', ' ', 'g')), 80)
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
  v_fp := bootstrap_os.feedback_fingerprint(v_tool, v_kind, v_summary);

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

ALTER TABLE bootstrap_os.feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE bootstrap_os.feedback FORCE ROW LEVEL SECURITY;
ALTER TABLE bootstrap_os.feedback_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE bootstrap_os.feedback_status FORCE ROW LEVEL SECURITY;
ALTER TABLE bootstrap_os.feedback_blob ENABLE ROW LEVEL SECURITY;
ALTER TABLE bootstrap_os.feedback_blob FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS feedback_select_own ON bootstrap_os.feedback;
CREATE POLICY feedback_select_own ON bootstrap_os.feedback
  FOR SELECT TO authenticated
  USING (
    actor_id = COALESCE(NULLIF(auth.jwt() ->> 'sub', ''), NULLIF(lower(auth.jwt() ->> 'email'), ''))
  );

DROP POLICY IF EXISTS feedback_status_select_own ON bootstrap_os.feedback_status;
CREATE POLICY feedback_status_select_own ON bootstrap_os.feedback_status
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM bootstrap_os.feedback f
      WHERE f.id = feedback_id
        AND f.actor_id = COALESCE(NULLIF(auth.jwt() ->> 'sub', ''), NULLIF(lower(auth.jwt() ->> 'email'), ''))
    )
  );

DROP POLICY IF EXISTS feedback_blob_select_own ON bootstrap_os.feedback_blob;
CREATE POLICY feedback_blob_select_own ON bootstrap_os.feedback_blob
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM bootstrap_os.feedback f
      WHERE f.id = feedback_id
        AND f.actor_id = COALESCE(NULLIF(auth.jwt() ->> 'sub', ''), NULLIF(lower(auth.jwt() ->> 'email'), ''))
    )
  );

REVOKE ALL ON bootstrap_os.feedback FROM PUBLIC, anon, authenticated;
REVOKE ALL ON bootstrap_os.feedback_status FROM PUBLIC, anon, authenticated;
REVOKE ALL ON bootstrap_os.feedback_blob FROM PUBLIC, anon, authenticated;
GRANT SELECT ON bootstrap_os.feedback TO authenticated;
GRANT SELECT ON bootstrap_os.feedback_status TO authenticated;
GRANT SELECT ON bootstrap_os.feedback_blob TO authenticated;
REVOKE ALL ON FUNCTION public.bootstrap_os_submit_feedback(jsonb) FROM PUBLIC;
GRANT USAGE ON SCHEMA bootstrap_os TO authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_submit_feedback(jsonb) TO authenticated;

-- Founder sign-in invite when a new board is created for a different email.
-- Cos applies on supabase-pirin-ai. PR agents: PGlite/pg16 only. Do not apply from a PR agent.
-- Same insert shape as bootstrap_mcp_invite_member. Token is hashed on bootstrap_mcp_invites.
-- The email outbox row carries the token for the mailer, matching invite_member. in_chat does not.
-- Existing boards and same-email create do not mint or mail. emailQueued stays the subscriber counter.

BEGIN;

ALTER TABLE public.bootstrap_mcp_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bootstrap_mcp_invites FORCE ROW LEVEL SECURITY;
ALTER TABLE public.bootstrap_mcp_invite_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bootstrap_mcp_invite_outbox FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.bootstrap_mcp_invites FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.bootstrap_mcp_invite_outbox FROM PUBLIC, anon, authenticated;

-- Reason code only. Never an email or a token. Read and deleted by put_journey.
CREATE TABLE IF NOT EXISTS bootstrap_os.founder_invite_skip (
  board_id uuid PRIMARY KEY,
  reason text NOT NULL,
  CONSTRAINT founder_invite_skip_reason CHECK (
    reason IN ('inviter_not_on_allowlist', 'rate_limited', 'rate_limiter_unavailable')
  )
);
ALTER TABLE bootstrap_os.founder_invite_skip ENABLE ROW LEVEL SECURITY;
ALTER TABLE bootstrap_os.founder_invite_skip FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE bootstrap_os.founder_invite_skip FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION bootstrap_os.ensure_company_for_actor(
  p_company text,
  p_founder_email text DEFAULT NULL,
  p_create boolean DEFAULT false,
  OUT company_id uuid,
  OUT created boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, bootstrap_os, public
AS $$
DECLARE
  v_slug text := lower(p_company);
  caller_email text := NULLIF(lower(trim(auth.jwt() ->> 'email')), '');
  v_founder text := nullif(lower(trim(p_founder_email)), '');
  v_super boolean := false;
  inviter_id uuid;
  pending_id uuid;
  raw_token text;
  invite_id uuid;
  v_rate jsonb;
  skip_reason text;
  skip_company uuid;
  outbox_id uuid;
  mail_id uuid;
  expires timestamptz;
  signup_url text;
  card jsonb;
  outbox_payload jsonb;
  mail_payload jsonb;
BEGIN
  created := false;
  PERFORM pg_advisory_xact_lock(hashtext('bootstrap_os.company:' || v_slug));
  SELECT c.id INTO company_id FROM bootstrap_os.companies c WHERE c.slug = v_slug;
  IF company_id IS NULL AND p_create IS NOT TRUE THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  IF company_id IS NULL THEN
    IF v_founder IS NOT NULL AND v_founder !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
      RAISE EXCEPTION 'invalid_founder_email';
    END IF;
    IF caller_email IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.bootstrap_os_roles r
        JOIN public.bootstrap_mcp_mentees m ON m.id = r.mentee_id
        WHERE m.email = caller_email
          AND r.role = 'super_admin'
          AND r.revoked_at IS NULL
      ) INTO v_super;
    END IF;
    IF v_founder IS NULL AND v_super THEN
      RAISE EXCEPTION 'founder_email_required: pass founderEmail';
    END IF;
    INSERT INTO bootstrap_os.companies (slug, label) VALUES (v_slug, v_slug)
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO company_id;
    IF company_id IS NOT NULL THEN
      created := true;
      INSERT INTO bootstrap_os.ideas (company_id, slug, name, journey_phase, loop_stage, current_gate, scoreboard)
      VALUES (company_id, 'default', v_slug, 1, 1, 'hold',
        jsonb_build_object('schema_version', 1, 'readyForHumanEyes', jsonb_build_object('status', 'unknown'),
          'autonomyPosture', 'strict', 'openQuestions', '[]'::jsonb, 'constraint_this_week', ''));
      IF v_founder IS NULL OR v_founder = caller_email THEN
        PERFORM public.bootstrap_os_grant_acl_internal(company_id, caller_email, 'founder');
      ELSE
        IF caller_email IS NOT NULL AND v_founder IS DISTINCT FROM caller_email THEN
          -- Allowlist is the mentee row, same gate as invite_member. Checked before grant_acl inserts one.
          SELECT m.id INTO inviter_id
          FROM public.bootstrap_mcp_mentees m
          WHERE m.email = caller_email
          LIMIT 1;
          IF inviter_id IS NULL THEN
            skip_reason := 'inviter_not_on_allowlist';
          ELSE
            BEGIN
              v_rate := public.bootstrap_hosted_take('invite_member');
            EXCEPTION WHEN OTHERS THEN
              skip_reason := 'rate_limiter_unavailable';
            END;
            IF skip_reason IS NULL AND coalesce((v_rate ->> 'ok')::boolean, false) IS DISTINCT FROM true THEN
              skip_reason := CASE
                WHEN coalesce(v_rate ->> 'error', v_rate ->> 'reason', '') IN ('rate_limited', 'rate_limiter_unavailable')
                  THEN coalesce(v_rate ->> 'error', v_rate ->> 'reason')
                ELSE 'rate_limiter_unavailable'
              END;
            END IF;
          END IF;
        END IF;
        PERFORM public.bootstrap_os_grant_acl_internal(company_id, v_founder, 'founder');
        PERFORM public.bootstrap_os_grant_acl_internal(company_id, caller_email, 'commenter');
        IF caller_email IS NOT NULL AND v_founder IS DISTINCT FROM caller_email THEN
        IF skip_reason IS NOT NULL THEN
            skip_company := company_id;
            INSERT INTO bootstrap_os.founder_invite_skip (board_id, reason)
            VALUES (skip_company, skip_reason)
            ON CONFLICT (board_id) DO UPDATE SET reason = EXCLUDED.reason;
          ELSE
            raw_token := 'inv_' || encode(extensions.gen_random_bytes(24), 'hex');
            expires := now() + interval '7 days';
            outbox_id := gen_random_uuid();
            mail_id := gen_random_uuid();
            signup_url := 'https://pirin.ai/bootstrap-os/login?invite=' || raw_token;
            SELECT i.id INTO pending_id
            FROM public.bootstrap_mcp_invites i
            WHERE i.invitee_email = v_founder
              AND i.company_label = v_slug
              AND i.accepted_at IS NULL
            ORDER BY i.created_at DESC
            LIMIT 1;
            IF pending_id IS NOT NULL THEN
              invite_id := pending_id;
              UPDATE public.bootstrap_mcp_invites
              SET token_hash = public.bootstrap_mcp_hash_token(raw_token),
                  expires_at = expires,
                  invited_by_mentee_id = inviter_id,
                  invited_by_email = caller_email
              WHERE id = invite_id
                AND accepted_at IS NULL;
            ELSE
              invite_id := gen_random_uuid();
              INSERT INTO public.bootstrap_mcp_invites (
                id, invitee_email, company_label, invited_by_mentee_id, invited_by_email, token_hash, expires_at
              ) VALUES (
                invite_id, v_founder, v_slug, inviter_id, caller_email, public.bootstrap_mcp_hash_token(raw_token), expires
              );
            END IF;
            card := jsonb_build_object(
              'card', 'accept_invite',
              'shape', 'DraftExternalMessage',
              'from', jsonb_build_object('email', caller_email),
              'to', jsonb_build_object('email', v_founder),
              'companyWorkspace', v_slug,
              'action', 'Accept',
              'inviteToken', raw_token,
              'expiresAt', expires,
              'tool', 'accept_invite',
              'note', 'Optional Accept card for MCP clients that render tool results. Login URL is the universal path. Mail (bootstrap@) carries the same token. JWT email must match.'
            );
            outbox_payload := card - 'inviteToken';
            outbox_payload := outbox_payload || jsonb_build_object(
              'inviteToken', null,
              'note', 'In-chat Accept. Raw invite token is not stored on this channel.'
            );
            mail_payload := jsonb_build_object(
              'channel', 'email',
              'mailFrom', 'bootstrap@pirin.ai',
              'from', jsonb_build_object('email', caller_email),
              'to', jsonb_build_object('email', v_founder),
              'companyWorkspace', v_slug,
              'signupUrl', signup_url,
              'qrPayload', signup_url,
              'inviteToken', raw_token,
              'expiresAt', expires,
              'note', 'Mailer handoff. pirin-ai Resend From bootstrap@pirin.ai only. Token is on this channel so the poller can send ?invite=. in_chat never stores the token. Cos yes before prod send.'
            );
            INSERT INTO public.bootstrap_mcp_invite_outbox (id, invite_id, channel, payload)
            VALUES (outbox_id, invite_id, 'in_chat', outbox_payload);
            INSERT INTO public.bootstrap_mcp_invite_outbox (id, invite_id, channel, payload)
            VALUES (mail_id, invite_id, 'email', mail_payload);
          END IF;
        END IF;
      END IF;
    ELSE
      SELECT c.id INTO company_id FROM bootstrap_os.companies c WHERE c.slug = v_slug;
      IF NOT public.bootstrap_os_held_label(v_slug) THEN
        RAISE EXCEPTION 'company not visible';
      END IF;
    END IF;
  ELSE
    IF NOT public.bootstrap_os_held_label(v_slug) THEN
      RAISE EXCEPTION 'company not visible';
    END IF;
  END IF;
END;
$$;
CREATE OR REPLACE FUNCTION public.bootstrap_os_put_journey(
  p_company text, p_idea text, p_why text, p_founder_yes boolean,
  p_journey_phase int DEFAULT NULL, p_loop_stage int DEFAULT NULL,
  p_current_gate text DEFAULT NULL, p_constraint text DEFAULT NULL,
  p_founder_written_decision text DEFAULT NULL,
  p_scoreboard jsonb DEFAULT NULL,
  p_founder text DEFAULT NULL,
  p_founder_email text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, bootstrap_os AS $$
DECLARE
  cid uuid;
  idea_row bootstrap_os.ideas%ROWTYPE;
  email text := NULLIF(lower(auth.jwt() ->> 'email'), '');
  board jsonb;
  bundle jsonb;
  gate_enr jsonb;
  kill_pm jsonb;
  need_gate boolean;
  live_n int;
  old_score jsonb;
  incoming_score jsonb;
  stamped jsonb;
  journey_or_gate boolean;
  v_created boolean := false;
  v_invite jsonb;
  v_skip text;
BEGIN
  IF nullif(trim(coalesce(p_why, '')), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'why required');
  END IF;
  SELECT r.company_id, r.created INTO cid, v_created
  FROM bootstrap_os.ensure_company_for_actor(p_company, p_founder_email, true) AS r;
  IF NOT v_created AND NOT bootstrap_os.has_rank(cid, 3) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_role', 'message', 'Your role on this board can comment, but not edit. Ask the founder to invite you to edit.');
  END IF;
  SELECT * INTO idea_row FROM bootstrap_os.ideas
  WHERE company_id = cid AND slug = lower(coalesce(nullif(p_idea, ''), 'default'));
  IF idea_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'idea not found; call create_idea first');
  END IF;
  IF p_scoreboard IS NOT NULL AND jsonb_typeof(p_scoreboard) = 'object'
     AND (p_scoreboard ? 'loopSpoken' OR p_scoreboard ? 'loopWeek' OR p_scoreboard ? 'spokenLoop' OR p_scoreboard ? 'weekVerb') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'spoken Ask/Do/Write back are not card fields — loop is a quality bar, not where-we-are');
  END IF;
  IF p_loop_stage IS NOT NULL AND p_loop_stage IS DISTINCT FROM idea_row.loop_stage THEN
    RETURN jsonb_build_object('ok', false, 'error', 'loopStage mutations are rejected — Ask/Do/Write back is a quality bar, not a stored week verb');
  END IF;
  journey_or_gate := p_current_gate IS NOT NULL OR p_journey_phase IS NOT NULL;
  IF journey_or_gate AND p_founder_yes IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'founder yes required in the agent chat');
  END IF;
  old_score := idea_row.scoreboard->'portfolioScore';
  need_gate := journey_or_gate;
  PERFORM set_config('app.client', 'mcp', true);
  PERFORM set_config('app.notify_summary', left(coalesce(p_why, 'board write'), 280), true);
  IF p_journey_phase IS NOT NULL THEN idea_row.journey_phase := p_journey_phase; END IF;
  IF p_current_gate IS NOT NULL THEN idea_row.current_gate := p_current_gate::bootstrap_os.gate_decision; END IF;
  IF p_scoreboard IS NOT NULL AND jsonb_typeof(p_scoreboard) = 'object' THEN
    IF p_scoreboard ? 'portfolioScore' THEN
      incoming_score := p_scoreboard->'portfolioScore';
      IF incoming_score IS NOT NULL
         AND jsonb_typeof(incoming_score) = 'object'
         AND bootstrap_os.portfolio_score_error(incoming_score) IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', bootstrap_os.portfolio_score_error(incoming_score));
      END IF;
    END IF;
    idea_row.scoreboard := coalesce(idea_row.scoreboard, '{}'::jsonb) || (p_scoreboard - 'owner' - 'owners' - 'ownerName' - 'ownerEmail');
  END IF;
  IF p_constraint IS NOT NULL THEN
    idea_row.scoreboard := jsonb_set(coalesce(idea_row.scoreboard, '{}'::jsonb), '{constraint_this_week}', to_jsonb(left(p_constraint, 280)));
  END IF;
  IF need_gate THEN
    gate_enr := bootstrap_os.normalize_gate_enrichment(idea_row.scoreboard);
    IF gate_enr IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'gate requires whatChanged and whatWereNotDoing');
    END IF;
    idea_row.scoreboard := jsonb_set(coalesce(idea_row.scoreboard, '{}'::jsonb), '{gateEnrichment}', gate_enr);
  END IF;
  IF p_current_gate = 'kill' THEN
    kill_pm := bootstrap_os.normalize_kill_postmortem(idea_row.scoreboard, p_why);
    IF kill_pm IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'kill requires lessonsLearned and actionableInsights');
    END IF;
    idea_row.scoreboard := jsonb_set(coalesce(idea_row.scoreboard, '{}'::jsonb), '{killPostmortem}', kill_pm);
  END IF;
  IF incoming_score IS NOT NULL AND jsonb_typeof(incoming_score) = 'object' THEN
    SELECT count(*)::int INTO live_n
    FROM bootstrap_os.ideas
    WHERE company_id = cid AND id <> idea_row.id AND current_gate <> 'kill';
    IF idea_row.current_gate <> 'kill' THEN
      live_n := live_n + 1;
    END IF;
    IF idea_row.current_gate = 'kill' OR live_n < 2 THEN
      IF old_score IS NOT NULL THEN
        idea_row.scoreboard := jsonb_set(coalesce(idea_row.scoreboard, '{}'::jsonb), '{portfolioScore}', old_score);
      ELSE
        idea_row.scoreboard := coalesce(idea_row.scoreboard, '{}'::jsonb) - 'portfolioScore';
      END IF;
    ELSE
      stamped := bootstrap_os.normalize_portfolio_score(incoming_score, coalesce(email, 'unknown'), now());
      idea_row.scoreboard := jsonb_set(coalesce(idea_row.scoreboard, '{}'::jsonb), '{portfolioScore}', stamped);
    END IF;
  ELSIF old_score IS NOT NULL AND (idea_row.scoreboard->'portfolioScore') IS NULL THEN
    idea_row.scoreboard := jsonb_set(coalesce(idea_row.scoreboard, '{}'::jsonb), '{portfolioScore}', old_score);
  END IF;
  IF jsonb_typeof(idea_row.scoreboard->'initiatives') = 'array'
     AND jsonb_array_length(idea_row.scoreboard->'initiatives') > 0 THEN
    idea_row.scoreboard := idea_row.scoreboard - 'progress' - 'supporting' - 'engagements';
  END IF;
  IF p_founder IS NOT NULL THEN
    UPDATE bootstrap_os.companies
    SET founder = nullif(left(btrim(p_founder), 80), '')
    WHERE id = cid;
  END IF;
  UPDATE bootstrap_os.ideas SET journey_phase = idea_row.journey_phase, loop_stage = idea_row.loop_stage,
    current_gate = idea_row.current_gate, scoreboard = idea_row.scoreboard, updated_at = now() WHERE id = idea_row.id;
  IF need_gate THEN
    INSERT INTO bootstrap_os.gate_events (idea_id, action, why, who)
    VALUES (idea_row.id, idea_row.current_gate, p_why, coalesce(email, 'unknown'));
  END IF;
  board := public.bootstrap_os_get_journey(p_company, idea_row.slug);
  bundle := bootstrap_os.notify_bundle(cid, idea_row.id, 'put_journey');
  IF v_created THEN
    SELECT s.reason INTO v_skip
    FROM bootstrap_os.founder_invite_skip s
    WHERE s.board_id = cid;
    DELETE FROM bootstrap_os.founder_invite_skip WHERE board_id = cid;
    IF v_skip IS NOT NULL AND v_skip NOT IN ('inviter_not_on_allowlist', 'rate_limited', 'rate_limiter_unavailable') THEN
      v_skip := NULL;
    END IF;
    SELECT jsonb_build_object(
      'inviteeEmail', o.payload #>> '{to,email}',
      'inviterEmail', o.payload #>> '{from,email}',
      'companyWorkspace', o.payload ->> 'companyWorkspace',
      'inviteToken', o.payload ->> 'inviteToken'
    )
    INTO v_invite
    FROM public.bootstrap_mcp_invite_outbox o
    JOIN public.bootstrap_mcp_invites i ON i.id = o.invite_id
    WHERE i.company_label = lower(p_company)
      AND o.channel = 'email'
      AND o.id = (
        SELECT o2.id
        FROM public.bootstrap_mcp_invite_outbox o2
        JOIN public.bootstrap_mcp_invites i2 ON i2.id = o2.invite_id
        WHERE i2.company_label = lower(p_company)
          AND o2.channel = 'email'
        ORDER BY o2.created_at DESC
        LIMIT 1
      );
  END IF;
  RETURN board || bundle || CASE
    WHEN v_invite IS NOT NULL AND v_invite ->> 'inviteToken' IS NOT NULL THEN jsonb_build_object('founderInvite', v_invite)
    WHEN v_skip IS NOT NULL THEN jsonb_build_object('founderInvite', jsonb_build_object('skipped', true, 'reason', v_skip))
    ELSE '{}'::jsonb
  END;
END;
$$;

REVOKE ALL ON FUNCTION bootstrap_os.ensure_company_for_actor(text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bootstrap_os_put_journey(text, text, text, boolean, int, int, text, text, text, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_put_journey(text, text, text, boolean, int, int, text, text, text, jsonb, text, text) TO authenticated;

COMMIT;

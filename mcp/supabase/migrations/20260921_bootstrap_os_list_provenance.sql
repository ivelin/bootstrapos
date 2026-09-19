-- Provenance: reconstructible before/after on audit_events + list_provenance.
-- All-gate enrichment: why + whatChanged + whatWereNotDoing; optional evidenceLinks.
-- Kill REQUIRES postmortem: why + lessonsLearned + actionableInsights. Reject silent kill.
-- Killed ideas stay readable. Never invent a postmortem on read.
-- Cos applies on supabase-pirin-ai. PR agents: PGlite / file lock only.
-- Do not migrate/seed/live-probe supabase-pirin-ai from a PR cloud agent.

CREATE OR REPLACE FUNCTION bootstrap_os.idea_board_snapshot(
  p_phase smallint,
  p_loop smallint,
  p_gate bootstrap_os.gate_decision,
  p_scoreboard jsonb
) RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'clocks', jsonb_build_object(
      'journeyPhase', p_phase,
      'loopStage', p_loop,
      'currentGate', p_gate
    ),
    'scoreboard', coalesce(p_scoreboard, '{}'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION bootstrap_os.normalize_evidence_links(p_links jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN jsonb_typeof(p_links) = 'array' THEN (
      SELECT coalesce(jsonb_agg(to_jsonb(left(elem, 2048)) ORDER BY n), '[]'::jsonb)
      FROM (
        SELECT value #>> '{}' AS elem, ordinality AS n
        FROM jsonb_array_elements(p_links) WITH ORDINALITY
        WHERE jsonb_typeof(value) = 'string'
          AND length(trim(value #>> '{}')) > 0
        LIMIT 8
      ) t
    )
    ELSE '[]'::jsonb
  END;
$$;

CREATE OR REPLACE FUNCTION bootstrap_os.normalize_gate_enrichment(p_scoreboard jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  src jsonb;
  changed text;
  not_doing text;
  links jsonb;
BEGIN
  IF p_scoreboard IS NULL OR jsonb_typeof(p_scoreboard) <> 'object' THEN
    RETURN NULL;
  END IF;
  src := p_scoreboard->'gateEnrichment';
  IF src IS NULL OR jsonb_typeof(src) <> 'object' THEN
    src := '{}'::jsonb;
  END IF;
  changed := nullif(trim(coalesce(src->>'whatChanged', p_scoreboard->>'whatChanged', '')), '');
  not_doing := nullif(trim(coalesce(src->>'whatWereNotDoing', p_scoreboard->>'whatWereNotDoing', '')), '');
  IF changed IS NULL OR not_doing IS NULL THEN
    RETURN NULL;
  END IF;
  links := bootstrap_os.normalize_evidence_links(
    coalesce(src->'evidenceLinks', p_scoreboard->'evidenceLinks')
  );
  RETURN jsonb_strip_nulls(jsonb_build_object(
    'whatChanged', left(changed, 280),
    'whatWereNotDoing', left(not_doing, 280),
    'evidenceLinks', NULLIF(links, '[]'::jsonb)
  ));
END;
$$;

CREATE OR REPLACE FUNCTION bootstrap_os.normalize_kill_postmortem(p_scoreboard jsonb, p_why text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  src jsonb;
  gate jsonb;
  learned text;
  insights text;
  why text;
  links jsonb;
BEGIN
  IF p_scoreboard IS NULL OR jsonb_typeof(p_scoreboard) <> 'object' THEN
    RETURN NULL;
  END IF;
  src := p_scoreboard->'killPostmortem';
  IF src IS NULL OR jsonb_typeof(src) <> 'object' THEN
    src := '{}'::jsonb;
  END IF;
  gate := p_scoreboard->'gateEnrichment';
  IF gate IS NULL OR jsonb_typeof(gate) <> 'object' THEN
    gate := '{}'::jsonb;
  END IF;
  why := nullif(trim(coalesce(src->>'why', p_why, '')), '');
  learned := nullif(trim(coalesce(
    src->>'lessonsLearned',
    p_scoreboard->>'lessonsLearned',
    ''
  )), '');
  insights := nullif(trim(coalesce(
    src->>'actionableInsights',
    p_scoreboard->>'actionableInsights',
    ''
  )), '');
  IF why IS NULL OR learned IS NULL OR insights IS NULL THEN
    RETURN NULL;
  END IF;
  links := bootstrap_os.normalize_evidence_links(
    coalesce(src->'evidenceLinks', gate->'evidenceLinks', p_scoreboard->'evidenceLinks')
  );
  RETURN jsonb_strip_nulls(jsonb_build_object(
    'why', left(why, 280),
    'lessonsLearned', left(learned, 280),
    'actionableInsights', left(insights, 280),
    'evidenceLinks', NULLIF(links, '[]'::jsonb)
  ));
END;
$$;

CREATE OR REPLACE FUNCTION bootstrap_os.audit_idea_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bootstrap_os, public
AS $$
BEGIN
  -- Single put_journey audit. RPC no longer emit_audit after UPDATE.
  PERFORM bootstrap_os.emit_audit(
    NEW.company_id,
    NEW.id,
    COALESCE(bootstrap_os.actor_principal(), NEW.name),
    COALESCE(NULLIF(current_setting('app.client', true), ''), 'put_journey'),
    jsonb_strip_nulls(jsonb_build_object(
      'via', 'put_journey',
      'op', 'put_journey',
      'journey_phase', NEW.journey_phase,
      'loop_stage', NEW.loop_stage,
      'current_gate', NEW.current_gate,
      'constraint_this_week', COALESCE(NEW.scoreboard->>'constraint_this_week', ''),
      'gate', NEW.current_gate,
      'why', NULLIF(current_setting('app.notify_summary', true), ''),
      'whatChanged', NEW.scoreboard #>> '{gateEnrichment,whatChanged}',
      'whatWereNotDoing', NEW.scoreboard #>> '{gateEnrichment,whatWereNotDoing}',
      'evidenceLinks', NEW.scoreboard #> '{gateEnrichment,evidenceLinks}',
      'lessonsLearned', NEW.scoreboard #>> '{killPostmortem,lessonsLearned}',
      'actionableInsights', NEW.scoreboard #>> '{killPostmortem,actionableInsights}',
      'before', bootstrap_os.idea_board_snapshot(
        OLD.journey_phase, OLD.loop_stage, OLD.current_gate, OLD.scoreboard
      ),
      'after', bootstrap_os.idea_board_snapshot(
        NEW.journey_phase, NEW.loop_stage, NEW.current_gate, NEW.scoreboard
      )
    ))
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

DROP TRIGGER IF EXISTS ideas_audit_write ON bootstrap_os.ideas;
CREATE TRIGGER ideas_audit_write
  AFTER UPDATE ON bootstrap_os.ideas
  FOR EACH ROW
  EXECUTE FUNCTION bootstrap_os.audit_idea_write();

CREATE OR REPLACE FUNCTION bootstrap_os.audit_comment_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bootstrap_os, public
AS $$
DECLARE
  idea_row bootstrap_os.ideas%ROWTYPE;
  snap jsonb;
BEGIN
  SELECT * INTO idea_row FROM bootstrap_os.ideas WHERE id = NEW.idea_id;
  snap := bootstrap_os.idea_board_snapshot(
    idea_row.journey_phase, idea_row.loop_stage, idea_row.current_gate, idea_row.scoreboard
  );
  PERFORM bootstrap_os.emit_audit(
    bootstrap_os.idea_company_id(NEW.idea_id),
    NEW.idea_id,
    NEW.who,
    COALESCE(NULLIF(current_setting('app.client', true), ''), 'post_comment'),
    jsonb_build_object(
      'via', 'post_comment',
      'op', 'post_comment',
      'comment_id', NEW.id,
      'before', snap,
      'after', snap
    )
  );
  PERFORM bootstrap_os.enqueue_board_notify(
    bootstrap_os.idea_company_id(NEW.idea_id),
    NEW.idea_id,
    'post_comment',
    NEW.who,
    left(NEW.body, 80)
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION bootstrap_os.audit_acl_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bootstrap_os, public
AS $$
DECLARE
  cid uuid;
BEGIN
  cid := COALESCE(NEW.company_id, OLD.company_id);
  PERFORM bootstrap_os.emit_audit(
    cid,
    NULL,
    COALESCE(bootstrap_os.actor_principal(), 'acl'),
    COALESCE(NULLIF(current_setting('app.client', true), ''), 'acl'),
    jsonb_build_object(
      'via', 'acl',
      'op', TG_OP,
      'principal_kind', COALESCE(NEW.principal_kind, OLD.principal_kind),
      'role', COALESCE(NEW.role, OLD.role),
      'before', CASE
        WHEN TG_OP = 'INSERT' THEN NULL
        ELSE jsonb_build_object(
          'principal', OLD.principal,
          'principalKind', OLD.principal_kind,
          'role', OLD.role
        )
      END,
      'after', CASE
        WHEN TG_OP = 'DELETE' THEN NULL
        ELSE jsonb_build_object(
          'principal', NEW.principal,
          'principalKind', NEW.principal_kind,
          'role', NEW.role
        )
      END
    )
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION bootstrap_os.audit_subscriber_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bootstrap_os, public
AS $$
DECLARE
  via text := CASE WHEN TG_OP = 'DELETE' THEN 'unsubscribe_board' ELSE 'subscribe_board' END;
BEGIN
  PERFORM bootstrap_os.emit_audit(
    COALESCE(NEW.company_id, OLD.company_id),
    COALESCE(NEW.idea_id, OLD.idea_id),
    COALESCE(
      bootstrap_os.actor_principal(),
      COALESCE(NEW.created_by, OLD.created_by, via)
    ),
    COALESCE(NULLIF(current_setting('app.client', true), ''), via),
    jsonb_build_object(
      'via', via,
      'op', TG_OP,
      -- webhookUrl stays on list_subscribers. Do not archive it in provenance.
      'before', CASE
        WHEN TG_OP = 'INSERT' THEN NULL
        ELSE jsonb_build_object(
          'principal', OLD.principal,
          'principalKind', OLD.principal_kind,
          'emailOptIn', OLD.email_opt_in,
          'ideaId', OLD.idea_id
        )
      END,
      'after', CASE
        WHEN TG_OP = 'DELETE' THEN NULL
        ELSE jsonb_build_object(
          'principal', NEW.principal,
          'principalKind', NEW.principal_kind,
          'emailOptIn', NEW.email_opt_in,
          'ideaId', NEW.idea_id
        )
      END
    )
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS board_subscribers_audit_write ON bootstrap_os.board_subscribers;
CREATE TRIGGER board_subscribers_audit_write
  AFTER INSERT OR DELETE ON bootstrap_os.board_subscribers
  FOR EACH ROW
  EXECUTE FUNCTION bootstrap_os.audit_subscriber_write();

CREATE OR REPLACE FUNCTION public.bootstrap_os_get_journey(p_company text, p_idea text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, bootstrap_os AS $$
DECLARE cid uuid; company_row bootstrap_os.companies%ROWTYPE; ideas jsonb; audit jsonb; owners jsonb;
BEGIN
  cid := public.bootstrap_os_ensure_company(p_company);
  SELECT * INTO company_row FROM bootstrap_os.companies WHERE id = cid;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'slug', i.slug, 'name', i.name,
    'clocks', jsonb_build_object('journeyPhase', i.journey_phase, 'loopStage', i.loop_stage, 'currentGate', i.current_gate),
    'constraintThisWeek', coalesce(i.scoreboard->>'constraint_this_week', ''),
    'scoreboard', i.scoreboard,
    'gateEnrichment', i.scoreboard->'gateEnrichment',
    'killed', i.current_gate = 'kill',
    'killPostmortem', i.scoreboard->'killPostmortem',
    'killedCard', CASE
      WHEN i.current_gate = 'kill' THEN concat(
        '☠ Killed',
        CASE
          WHEN nullif(trim(coalesce(i.scoreboard #>> '{killPostmortem,lessonsLearned}', '')), '') IS NOT NULL
          THEN concat(' — ', i.scoreboard #>> '{killPostmortem,lessonsLearned}')
          ELSE ''
        END
      )
      ELSE NULL
    END,
    'killedDecision', CASE
      WHEN i.current_gate = 'kill' THEN (
        SELECT jsonb_build_object('who', e.who, 'at', e.at, 'why', e.why)
        FROM bootstrap_os.gate_events e
        WHERE e.idea_id = i.id AND e.action = 'kill'
        ORDER BY e.at DESC LIMIT 1
      )
      ELSE NULL
    END,
    'snapshot', concat(company_row.label, ' / ', i.name, ' is at journey phase ', i.journey_phase::text,
      ', loop stage ', i.loop_stage::text, ', gate ', i.current_gate::text,
      CASE WHEN i.current_gate = 'kill' THEN concat(
        '. ☠ Killed',
        CASE
          WHEN nullif(trim(coalesce(i.scoreboard #>> '{killPostmortem,lessonsLearned}', '')), '') IS NOT NULL
          THEN concat(' — ', i.scoreboard #>> '{killPostmortem,lessonsLearned}')
          ELSE ''
        END
      ) ELSE '' END,
      '. Bottleneck this week: ',
      coalesce(nullif(i.scoreboard->>'constraint_this_week', ''), 'none yet'), '.'),
    'lastTransitions', coalesce((
      SELECT jsonb_agg(jsonb_build_object('at', e.at, 'who', e.who, 'action', e.action, 'why', e.why) ORDER BY e.at)
      FROM bootstrap_os.gate_events e WHERE e.idea_id = i.id
    ), '[]'::jsonb),
    'comments', coalesce((
      SELECT jsonb_agg(jsonb_build_object('at', c.at, 'who', c.who, 'body', c.body) ORDER BY c.at)
      FROM bootstrap_os.comments c WHERE c.idea_id = i.id
    ), '[]'::jsonb)
  ) ORDER BY i.slug), '[]'::jsonb)
  INTO ideas FROM bootstrap_os.ideas i
  WHERE i.company_id = cid AND (p_idea IS NULL OR i.slug = lower(p_idea));
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'at', a.at, 'who', a.who, 'client', a.client, 'whatChanged', a.what_changed
  ) ORDER BY a.at), '[]'::jsonb)
  INTO audit FROM bootstrap_os.audit_events a WHERE a.company_id = cid;
  SELECT coalesce(jsonb_agg(jsonb_build_object('principal', acl.principal, 'role', acl.role) ORDER BY acl.principal), '[]'::jsonb)
  INTO owners FROM bootstrap_os.company_acl acl WHERE acl.company_id = cid AND acl.principal_kind = 'email';
  RETURN jsonb_build_object(
    'ok', true,
    'company', jsonb_build_object('slug', company_row.slug, 'label', company_row.label),
    'ideas', ideas,
    'owners', owners,
    'audit', audit,
    'note', 'Shared 0-1 board. Company is the team; each idea has its own clocks. Decision log is lastTransitions, comments, and audit. Owners are who is on the company. Do not invent entries. Do not paste GitHub as the board. Killed ideas stay on the board with stored enrichment.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.bootstrap_os_create_idea(
  p_company text,
  p_idea text,
  p_name text DEFAULT NULL,
  p_founder_yes boolean DEFAULT FALSE,
  p_why text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, bootstrap_os AS $$
DECLARE
  cid uuid;
  v_slug text := lower(trim(coalesce(p_idea, '')));
  v_label text := nullif(trim(coalesce(p_name, '')), '');
  email text := NULLIF(lower(auth.jwt() ->> 'email'), '');
  iid uuid;
  idea_row bootstrap_os.ideas%ROWTYPE;
BEGIN
  IF p_founder_yes IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'founder yes required in the agent chat');
  END IF;
  IF v_slug IS NULL OR v_slug = '' OR v_slug !~ '^[a-z0-9][a-z0-9_-]{0,31}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid idea slug');
  END IF;
  cid := public.bootstrap_os_ensure_company(p_company);
  IF EXISTS (SELECT 1 FROM bootstrap_os.ideas i WHERE i.company_id = cid AND i.slug = v_slug) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'idea already exists');
  END IF;
  INSERT INTO bootstrap_os.ideas (company_id, slug, name, journey_phase, loop_stage, current_gate, scoreboard)
  VALUES (
    cid,
    v_slug,
    coalesce(v_label, v_slug),
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
  )
  RETURNING * INTO idea_row;
  iid := idea_row.id;
  PERFORM bootstrap_os.emit_audit(
    cid,
    iid,
    coalesce(email, 'unknown'),
    'mcp',
    jsonb_build_object(
      'op', 'create_idea',
      'via', 'create_idea',
      'idea', v_slug,
      'why', coalesce(nullif(p_why, ''), 'new 0-1 board'),
      'before', NULL,
      'after', bootstrap_os.idea_board_snapshot(
        idea_row.journey_phase, idea_row.loop_stage, idea_row.current_gate, idea_row.scoreboard
      )
    )
  );
  RETURN public.bootstrap_os_get_journey(p_company, v_slug);
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
  gate_enr jsonb;
  kill_pm jsonb;
  need_gate boolean;
BEGIN
  IF p_founder_yes IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'founder yes required in the agent chat');
  END IF;
  IF nullif(trim(coalesce(p_why, '')), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'why required');
  END IF;
  cid := public.bootstrap_os_ensure_company(p_company);
  SELECT * INTO idea_row FROM bootstrap_os.ideas
  WHERE company_id = cid AND slug = lower(coalesce(nullif(p_idea, ''), 'default'));
  IF idea_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'idea not found; call create_idea first');
  END IF;
  need_gate := p_current_gate IS NOT NULL OR p_journey_phase IS NOT NULL OR p_loop_stage IS NOT NULL;
  PERFORM set_config('app.client', 'mcp', true);
  PERFORM set_config('app.notify_summary', left(coalesce(p_why, 'board write'), 280), true);
  IF p_journey_phase IS NOT NULL THEN idea_row.journey_phase := p_journey_phase; END IF;
  IF p_loop_stage IS NOT NULL THEN idea_row.loop_stage := p_loop_stage; END IF;
  IF p_current_gate IS NOT NULL THEN idea_row.current_gate := p_current_gate::bootstrap_os.gate_decision; END IF;
  IF p_scoreboard IS NOT NULL AND jsonb_typeof(p_scoreboard) = 'object' THEN
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
  UPDATE bootstrap_os.ideas SET journey_phase = idea_row.journey_phase, loop_stage = idea_row.loop_stage,
    current_gate = idea_row.current_gate, scoreboard = idea_row.scoreboard, updated_at = now() WHERE id = idea_row.id;
  IF need_gate THEN
    INSERT INTO bootstrap_os.gate_events (idea_id, action, why, who)
    VALUES (idea_row.id, idea_row.current_gate, p_why, coalesce(email, 'unknown'));
  END IF;
  board := public.bootstrap_os_get_journey(p_company, idea_row.slug);
  bundle := bootstrap_os.notify_bundle(cid, idea_row.id, 'put_journey');
  RETURN board || bundle;
END;
$$;

CREATE OR REPLACE FUNCTION public.bootstrap_os_post_comment(p_company text, p_idea text, p_body text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, bootstrap_os AS $$
DECLARE
  cid uuid;
  idea_row bootstrap_os.ideas%ROWTYPE;
  email text := NULLIF(lower(auth.jwt() ->> 'email'), '');
  bundle jsonb;
  snap jsonb;
BEGIN
  cid := public.bootstrap_os_ensure_company(p_company);
  SELECT * INTO idea_row FROM bootstrap_os.ideas
  WHERE company_id = cid AND slug = lower(coalesce(nullif(p_idea, ''), 'default'));
  IF idea_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'idea not found; call create_idea first');
  END IF;
  snap := bootstrap_os.idea_board_snapshot(
    idea_row.journey_phase, idea_row.loop_stage, idea_row.current_gate, idea_row.scoreboard
  );
  INSERT INTO bootstrap_os.comments (idea_id, body, who) VALUES (idea_row.id, p_body, coalesce(email, 'unknown'));
  PERFORM bootstrap_os.emit_audit(cid, idea_row.id, coalesce(email, 'unknown'), 'mcp',
    jsonb_build_object(
      'op', 'post_comment',
      'via', 'post_comment',
      'before', snap,
      'after', snap
    ));
  bundle := bootstrap_os.notify_bundle(cid, idea_row.id, 'post_comment');
  RETURN jsonb_build_object('ok', true, 'clocksUnchanged', true) || bundle;
END;
$$;

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
  before_row bootstrap_os.board_subscribers%ROWTYPE;
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
  SELECT * INTO before_row FROM bootstrap_os.board_subscribers s
  WHERE s.company_id = cid
    AND s.principal = v_principal
    AND s.principal_kind = v_kind
    AND coalesce(s.idea_id, '00000000-0000-0000-0000-000000000000'::uuid)
      = coalesce(iid, '00000000-0000-0000-0000-000000000000'::uuid);
  IF before_row.id IS NULL THEN
    INSERT INTO bootstrap_os.board_subscribers (
      company_id, idea_id, principal, principal_kind, webhook_url, email_opt_in, created_by
    ) VALUES (
      cid, iid, v_principal, v_kind, v_url, coalesce(p_email_opt_in, false),
      coalesce(bootstrap_os.actor_principal(), 'unknown')
    )
    RETURNING * INTO row_sub;
  ELSE
    row_sub := before_row;
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

CREATE OR REPLACE FUNCTION public.bootstrap_os_list_provenance(
  p_company text,
  p_idea text DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, bootstrap_os
AS $$
DECLARE
  cid uuid;
  iid uuid;
  v_idea text := nullif(lower(trim(coalesce(p_idea, ''))), '');
  company_row bootstrap_os.companies%ROWTYPE;
  audit jsonb;
  gates jsonb;
  events jsonb;
BEGIN
  IF NOT public.bootstrap_os_held_label(p_company) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'company not visible');
  END IF;
  cid := public.bootstrap_os_ensure_company(p_company);
  SELECT * INTO company_row FROM bootstrap_os.companies WHERE id = cid;
  IF v_idea IS NOT NULL THEN
    SELECT i.id INTO iid FROM bootstrap_os.ideas i
    WHERE i.company_id = cid AND i.slug = v_idea;
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'at', a.at, 'who', a.who, 'client', a.client,
    'ideaSlug', i.slug, 'whatChanged', a.what_changed
  ) ORDER BY a.at), '[]'::jsonb)
  INTO audit
  FROM bootstrap_os.audit_events a
  LEFT JOIN bootstrap_os.ideas i ON i.id = a.idea_id
  WHERE a.company_id = cid
    AND (iid IS NULL OR a.idea_id = iid)
    AND (p_from IS NULL OR a.at >= p_from)
    AND (p_to IS NULL OR a.at <= p_to);
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'at', e.at, 'who', e.who, 'action', e.action, 'why', e.why, 'ideaSlug', i.slug
  ) ORDER BY e.at), '[]'::jsonb)
  INTO gates
  FROM bootstrap_os.gate_events e
  JOIN bootstrap_os.ideas i ON i.id = e.idea_id
  WHERE i.company_id = cid
    AND (iid IS NULL OR e.idea_id = iid)
    AND (p_from IS NULL OR e.at >= p_from)
    AND (p_to IS NULL OR e.at <= p_to);
  SELECT coalesce(jsonb_agg(row_evt ORDER BY row_evt->>'at', row_evt->>'kind'), '[]'::jsonb)
  INTO events
  FROM (
    SELECT jsonb_build_object(
      'kind', 'audit',
      'at', a.at,
      'who', a.who,
      'client', a.client,
      'ideaSlug', i.slug,
      'whatChanged', a.what_changed
    ) AS row_evt
    FROM bootstrap_os.audit_events a
    LEFT JOIN bootstrap_os.ideas i ON i.id = a.idea_id
    WHERE a.company_id = cid
      AND (iid IS NULL OR a.idea_id = iid)
      AND (p_from IS NULL OR a.at >= p_from)
      AND (p_to IS NULL OR a.at <= p_to)
    UNION ALL
    SELECT jsonb_build_object(
      'kind', 'gate',
      'at', e.at,
      'who', e.who,
      'action', e.action,
      'why', e.why,
      'ideaSlug', i.slug
    ) AS row_evt
    FROM bootstrap_os.gate_events e
    JOIN bootstrap_os.ideas i ON i.id = e.idea_id
    WHERE i.company_id = cid
      AND (iid IS NULL OR e.idea_id = iid)
      AND (p_from IS NULL OR e.at >= p_from)
      AND (p_to IS NULL OR e.at <= p_to)
  ) s;
  RETURN jsonb_build_object(
    'ok', true,
    'company', jsonb_build_object('slug', company_row.slug, 'label', company_row.label),
    'idea', v_idea,
    'events', events,
    'audit', audit,
    'gateEvents', gates
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.bootstrap_os_list_killed_ideas(p_company text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, bootstrap_os
AS $$
DECLARE
  cid uuid;
  company_row bootstrap_os.companies%ROWTYPE;
  ideas jsonb;
BEGIN
  IF NOT public.bootstrap_os_held_label(p_company) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'company not visible');
  END IF;
  cid := public.bootstrap_os_ensure_company(p_company);
  SELECT * INTO company_row FROM bootstrap_os.companies WHERE id = cid;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'slug', i.slug,
    'name', i.name,
    'clocks', jsonb_build_object(
      'journeyPhase', i.journey_phase,
      'loopStage', i.loop_stage,
      'currentGate', i.current_gate
    ),
    'gateEnrichment', i.scoreboard->'gateEnrichment',
    'killPostmortem', i.scoreboard->'killPostmortem',
    'killedCard', concat(
      '☠ Killed',
      CASE
        WHEN nullif(trim(coalesce(i.scoreboard #>> '{killPostmortem,lessonsLearned}', '')), '') IS NOT NULL
        THEN concat(' — ', i.scoreboard #>> '{killPostmortem,lessonsLearned}')
        ELSE ''
      END
    ),
    'killedDecision', (
      SELECT jsonb_build_object('who', e.who, 'at', e.at, 'why', e.why)
      FROM bootstrap_os.gate_events e
      WHERE e.idea_id = i.id AND e.action = 'kill'
      ORDER BY e.at DESC LIMIT 1
    )
  ) ORDER BY i.slug), '[]'::jsonb)
  INTO ideas
  FROM bootstrap_os.ideas i
  WHERE i.company_id = cid AND i.current_gate = 'kill';
  RETURN jsonb_build_object(
    'ok', true,
    'company', jsonb_build_object('slug', company_row.slug, 'label', company_row.label),
    'ideas', ideas
  );
END;
$$;

REVOKE ALL ON FUNCTION bootstrap_os.idea_board_snapshot(smallint, smallint, bootstrap_os.gate_decision, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION bootstrap_os.normalize_evidence_links(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION bootstrap_os.normalize_gate_enrichment(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION bootstrap_os.normalize_kill_postmortem(jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION bootstrap_os.audit_idea_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION bootstrap_os.audit_comment_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION bootstrap_os.audit_acl_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION bootstrap_os.audit_subscriber_write() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.bootstrap_os_list_provenance(text, text, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bootstrap_os_list_killed_ideas(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bootstrap_os_get_journey(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bootstrap_os_create_idea(text, text, text, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bootstrap_os_put_journey(text, text, text, boolean, int, int, text, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bootstrap_os_post_comment(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bootstrap_os_change_acl(text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bootstrap_os_subscribe_board(text, text, text, text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bootstrap_os_unsubscribe_board(text, text, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.bootstrap_os_list_provenance(text, text, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_list_killed_ideas(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_get_journey(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_create_idea(text, text, text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_put_journey(text, text, text, boolean, int, int, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_post_comment(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_change_acl(text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_subscribe_board(text, text, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_unsubscribe_board(text, text, text, text) TO authenticated;

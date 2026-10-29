-- Company-scoped invites and actor-required card writes.
-- Cos applies on supabase-pirin-ai. PR agents: PGlite only.
-- Do not migrate, seed, or live-probe supabase-pirin-ai from a PR cloud agent.
-- Fictional fixtures only (alpha, bravo, charlie, founder@example.test).

CREATE SCHEMA IF NOT EXISTS bootstrap_os;

CREATE TABLE IF NOT EXISTS bootstrap_os.invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL,
  invitee_email text NOT NULL,
  inviter_email text NOT NULL,
  inviter_sub text,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invites_email_lower CHECK (invitee_email = lower(invitee_email)),
  CONSTRAINT invites_inviter_email_lower CHECK (inviter_email = lower(inviter_email)),
  CONSTRAINT invites_status CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  CONSTRAINT invites_token_hash_unique UNIQUE (token_hash)
);

CREATE TABLE IF NOT EXISTS bootstrap_os.invite_companies (
  invite_id uuid NOT NULL REFERENCES bootstrap_os.invites (id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES bootstrap_os.companies (id) ON DELETE CASCADE,
  role text NOT NULL,
  PRIMARY KEY (invite_id, company_id),
  CONSTRAINT invite_companies_role CHECK (role IN ('viewer', 'commenter', 'editor'))
);

CREATE INDEX IF NOT EXISTS invites_invitee_idx
  ON bootstrap_os.invites (invitee_email);

ALTER TABLE bootstrap_os.invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE bootstrap_os.invite_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE bootstrap_os.invites FORCE ROW LEVEL SECURITY;
ALTER TABLE bootstrap_os.invite_companies FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE bootstrap_os.invites FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE bootstrap_os.invite_companies FROM PUBLIC, anon, authenticated;

-- No SELECT/INSERT policy for authenticated. RPCs are SECURITY DEFINER.
-- The actor is the JWT email or sub (bootstrap_os.actor_email / actor_sub,
-- the same auth.jwt() source as 20260902). There is no app.actor_email fallback.
-- Inside SECURITY DEFINER, current_user is the function owner, so a session
-- setting cannot name the actor. A missing JWT fails closed.

CREATE OR REPLACE FUNCTION bootstrap_os.resolved_actor_email()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = pg_catalog, bootstrap_os, public
AS $$
  SELECT bootstrap_os.actor_email();
$$;

CREATE OR REPLACE FUNCTION bootstrap_os.resolved_actor_sub()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = pg_catalog, bootstrap_os, public
AS $$
  SELECT bootstrap_os.actor_sub();
$$;

CREATE OR REPLACE FUNCTION bootstrap_os.actor_is_set()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, bootstrap_os, public
AS $$
  SELECT coalesce(
    bootstrap_os.resolved_actor_email(),
    bootstrap_os.resolved_actor_sub()
  ) IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION bootstrap_os.require_actor()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, bootstrap_os, public
AS $$
BEGIN
  IF NOT bootstrap_os.actor_is_set() THEN
    RAISE EXCEPTION 'actor_required' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION bootstrap_os.rank_of(p_role text)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, bootstrap_os, public
AS $$
  SELECT CASE p_role
    WHEN 'founder' THEN 4
    WHEN 'owner' THEN 4
    WHEN 'founder_authorized' THEN 3
    WHEN 'editor' THEN 3
    WHEN 'advisor' THEN 2
    WHEN 'mentor' THEN 2
    WHEN 'commenter' THEN 2
    WHEN 'viewer' THEN 1
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION bootstrap_os.audit_invite_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bootstrap_os, public
AS $$
BEGIN
  PERFORM bootstrap_os.require_actor();
  INSERT INTO bootstrap_os.audit_events (company_id, who, client, what_changed)
  VALUES (
    NEW.company_id,
    coalesce(
      bootstrap_os.resolved_actor_email(),
      bootstrap_os.resolved_actor_sub()
    ),
    coalesce(nullif(current_setting('app.client', true), ''), 'invite'),
    jsonb_build_object(
      'via', 'invite.create',
      'op', 'insert',
      'role', NEW.role
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invite_companies_audit_write ON bootstrap_os.invite_companies;
CREATE TRIGGER invite_companies_audit_write
  AFTER INSERT ON bootstrap_os.invite_companies
  FOR EACH ROW
  EXECUTE FUNCTION bootstrap_os.audit_invite_company();

CREATE OR REPLACE FUNCTION bootstrap_os.audit_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only' USING ERRCODE = '42501';
END;
$$;

DO $$
BEGIN
  IF to_regclass('bootstrap_os.audit_events') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS audit_events_no_update ON bootstrap_os.audit_events;
    CREATE TRIGGER audit_events_no_update
      BEFORE UPDATE OR DELETE ON bootstrap_os.audit_events
      FOR EACH ROW
      EXECUTE FUNCTION bootstrap_os.audit_events_append_only();
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.bootstrap_os_invite_create(
  p_email text,
  p_companies jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = bootstrap_os, public
AS $$
DECLARE
  actor_email text;
  invitee text;
  elem jsonb;
  v_slug text;
  requested text;
  tier_rank int;
  rank int;
  invitee_rank int;
  ceiling_ok boolean;
  company_uuid uuid;
  invite_id uuid;
  raw_token text;
  grants jsonb := '[]'::jsonb;
  dropped jsonb := '[]'::jsonb;
  denied jsonb := '[]'::jsonb;
  allowed jsonb := '[]'::jsonb;
  seen text[] := ARRAY[]::text[];
BEGIN
  PERFORM bootstrap_os.require_actor();
  actor_email := bootstrap_os.resolved_actor_email();
  invitee := nullif(lower(trim(coalesce(p_email, ''))), '');
  IF actor_email IS NULL OR invitee IS NULL OR invitee !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_email');
  END IF;
  IF p_companies IS NULL OR jsonb_typeof(p_companies) <> 'array' OR jsonb_array_length(p_companies) > 20 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_label');
  END IF;

  FOR elem IN SELECT value FROM jsonb_array_elements(p_companies)
  LOOP
    v_slug := lower(trim(coalesce(elem->>'slug', '')));
    requested := coalesce(nullif(elem->>'role', ''), 'viewer');
    IF v_slug = '' OR v_slug !~ '^[a-z0-9][a-z0-9_-]{0,31}$' OR v_slug = ANY (seen) THEN
      denied := denied || jsonb_build_array(jsonb_build_object('slug', v_slug, 'reason', 'invalid_label'));
      CONTINUE;
    END IF;
    seen := array_append(seen, v_slug);
    IF requested NOT IN ('viewer', 'commenter', 'editor') THEN
      denied := denied || jsonb_build_array(jsonb_build_object('slug', v_slug, 'reason', 'owner_forbidden'));
      CONTINUE;
    END IF;
    company_uuid := NULL;
    rank := NULL;
    SELECT c.id INTO company_uuid FROM bootstrap_os.companies c WHERE c.slug = v_slug;
    IF company_uuid IS NOT NULL THEN
      SELECT bootstrap_os.rank_of(a.role) INTO rank
      FROM bootstrap_os.company_acl a
      WHERE a.company_id = company_uuid
        AND a.principal_kind = 'email'
        AND a.principal = actor_email
      ORDER BY bootstrap_os.rank_of(a.role) DESC
      LIMIT 1;
    END IF;
    tier_rank := bootstrap_os.rank_of(requested);
    ceiling_ok := rank IS NOT NULL AND rank >= 3 AND (requested <> 'editor' OR rank >= 4);
    IF NOT ceiling_ok THEN
      denied := denied || jsonb_build_array(jsonb_build_object(
        'slug', v_slug,
        'reason', CASE WHEN rank IS NULL THEN 'not_held' ELSE 'tier_forbidden' END
      ));
      IF rank IS NOT NULL AND rank >= 3 THEN
        allowed := allowed || jsonb_build_array(to_jsonb(v_slug));
      END IF;
      CONTINUE;
    END IF;
    allowed := allowed || jsonb_build_array(to_jsonb(v_slug));
    invitee_rank := NULL;
    SELECT bootstrap_os.rank_of(a.role) INTO invitee_rank
    FROM bootstrap_os.company_acl a
    WHERE a.company_id = company_uuid
      AND a.principal_kind = 'email'
      AND a.principal = invitee
    ORDER BY bootstrap_os.rank_of(a.role) DESC
    LIMIT 1;
    IF invitee_rank IS NOT NULL AND invitee_rank >= tier_rank THEN
      dropped := dropped || jsonb_build_array(jsonb_build_object('slug', v_slug, 'role', requested));
      CONTINUE;
    END IF;
    grants := grants || jsonb_build_array(jsonb_build_object(
      'slug', v_slug,
      'role', requested,
      'company_id', company_uuid
    ));
  END LOOP;

  IF jsonb_array_length(denied) > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'invite_partial_authority',
      'allowed', allowed,
      'denied', denied
    );
  END IF;
  IF jsonb_array_length(p_companies) > 0 AND jsonb_array_length(grants) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_member');
  END IF;

  raw_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO bootstrap_os.invites (token_hash, invitee_email, inviter_email, inviter_sub, expires_at)
  VALUES (
    encode(sha256(convert_to(raw_token, 'UTF8')), 'hex'),
    invitee,
    actor_email,
    bootstrap_os.resolved_actor_sub(),
    now() + interval '7 days'
  )
  RETURNING id INTO invite_id;

  INSERT INTO bootstrap_os.invite_companies (invite_id, company_id, role)
  SELECT invite_id, (g->>'company_id')::uuid, g->>'role'
  FROM jsonb_array_elements(grants) g;

  RETURN jsonb_build_object(
    'ok', true,
    'token', raw_token,
    'inviteeEmail', invitee,
    'companies', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('slug', g->>'slug', 'role', g->>'role'))
      FROM jsonb_array_elements(grants) g
    ), '[]'::jsonb),
    'dropped', dropped
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.bootstrap_os_invite_accept(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, bootstrap_os, public
AS $$
DECLARE
  actor_email text;
  digest text;
  invite bootstrap_os.invites%ROWTYPE;
  claimed uuid;
  grant_row record;
BEGIN
  PERFORM bootstrap_os.require_actor();
  actor_email := bootstrap_os.resolved_actor_email();
  IF actor_email IS NULL OR p_token IS NULL OR length(p_token) < 16 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'token_not_found');
  END IF;
  digest := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  SELECT * INTO invite
  FROM bootstrap_os.invites
  WHERE token_hash = digest
  FOR UPDATE;
  IF invite.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'token_not_found');
  END IF;
  IF invite.invitee_email <> actor_email THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'email_mismatch');
  END IF;
  IF invite.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_accepted');
  END IF;
  IF invite.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;
  UPDATE bootstrap_os.invites
  SET status = 'accepted', accepted_at = now(), accepted_by = actor_email
  WHERE id = invite.id
    AND status = 'pending'
    AND expires_at > now()
    AND invitee_email = actor_email
  RETURNING id INTO claimed;
  IF claimed IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_accepted');
  END IF;
  FOR grant_row IN
    SELECT ic.company_id, ic.role
    FROM bootstrap_os.invite_companies ic
    WHERE ic.invite_id = invite.id
  LOOP
    INSERT INTO bootstrap_os.company_acl (company_id, principal, principal_kind, role)
    SELECT grant_row.company_id, actor_email, 'email', grant_row.role
    WHERE NOT EXISTS (
      SELECT 1 FROM bootstrap_os.company_acl a
      WHERE a.company_id = grant_row.company_id
        AND a.principal = actor_email
        AND a.principal_kind = 'email'
    );
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'inviteeEmail', actor_email);
END;
$$;

CREATE OR REPLACE FUNCTION public.bootstrap_os_invite_verify(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, bootstrap_os, public
AS $$
DECLARE
  digest text;
  invite bootstrap_os.invites%ROWTYPE;
  label text;
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'token_not_found');
  END IF;
  digest := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  SELECT * INTO invite FROM bootstrap_os.invites WHERE token_hash = digest;
  IF invite.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'token_not_found');
  END IF;
  IF invite.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_accepted');
  END IF;
  IF invite.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;
  SELECT c.slug INTO label
  FROM bootstrap_os.invite_companies ic
  JOIN bootstrap_os.companies c ON c.id = ic.company_id
  WHERE ic.invite_id = invite.id
  ORDER BY c.slug
  LIMIT 1;
  RETURN jsonb_build_object(
    'ok', true,
    'invitee_email', invite.invitee_email,
    'company_label', coalesce(label, ''),
    'inviter_email', invite.inviter_email
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_os_invite_create(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_invite_create(text, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.bootstrap_os_invite_accept(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_invite_accept(text) TO authenticated;
REVOKE ALL ON FUNCTION public.bootstrap_os_invite_verify(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_invite_verify(text) TO authenticated;

REVOKE ALL ON FUNCTION bootstrap_os.resolved_actor_email() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION bootstrap_os.resolved_actor_sub() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION bootstrap_os.actor_is_set() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION bootstrap_os.require_actor() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION bootstrap_os.rank_of(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION bootstrap_os.audit_invite_company() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION bootstrap_os.audit_events_append_only() FROM PUBLIC, anon, authenticated;

-- BEGIN CARD ACTOR
DO $card_actor$
BEGIN
  IF to_regclass('bootstrap_os.ideas') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION bootstrap_os.audit_idea_write()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = bootstrap_os, public
    AS $body$
    BEGIN
      PERFORM bootstrap_os.require_actor();
      PERFORM bootstrap_os.emit_audit(
        NEW.company_id,
        NEW.id,
        coalesce(
          bootstrap_os.resolved_actor_email(),
          bootstrap_os.resolved_actor_sub(),
          NEW.name
        ),
        coalesce(nullif(current_setting('app.client', true), ''), 'put_journey'),
        jsonb_build_object(
          'via', 'card.update',
          'journey_phase', NEW.journey_phase,
          'loop_stage', NEW.loop_stage,
          'current_gate', NEW.current_gate,
          'constraint_this_week', coalesce(NEW.scoreboard->>'constraint_this_week', '')
        )
      );
      PERFORM bootstrap_os.enqueue_board_notify(
        NEW.company_id,
        NEW.id,
        'put_journey',
        coalesce(
          bootstrap_os.resolved_actor_email(),
          bootstrap_os.resolved_actor_sub()
        ),
        'board write'
      );
      RETURN NEW;
    END;
    $body$;
  $fn$;

  DROP TRIGGER IF EXISTS ideas_audit_write ON bootstrap_os.ideas;
  CREATE TRIGGER ideas_audit_write
    AFTER UPDATE ON bootstrap_os.ideas
    FOR EACH ROW
    EXECUTE FUNCTION bootstrap_os.audit_idea_write();
END
$card_actor$;
-- END CARD ACTOR

DO $acl_tiers$
BEGIN
  IF to_regclass('bootstrap_os.company_acl') IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'company_acl_role'
      AND conrelid = 'bootstrap_os.company_acl'::regclass
  ) THEN
    ALTER TABLE bootstrap_os.company_acl DROP CONSTRAINT company_acl_role;
  END IF;
  ALTER TABLE bootstrap_os.company_acl DROP CONSTRAINT IF EXISTS company_acl_role_tiers;
  ALTER TABLE bootstrap_os.company_acl
    ADD CONSTRAINT company_acl_role_tiers
    CHECK (role IN (
      'founder', 'owner', 'founder_authorized', 'editor',
      'advisor', 'mentor', 'commenter', 'viewer'
    ));
END
$acl_tiers$;

DO $owner_audit$
BEGIN
  IF to_regclass('bootstrap_os.audit_events') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE 'DROP POLICY IF EXISTS audit_events_select_member ON bootstrap_os.audit_events';
  EXECUTE 'DROP POLICY IF EXISTS audit_events_select_owner ON bootstrap_os.audit_events';
  EXECUTE $pol$
    CREATE POLICY audit_events_select_owner
      ON bootstrap_os.audit_events
      FOR SELECT
      TO authenticated
      USING (bootstrap_os.has_role(company_id, 'founder', 'owner'))
  $pol$;
  EXECUTE 'REVOKE UPDATE, DELETE, TRUNCATE ON TABLE bootstrap_os.audit_events FROM PUBLIC, anon, authenticated';
END
$owner_audit$;

-- Self-serve creates this trigger function and revokes PUBLIC and anon only.
-- Supabase default privileges still GRANT EXECUTE to authenticated. The trigger
-- fires as the table owner. Direct EXECUTE must not be available.
DO $revoke_self_serve_audit$
BEGIN
  IF to_regprocedure('public.bootstrap_os_audit_self_serve_company()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.bootstrap_os_audit_self_serve_company() FROM PUBLIC, anon, authenticated;
  END IF;
END
$revoke_self_serve_audit$;

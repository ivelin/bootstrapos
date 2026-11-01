/**
 * Shared starter-board harness. Never supabase-pirin-ai. Fictional addresses only.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const STARTER_SQL = path.join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20261021_bootstrap_os_starter_board.sql",
);
export const FIX_SQL = path.join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20261031_bootstrap_os_starter_ensure_company.sql",
);

export const HARNESS = `
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS bootstrap_os;
CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'email', NULLIF(current_setting('app.actor_email', true), ''),
    'sub', NULLIF(current_setting('app.actor_sub', true), '')
  );
$$;
DO $$ BEGIN
  CREATE TYPE bootstrap_os.gate_decision AS ENUM ('advance', 'iterate', 'hold', 'kill');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE TABLE bootstrap_os.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  label text NOT NULL
);
CREATE TABLE bootstrap_os.company_acl (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES bootstrap_os.companies (id) ON DELETE CASCADE,
  principal text NOT NULL,
  principal_kind text NOT NULL,
  role text NOT NULL,
  CONSTRAINT company_acl_unique UNIQUE (company_id, principal, principal_kind)
);
CREATE TABLE bootstrap_os.ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES bootstrap_os.companies (id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  journey_phase smallint NOT NULL,
  loop_stage smallint NOT NULL,
  current_gate bootstrap_os.gate_decision NOT NULL DEFAULT 'hold',
  scoreboard jsonb NOT NULL,
  UNIQUE (company_id, slug)
);
CREATE TABLE bootstrap_os.board_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES bootstrap_os.companies (id) ON DELETE CASCADE
);
CREATE TABLE bootstrap_os.notify_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES bootstrap_os.companies (id) ON DELETE CASCADE,
  channel text NOT NULL
);
CREATE TABLE public.bootstrap_os_companies (
  slug text PRIMARY KEY
);
CREATE TABLE public.bootstrap_mcp_mentees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  auth_user_id uuid UNIQUE
);
CREATE TABLE public.bootstrap_company_labels (
  mentee_id uuid NOT NULL REFERENCES public.bootstrap_mcp_mentees (id),
  label text NOT NULL
);
CREATE TABLE public.bootstrap_mcp_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_label text NOT NULL,
  invitee_email text NOT NULL
);
`;

export const RPCS = `
CREATE OR REPLACE FUNCTION public.bootstrap_os_held_label(p_company text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$ SELECT true $$;

CREATE OR REPLACE FUNCTION public.bootstrap_os_get_journey(p_company text, p_idea text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, bootstrap_os
AS $$
DECLARE
  cid uuid;
  ideas jsonb;
BEGIN
  cid := public.bootstrap_os_ensure_company(p_company);
  SELECT coalesce(jsonb_agg(jsonb_build_object('slug', i.slug, 'name', i.name) ORDER BY i.slug), '[]'::jsonb)
  INTO ideas
  FROM bootstrap_os.ideas i
  WHERE i.company_id = cid AND (p_idea IS NULL OR i.slug = lower(p_idea));
  RETURN jsonb_build_object('ok', true, 'ideas', ideas);
END;
$$;

CREATE OR REPLACE FUNCTION public.bootstrap_os_put_journey(
  p_company text,
  p_idea text,
  p_why text,
  p_founder_yes boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, bootstrap_os
AS $$
DECLARE
  cid uuid;
  iid uuid;
BEGIN
  IF p_founder_yes IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'founder yes required in the agent chat');
  END IF;
  cid := public.bootstrap_os_ensure_company(p_company);
  SELECT id INTO iid FROM bootstrap_os.ideas
  WHERE company_id = cid AND slug = lower(coalesce(nullif(p_idea, ''), 'default'));
  IF iid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'idea not found; call create_idea first');
  END IF;
  UPDATE bootstrap_os.ideas
  SET scoreboard = jsonb_set(scoreboard, '{constraint_this_week}', to_jsonb(left(p_why, 280)))
  WHERE id = iid;
  RETURN public.bootstrap_os_get_journey(p_company, p_idea);
END;
$$;

CREATE OR REPLACE FUNCTION public.bootstrap_os_create_idea(
  p_company text,
  p_idea text,
  p_name text,
  p_founder_yes boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, bootstrap_os
AS $$
DECLARE
  cid uuid;
  v_slug text := lower(trim(coalesce(p_idea, '')));
BEGIN
  IF p_founder_yes IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'founder yes required in the agent chat');
  END IF;
  cid := public.bootstrap_os_ensure_company(p_company);
  INSERT INTO bootstrap_os.ideas (company_id, slug, name, journey_phase, loop_stage, current_gate, scoreboard)
  VALUES (
    cid, v_slug, coalesce(nullif(trim(p_name), ''), v_slug), 1, 1, 'hold',
    jsonb_build_object('schema_version', 1, 'constraint_this_week', '')
  );
  RETURN public.bootstrap_os_get_journey(p_company, v_slug);
END;
$$;
`;

export const SCENARIO = `
DO $$
DECLARE
  body jsonb;
  board_slug text;
  n int;
  def boolean;
  cfg text;
  auth_exec boolean;
BEGIN
  SELECT p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '')
  INTO def, cfg
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'bootstrap_os_ensure_company';
  IF def IS NOT TRUE OR cfg IS DISTINCT FROM 'search_path=public, bootstrap_os' THEN
    RAISE EXCEPTION 'ensure_company security drift % %', def, cfg;
  END IF;
  IF position('NOT EXISTS' IN pg_get_functiondef('public.bootstrap_os_ensure_company(text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'ensure_company lost the NOT EXISTS guard';
  END IF;

  SELECT p.prosecdef, coalesce(array_to_string(p.proconfig, ','), ''),
         has_function_privilege('authenticated', p.oid, 'execute')
  INTO def, cfg, auth_exec
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'bootstrap_os_create_starter_board';
  IF def IS NOT TRUE OR cfg IS DISTINCT FROM 'search_path=public, bootstrap_os' OR auth_exec IS NOT TRUE THEN
    RAISE EXCEPTION 'create_starter_board security drift % % %', def, cfg, auth_exec;
  END IF;

  PERFORM set_config('app.actor_email', 'founder@example.test', false);
  body := public.bootstrap_os_create_starter_board();
  IF (body->>'ok')::boolean IS NOT TRUE OR (body->>'created')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'starter create failed %', body;
  END IF;
  board_slug := body->>'slug';

  body := public.bootstrap_os_create_starter_board();
  IF (body->>'created')::boolean IS DISTINCT FROM false OR body->>'slug' IS DISTINCT FROM board_slug THEN
    RAISE EXCEPTION 'second starter create drifted %', body;
  END IF;

  SELECT count(*) INTO n
  FROM bootstrap_os.ideas i
  JOIN bootstrap_os.companies c ON c.id = i.company_id
  WHERE c.slug = board_slug AND i.slug = 'default' AND i.name = board_slug AND i.current_gate = 'hold';
  IF n <> 1 THEN
    RAISE EXCEPTION 'default idea missing %', n;
  END IF;

  body := public.bootstrap_os_get_journey(board_slug, NULL);
  IF (body->>'ok')::boolean IS NOT TRUE OR jsonb_array_length(body->'ideas') <> 1 THEN
    RAISE EXCEPTION 'get_journey failed %', body;
  END IF;
  body := public.bootstrap_os_put_journey(board_slug, 'default', 'week constraint', true);
  IF (body->>'ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'put_journey failed %', body;
  END IF;
  body := public.bootstrap_os_create_idea(board_slug, 'second', 'Second', true);
  IF (body->>'ok')::boolean IS NOT TRUE OR jsonb_array_length(body->'ideas') <> 1 THEN
    RAISE EXCEPTION 'create_idea failed %', body;
  END IF;

  SELECT count(*) INTO n
  FROM bootstrap_os.company_acl a
  JOIN bootstrap_os.companies c ON c.id = a.company_id
  WHERE c.slug = board_slug;
  IF n <> 1 THEN
    RAISE EXCEPTION 'acl row count %', n;
  END IF;

  BEGIN
    INSERT INTO bootstrap_os.company_acl (company_id, principal, principal_kind, role)
    SELECT id, 'stranger@example.test', 'email', 'founder_authorized'
    FROM bootstrap_os.companies WHERE slug = board_slug;
    RAISE EXCEPTION 'non-owner insert should have failed';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%starter bet board cannot add members%' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    INSERT INTO public.bootstrap_mcp_invites (company_label, invitee_email)
    VALUES (board_slug, 'member@example.test');
    RAISE EXCEPTION 'invite should have failed';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%starter bet board cannot send invites%' THEN
        RAISE;
      END IF;
  END;

  PERFORM set_config('app.actor_email', 'stranger@example.test', false);
  BEGIN
    PERFORM public.bootstrap_os_get_journey(board_slug, NULL);
    RAISE EXCEPTION 'stranger get_journey should have failed';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%starter bet board cannot add members%' THEN
        RAISE;
      END IF;
  END;
END $$;
`;

export function readFix() {
  return fs.readFileSync(FIX_SQL, "utf8");
}

export function guardAbsent(sql) {
  return sql.replace(
    /IF email IS NOT NULL AND NOT EXISTS \([\s\S]*?\) THEN/,
    "IF email IS NOT NULL THEN",
  );
}

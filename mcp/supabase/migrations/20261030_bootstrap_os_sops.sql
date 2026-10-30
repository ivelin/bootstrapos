-- Append-only SOP text. The repo does not store SOP bodies.
-- Reads: bootstrap_os_list_sops / bootstrap_os_get_sop, executable by anon.
-- Writes: INSERT by service_role only. No seed rows.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS bootstrap_os;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END
$$;

CREATE TABLE public.bootstrap_os_sops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (name ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  version text NOT NULL CHECK (version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  body text NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, version)
);

CREATE OR REPLACE FUNCTION bootstrap_os.sops_reject_bad_sha()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.sha256 IS DISTINCT FROM encode(public.digest(convert_to(NEW.body, 'UTF8'), 'sha256'), 'hex') THEN
    RAISE EXCEPTION 'sha256 does not match body';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION bootstrap_os.sops_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'bootstrap_os_sops is append-only';
END;
$$;

DROP TRIGGER IF EXISTS bootstrap_os_sops_sha ON public.bootstrap_os_sops;
CREATE TRIGGER bootstrap_os_sops_sha
  BEFORE INSERT ON public.bootstrap_os_sops
  FOR EACH ROW
  EXECUTE FUNCTION bootstrap_os.sops_reject_bad_sha();

DROP TRIGGER IF EXISTS bootstrap_os_sops_no_update ON public.bootstrap_os_sops;
CREATE TRIGGER bootstrap_os_sops_no_update
  BEFORE UPDATE ON public.bootstrap_os_sops
  FOR EACH ROW
  EXECUTE FUNCTION bootstrap_os.sops_append_only();

DROP TRIGGER IF EXISTS bootstrap_os_sops_no_delete ON public.bootstrap_os_sops;
CREATE TRIGGER bootstrap_os_sops_no_delete
  BEFORE DELETE ON public.bootstrap_os_sops
  FOR EACH ROW
  EXECUTE FUNCTION bootstrap_os.sops_append_only();

ALTER TABLE public.bootstrap_os_sops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bootstrap_os_sops FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.bootstrap_os_sops FROM PUBLIC, anon, authenticated;
GRANT INSERT, SELECT ON TABLE public.bootstrap_os_sops TO service_role;

REVOKE ALL ON FUNCTION bootstrap_os.sops_reject_bad_sha() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION bootstrap_os.sops_append_only() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.bootstrap_os_list_sops()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  result jsonb := '[]'::jsonb;
  sop_name text;
  versions jsonb;
  latest_version text;
  latest_at timestamptz;
  latest_sha text;
BEGIN
  FOR sop_name IN
    SELECT DISTINCT name FROM public.bootstrap_os_sops ORDER BY name
  LOOP
    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'version', version,
        'published_at', published_at,
        'sha256', sha256
      )
      ORDER BY
        split_part(version, '.', 1)::int,
        split_part(version, '.', 2)::int,
        split_part(version, '.', 3)::int
    ), '[]'::jsonb)
    INTO versions
    FROM public.bootstrap_os_sops
    WHERE name = sop_name;

    SELECT version, published_at, sha256
    INTO latest_version, latest_at, latest_sha
    FROM public.bootstrap_os_sops
    WHERE name = sop_name
    ORDER BY
      split_part(version, '.', 1)::int DESC,
      split_part(version, '.', 2)::int DESC,
      split_part(version, '.', 3)::int DESC
    LIMIT 1;

    result := result || jsonb_build_array(jsonb_build_object(
      'name', sop_name,
      'version', latest_version,
      'published_at', latest_at,
      'sha256', latest_sha,
      'versions', versions
    ));
  END LOOP;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.bootstrap_os_get_sop(p_name text, p_version text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  hit public.bootstrap_os_sops%ROWTYPE;
  names jsonb;
  versions jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(DISTINCT name ORDER BY name), '[]'::jsonb)
  INTO names
  FROM public.bootstrap_os_sops;

  IF NOT EXISTS (SELECT 1 FROM public.bootstrap_os_sops WHERE name = p_name) THEN
    RETURN jsonb_build_object('error', 'unknown_name', 'valid_names', names);
  END IF;

  IF p_version IS NULL THEN
    SELECT * INTO hit
    FROM public.bootstrap_os_sops
    WHERE name = p_name
    ORDER BY
      split_part(version, '.', 1)::int DESC,
      split_part(version, '.', 2)::int DESC,
      split_part(version, '.', 3)::int DESC
    LIMIT 1;
  ELSE
    SELECT * INTO hit
    FROM public.bootstrap_os_sops
    WHERE name = p_name AND version = p_version;
    IF NOT FOUND THEN
      SELECT coalesce(jsonb_agg(version ORDER BY
        split_part(version, '.', 1)::int,
        split_part(version, '.', 2)::int,
        split_part(version, '.', 3)::int
      ), '[]'::jsonb)
      INTO versions
      FROM public.bootstrap_os_sops
      WHERE name = p_name;
      RETURN jsonb_build_object(
        'error', 'unknown_version',
        'valid_versions', versions
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'name', hit.name,
    'version', hit.version,
    'published_at', hit.published_at,
    'sha256', hit.sha256,
    'body', hit.body
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_os_list_sops() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bootstrap_os_get_sop(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_list_sops() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_os_get_sop(text, text) TO anon, authenticated;

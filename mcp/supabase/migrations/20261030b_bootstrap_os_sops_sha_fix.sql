-- Applied migrations are immutable. Supabase installs pgcrypto in extensions,
-- so public.digest does not exist and every insert failed.
-- Hash with pg_catalog.sha256. No pgcrypto dependency.

CREATE OR REPLACE FUNCTION bootstrap_os.sops_reject_bad_sha()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.sha256 IS DISTINCT FROM encode(pg_catalog.sha256(convert_to(NEW.body, 'UTF8')), 'hex') THEN
    RAISE EXCEPTION 'sha256 does not match body';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION bootstrap_os.sops_reject_bad_sha() FROM PUBLIC, anon, authenticated;

-- Fixture only. Not a migration.
CREATE OR REPLACE FUNCTION public.bootstrap_os_future_write(p_company text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO bootstrap_os.companies (slug, label) VALUES (lower(p_company), lower(p_company));
  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.bootstrap_os_future_write(text) TO authenticated;

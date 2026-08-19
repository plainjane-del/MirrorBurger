-- Kitchen / POS login passwords (hashed). Run once in Supabase → SQL Editor.
-- Anon cannot read this table. Only the server (service_role) can.

CREATE TABLE IF NOT EXISTS public.kitchen_credentials (
  account_id text PRIMARY KEY,
  password_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.kitchen_credentials IS 'scrypt password hashes for kitchen Master (__master__) and per-store logins';

ALTER TABLE public.kitchen_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kitchen_credentials_no_anon" ON public.kitchen_credentials;

REVOKE ALL ON TABLE public.kitchen_credentials FROM anon, authenticated, PUBLIC;
GRANT ALL ON TABLE public.kitchen_credentials TO postgres, service_role;

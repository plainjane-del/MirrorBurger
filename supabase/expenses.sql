-- AI CFO: expense receipts MVP
-- Apply via Supabase SQL Editor or MCP apply_migration.

CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id text NOT NULL,
  merchant_name text,
  amount numeric(12,2),
  expense_date date,
  receipt_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expenses_store_id_idx ON public.expenses (store_id);
CREATE INDEX IF NOT EXISTS expenses_expense_date_idx ON public.expenses (expense_date DESC);
CREATE INDEX IF NOT EXISTS expenses_created_at_idx ON public.expenses (created_at DESC);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Writes go through Vercel service role (bypasses RLS). No anon policies.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'receipts',
  'receipts',
  true,
  10485760,
  ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS receipts_auth_insert ON storage.objects;
CREATE POLICY receipts_auth_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'receipts');

DROP POLICY IF EXISTS receipts_auth_select ON storage.objects;
CREATE POLICY receipts_auth_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'receipts');

DROP POLICY IF EXISTS receipts_auth_update ON storage.objects;
CREATE POLICY receipts_auth_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'receipts')
  WITH CHECK (bucket_id = 'receipts');

DROP POLICY IF EXISTS receipts_public_read ON storage.objects;
CREATE POLICY receipts_public_read ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'receipts');

-- ============================================================
-- Mirror Burger：store_settings RLS + lock payment-status trigger RPC
-- 用法：Supabase Dashboard → SQL Editor → Run
--   或由 agent 用 apply_migration
-- ============================================================
-- 1) 網站／廚房可以讀營業狀態
-- 2) 訪客 anon 唔可以自己開關舖（廚房用 /api/kitchen-store-status）
-- 3) 收緊 restrict_payment_status_change，唔好俾人經 RPC 亂叫
-- ============================================================

ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "store_settings_select_all" ON public.store_settings;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.store_settings;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.store_settings;
DROP POLICY IF EXISTS "Enable update for all users" ON public.store_settings;
DROP POLICY IF EXISTS "Enable delete for all users" ON public.store_settings;

CREATE POLICY "store_settings_select_all"
ON public.store_settings
FOR SELECT
TO anon, authenticated
USING (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.store_settings FROM anon, authenticated;
GRANT SELECT ON TABLE public.store_settings TO anon, authenticated;
GRANT ALL ON TABLE public.store_settings TO service_role;

ALTER TABLE public.store_settings REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.store_settings;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

REVOKE ALL ON FUNCTION public.restrict_payment_status_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restrict_payment_status_change() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restrict_payment_status_change() TO postgres, service_role;

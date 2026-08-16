-- ============================================================
-- Lock down orders + menu write grants.
-- Anon may only READ menu / store_settings / sold-out flags.
-- Orders: no anon SELECT/INSERT/UPDATE/DELETE.
-- Checkout → POST /api/create-order
-- Payment check → POST /api/order-status
-- Kitchen board → POST /api/kitchen-orders
-- ============================================================

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders_select_all" ON public.orders;
DROP POLICY IF EXISTS "orders_insert_pending" ON public.orders;
DROP POLICY IF EXISTS "orders_update_kitchen" ON public.orders;
DROP POLICY IF EXISTS "orders_delete_none" ON public.orders;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.orders;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.orders;
DROP POLICY IF EXISTS "Enable update for all users" ON public.orders;
DROP POLICY IF EXISTS "Enable delete for all users" ON public.orders;

REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.orders FROM anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.menu_items FROM anon, authenticated;
GRANT SELECT ON TABLE public.menu_items TO anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.menu_sold_out FROM anon, authenticated;
GRANT SELECT ON TABLE public.menu_sold_out TO anon, authenticated;

GRANT ALL ON TABLE public.orders TO service_role;
GRANT ALL ON TABLE public.menu_items TO service_role;
GRANT ALL ON TABLE public.menu_sold_out TO service_role;

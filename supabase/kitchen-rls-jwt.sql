-- Kitchen KDS: RLS for authenticated JWTs that carry store_id claim.
-- store_id: SYP | TH | TW | * (master)
-- Apply in Supabase SQL Editor (or via MCP apply_migration).

CREATE OR REPLACE FUNCTION public.store_code_from_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE trim(p_name)
        WHEN 'Sai Ying Pun' THEN 'SYP'
        WHEN 'Fortress Hill' THEN 'TH'
        WHEN 'Tsuen Wan (Takeaway Only)' THEN 'TW'
        ELSE upper(trim(COALESCE(p_name, '')))
    END;
$$;

CREATE OR REPLACE FUNCTION public.jwt_store_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(
        NULLIF(auth.jwt() ->> 'store_id', ''),
        NULLIF(auth.jwt() -> 'app_metadata' ->> 'store_id', '')
    );
$$;

COMMENT ON FUNCTION public.jwt_store_id() IS
  'Kitchen/Admin JWT claim store_id (SYP|TH|TW|*) for RLS';

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kitchen_orders_select ON public.orders;
CREATE POLICY kitchen_orders_select ON public.orders
    FOR SELECT
    TO authenticated
    USING (
        public.jwt_store_id() = '*'
        OR public.store_code_from_name(store_name) = public.jwt_store_id()
    );

-- Kitchen may update status / payment_status for their store (KDS buttons).
DROP POLICY IF EXISTS kitchen_orders_update ON public.orders;
CREATE POLICY kitchen_orders_update ON public.orders
    FOR UPDATE
    TO authenticated
    USING (
        public.jwt_store_id() = '*'
        OR public.store_code_from_name(store_name) = public.jwt_store_id()
    )
    WITH CHECK (
        public.jwt_store_id() = '*'
        OR public.store_code_from_name(store_name) = public.jwt_store_id()
    );

-- Realtime: ensure orders is in publication (safe if already added)
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
END $$;

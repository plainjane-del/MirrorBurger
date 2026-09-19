-- Daily order display IDs: [StoreCode]-[YYMMDD]-[Channel]-[001]
-- Sequence resets at 04:00 Asia/Hong_Kong (logical day = now_hk - 4 hours).
-- Atomic upsert prevents race conditions under concurrent checkouts.
-- Supabase → SQL Editor → paste → Run  (or applied via migration)

-- 1) Sequence tracking table
CREATE TABLE IF NOT EXISTS public.daily_order_sequence (
    store_code   text NOT NULL,
    logical_date date NOT NULL,
    seq_value    int  NOT NULL DEFAULT 0,
    PRIMARY KEY (store_code, logical_date)
);

COMMENT ON TABLE public.daily_order_sequence IS
  'Per-store daily counters for human-readable display_id; day boundary is 04:00 HKT';

-- 2) Human-readable ID on orders (also used as primary order_no for new tickets)
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS display_id text;

COMMENT ON COLUMN public.orders.display_id IS
  'Kitchen/customer ticket: StoreCode-YYMMDD-Channel-Seq e.g. TW-260919-Q-001 (same as order_no for new orders)';

CREATE UNIQUE INDEX IF NOT EXISTS orders_display_id_uidx
    ON public.orders (display_id)
    WHERE display_id IS NOT NULL;

-- 3) Concurrent-safe ID generator
CREATE OR REPLACE FUNCTION public.generate_order_id(
    p_store_code text,
    p_channel text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_store   text := upper(trim(p_store_code));
    v_channel text := upper(trim(p_channel));
    v_logical date;
    v_seq     int;
    v_yymmdd  text;
    v_seq_str text;
BEGIN
    IF v_store IS NULL OR v_store = '' THEN
        RAISE EXCEPTION 'generate_order_id: store_code required';
    END IF;
    IF v_channel IS NULL OR v_channel !~ '^[A-Z]$' THEN
        RAISE EXCEPTION 'generate_order_id: channel must be a single letter (P/Q/D)';
    END IF;

    -- Logical business day: HKT clock minus 4 hours → 03:59 still previous day
    v_logical := (
        (timezone('Asia/Hong_Kong', now()) - interval '4 hours')
    )::date;

    INSERT INTO public.daily_order_sequence AS s (store_code, logical_date, seq_value)
    VALUES (v_store, v_logical, 1)
    ON CONFLICT (store_code, logical_date)
    DO UPDATE SET seq_value = s.seq_value + 1
    RETURNING seq_value INTO v_seq;

    v_yymmdd := to_char(v_logical, 'YYMMDD');
    -- Pad to 3 digits; naturally grows to 4+ after 999
    v_seq_str := lpad(v_seq::text, 3, '0');

    RETURN v_store || '-' || v_yymmdd || '-' || v_channel || '-' || v_seq_str;
END;
$$;

COMMENT ON FUNCTION public.generate_order_id(text, text) IS
  'Atomically allocate next display_id for store+logical day; channel P/Q/D';

GRANT EXECUTE ON FUNCTION public.generate_order_id(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_order_id(text, text) TO authenticated;

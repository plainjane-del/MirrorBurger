-- Mirror Burger — Inventory deduction RPC (Step 2)
-- Requires inventory-recipe-schema.sql tables first.
-- Supabase → SQL Editor → Run

CREATE TABLE IF NOT EXISTS public.inventory_deduction_log (
    order_no     text PRIMARY KEY,
    store_code   text NOT NULL,
    deducted_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_deduction_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.inventory_deduction_log FROM anon, authenticated;
GRANT ALL ON TABLE public.inventory_deduction_log TO service_role;

CREATE OR REPLACE FUNCTION public.deduct_inventory_for_order(
    p_order_no text,
    p_store_code text,
    p_order_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_store text := upper(trim(COALESCE(p_store_code, '')));
    v_order text := trim(COALESCE(p_order_no, ''));
    v_item jsonb;
    v_menu_id text;
    v_qty numeric;
    v_method text;
    r record;
    v_low jsonb := '[]'::jsonb;
BEGIN
    IF v_order = '' THEN
        RAISE EXCEPTION 'deduct_inventory_for_order: order_no required';
    END IF;
    IF v_store = '' OR v_store !~ '^[A-Z]{2,4}$' THEN
        RAISE EXCEPTION 'deduct_inventory_for_order: invalid store_code';
    END IF;

    IF EXISTS (SELECT 1 FROM public.inventory_deduction_log WHERE order_no = v_order) THEN
        RETURN jsonb_build_object(
            'ok', true,
            'skipped', true,
            'reason', 'already_deducted',
            'low_stock', '[]'::jsonb
        );
    END IF;

    IF p_order_items IS NULL OR jsonb_typeof(p_order_items) <> 'array' THEN
        INSERT INTO public.inventory_deduction_log (order_no, store_code)
        VALUES (v_order, v_store);
        RETURN jsonb_build_object(
            'ok', true,
            'skipped', true,
            'reason', 'no_items',
            'low_stock', '[]'::jsonb
        );
    END IF;

    CREATE TEMP TABLE IF NOT EXISTS _inv_deduct (
        inventory_item_id uuid PRIMARY KEY,
        qty numeric NOT NULL
    ) ON COMMIT DROP;
    TRUNCATE _inv_deduct;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_order_items)
    LOOP
        v_menu_id := COALESCE(
            NULLIF(trim(v_item->>'menuId'), ''),
            NULLIF(trim(v_item->>'menu_id'), ''),
            NULLIF(trim(v_item->>'id'), '')
        );
        v_qty := COALESCE(
            NULLIF(v_item->>'qty', '')::numeric,
            NULLIF(v_item->>'quantity', '')::numeric,
            1
        );
        IF v_menu_id IS NULL OR v_qty IS NULL OR v_qty <= 0 THEN
            CONTINUE;
        END IF;

        SELECT costing_method INTO v_method
        FROM public.menu_items
        WHERE id = v_menu_id;

        IF v_method IS DISTINCT FROM 'recipe' THEN
            CONTINUE;
        END IF;

        INSERT INTO _inv_deduct (inventory_item_id, qty)
        SELECT r.inventory_item_id, r.quantity_used * v_qty
        FROM public.recipes r
        JOIN public.inventory_items i ON i.id = r.inventory_item_id
        WHERE r.menu_item_id = v_menu_id
          AND i.store_code = v_store
        ON CONFLICT (inventory_item_id)
        DO UPDATE SET qty = _inv_deduct.qty + EXCLUDED.qty;
    END LOOP;

    FOR r IN SELECT inventory_item_id, qty FROM _inv_deduct
    LOOP
        UPDATE public.inventory_items
        SET current_stock = current_stock - r.qty,
            updated_at = now()
        WHERE id = r.inventory_item_id
          AND store_code = v_store;
    END LOOP;

    INSERT INTO public.inventory_deduction_log (order_no, store_code)
    VALUES (v_order, v_store);

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', i.id,
        'store_code', i.store_code,
        'name', i.name,
        'unit_of_measure', i.unit_of_measure,
        'current_stock', i.current_stock,
        'low_stock_threshold', i.low_stock_threshold
    ) ORDER BY i.name), '[]'::jsonb)
    INTO v_low
    FROM public.inventory_items i
    WHERE i.id IN (SELECT inventory_item_id FROM _inv_deduct)
      AND i.current_stock <= i.low_stock_threshold;

    RETURN jsonb_build_object(
        'ok', true,
        'skipped', false,
        'store_code', v_store,
        'order_no', v_order,
        'low_stock', COALESCE(v_low, '[]'::jsonb)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.deduct_inventory_for_order(text, text, jsonb) TO service_role;

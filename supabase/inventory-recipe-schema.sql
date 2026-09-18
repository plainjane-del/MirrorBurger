-- ============================================================
-- Mirror Burger — Inventory & Recipe Costing (Step 1: schema)
-- Supabase → SQL Editor → paste → Run
-- ============================================================
-- Notes:
--   • Live menu table is public.menu_items (id text), NOT "menu".
--   • store_code uses district initials: TW / TH / SYP (same as display_id).
--   • Writes go through service_role (Vercel APIs); anon gets read-only where useful.
-- ============================================================

-- 1) Inventory items (per store)
CREATE TABLE IF NOT EXISTS public.inventory_items (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_code           text NOT NULL,
    name                 text NOT NULL,
    unit_of_measure      text NOT NULL DEFAULT 'g',
    cost_per_unit        numeric(12, 4) NOT NULL DEFAULT 0,
    current_stock        numeric(14, 4) NOT NULL DEFAULT 0,
    low_stock_threshold  numeric(14, 4) NOT NULL DEFAULT 0,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT inventory_items_store_code_chk
        CHECK (store_code ~ '^[A-Z]{2,4}$'),
    CONSTRAINT inventory_items_uom_chk
        CHECK (char_length(trim(unit_of_measure)) > 0),
    CONSTRAINT inventory_items_cost_nonneg_chk
        CHECK (cost_per_unit >= 0),
    CONSTRAINT inventory_items_threshold_nonneg_chk
        CHECK (low_stock_threshold >= 0)
);

CREATE INDEX IF NOT EXISTS inventory_items_store_code_idx
    ON public.inventory_items (store_code);

CREATE INDEX IF NOT EXISTS inventory_items_store_name_idx
    ON public.inventory_items (store_code, name);

COMMENT ON TABLE public.inventory_items IS
  'Per-store raw ingredients / packaging for recipe costing & stock deduction';
COMMENT ON COLUMN public.inventory_items.store_code IS
  'District code: TW, TH, SYP';
COMMENT ON COLUMN public.inventory_items.unit_of_measure IS
  'e.g. g, ml, pcs, kg';

-- 2) Menu costing columns on existing menu_items
ALTER TABLE public.menu_items
    ADD COLUMN IF NOT EXISTS costing_method text NOT NULL DEFAULT 'direct',
    ADD COLUMN IF NOT EXISTS direct_cost numeric(12, 4) NOT NULL DEFAULT 0;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'menu_items_costing_method_chk'
          AND conrelid = 'public.menu_items'::regclass
    ) THEN
        ALTER TABLE public.menu_items
            ADD CONSTRAINT menu_items_costing_method_chk
            CHECK (costing_method IN ('direct', 'recipe'));
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'menu_items_direct_cost_nonneg_chk'
          AND conrelid = 'public.menu_items'::regclass
    ) THEN
        ALTER TABLE public.menu_items
            ADD CONSTRAINT menu_items_direct_cost_nonneg_chk
            CHECK (direct_cost >= 0);
    END IF;
END $$;

COMMENT ON COLUMN public.menu_items.costing_method IS
  'direct = use direct_cost; recipe = sum inventory via recipes';
COMMENT ON COLUMN public.menu_items.direct_cost IS
  'Fixed COGS when costing_method = direct (HKD per unit sold)';

-- 3) Recipe lines: menu item → inventory ingredient
CREATE TABLE IF NOT EXISTS public.recipes (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_item_id       text NOT NULL REFERENCES public.menu_items (id) ON DELETE CASCADE,
    inventory_item_id  uuid NOT NULL REFERENCES public.inventory_items (id) ON DELETE RESTRICT,
    quantity_used      numeric(14, 4) NOT NULL,
    created_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT recipes_quantity_positive_chk CHECK (quantity_used > 0),
    CONSTRAINT recipes_menu_inventory_uidx UNIQUE (menu_item_id, inventory_item_id)
);

CREATE INDEX IF NOT EXISTS recipes_menu_item_id_idx
    ON public.recipes (menu_item_id);

CREATE INDEX IF NOT EXISTS recipes_inventory_item_id_idx
    ON public.recipes (inventory_item_id);

COMMENT ON TABLE public.recipes IS
  'BOM: how much of each inventory item one menu portion consumes';

-- 4) RLS — match project pattern (anon read-safe; writes via service_role only)
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_items_select_all" ON public.inventory_items;
CREATE POLICY "inventory_items_select_all"
ON public.inventory_items
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "recipes_select_all" ON public.recipes;
CREATE POLICY "recipes_select_all"
ON public.recipes
FOR SELECT
TO anon, authenticated
USING (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.inventory_items FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.recipes FROM anon, authenticated;

GRANT SELECT ON TABLE public.inventory_items TO anon, authenticated;
GRANT SELECT ON TABLE public.recipes TO anon, authenticated;

GRANT ALL ON TABLE public.inventory_items TO service_role;
GRANT ALL ON TABLE public.recipes TO service_role;

-- Idempotency log for stock deduction (used by deduct_inventory_for_order)
CREATE TABLE IF NOT EXISTS public.inventory_deduction_log (
    order_no     text PRIMARY KEY,
    store_code   text NOT NULL,
    deducted_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_deduction_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.inventory_deduction_log FROM anon, authenticated;
GRANT ALL ON TABLE public.inventory_deduction_log TO service_role;

-- menu_items already has public SELECT + service_role ALL; new columns inherit that.

-- ============================================================
-- Mirror Burger：補齊 live menu schema（唔會撞壞舊欄）
-- Supabase → SQL Editor → Run 一次
-- ============================================================

-- Live DB 用緊 description_* / image_url；呢度加齊 admin/網站預期欄
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS desc_en text;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS desc_zh text;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS img text;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS tag_en text;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS tag_zh text;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS dietary jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS sizes jsonb;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS is_side boolean DEFAULT false;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS has_temp boolean DEFAULT false;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS sort_order int DEFAULT 0;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 從舊欄抄過嚟（有 description_* / image_url 先寫）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'menu_items' AND column_name = 'description_en'
  ) THEN
    UPDATE public.menu_items
    SET
      desc_en = COALESCE(desc_en, description_en),
      desc_zh = COALESCE(desc_zh, description_zh),
      img = COALESCE(NULLIF(img, ''), image_url)
    WHERE true;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.menu_modifiers (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('addon', 'sauce', 'combo_snack', 'combo_drink')),
  name_en text NOT NULL DEFAULT '',
  name_zh text NOT NULL DEFAULT '',
  price numeric NOT NULL DEFAULT 0,
  is_active boolean DEFAULT true,
  sort_order int DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.menu_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);

INSERT INTO public.menu_settings (key, value)
VALUES ('combo_base', '19'::jsonb)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "menu_items_public_read" ON public.menu_items;
CREATE POLICY "menu_items_public_read"
ON public.menu_items FOR SELECT TO anon, authenticated
USING (coalesce(is_active, true) = true);

DROP POLICY IF EXISTS "menu_modifiers_public_read" ON public.menu_modifiers;
CREATE POLICY "menu_modifiers_public_read"
ON public.menu_modifiers FOR SELECT TO anon, authenticated
USING (coalesce(is_active, true) = true);

DROP POLICY IF EXISTS "menu_settings_public_read" ON public.menu_settings;
CREATE POLICY "menu_settings_public_read"
ON public.menu_settings FOR SELECT TO anon, authenticated
USING (true);

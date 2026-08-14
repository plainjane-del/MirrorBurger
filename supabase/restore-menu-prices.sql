-- ============================================================
-- Restore live menu prices (pre–menu-full seed values)
-- + snack M/L sizes that DB rows were missing
-- Run in Supabase SQL Editor
-- ============================================================

UPDATE public.menu_items SET price = 68,  updated_at = now() WHERE id = 'b1';
UPDATE public.menu_items SET price = 71,  updated_at = now() WHERE id = 'b3';
UPDATE public.menu_items SET price = 82,  updated_at = now() WHERE id = 'b4';
UPDATE public.menu_items SET price = 102, updated_at = now() WHERE id = 'b2';
UPDATE public.menu_items SET price = 60,  updated_at = now() WHERE id = 'v2';
UPDATE public.menu_items SET price = 69,  updated_at = now() WHERE id = 'c1';
UPDATE public.menu_items SET price = 99,  updated_at = now() WHERE id = 'c2';
UPDATE public.menu_items SET price = 61,  updated_at = now() WHERE id = 'v1';
UPDATE public.menu_items SET price = 64,  updated_at = now() WHERE id = 'v3';
UPDATE public.menu_items SET price = 67,  updated_at = now() WHERE id = 'v4';
UPDATE public.menu_items SET price = 15,  updated_at = now() WHERE id = 's1';
UPDATE public.menu_items SET price = 15,  updated_at = now() WHERE id = 's2';
UPDATE public.menu_items SET price = 26,  updated_at = now() WHERE id = 's5';
UPDATE public.menu_items SET price = 26,  updated_at = now() WHERE id = 's3';
UPDATE public.menu_items SET price = 50,  updated_at = now() WHERE id = 's7';

-- Restore snack display names + size upcharges (DB had only "(M)" / no sizes)
UPDATE public.menu_items SET
  name_en = 'Crispy Fries M/L',
  name_zh = '脆炸薯條 M/L',
  sizes = '[{"label":"M","labelZh":"M","upcharge":0},{"label":"L","labelZh":"L","upcharge":8}]'::jsonb,
  is_side = true,
  updated_at = now()
WHERE id = 's1';

UPDATE public.menu_items SET
  name_en = 'Renkon Chips M/L',
  name_zh = '蓮藕脆片 M/L',
  sizes = '[{"label":"M","labelZh":"M","upcharge":0},{"label":"L","labelZh":"L","upcharge":8}]'::jsonb,
  is_side = true,
  updated_at = now()
WHERE id = 's2';

UPDATE public.menu_items SET
  name_en = 'Sweet Potato M/L',
  name_zh = '炸番薯條 M/L',
  sizes = '[{"label":"M","labelZh":"M","upcharge":0},{"label":"L","labelZh":"L","upcharge":13}]'::jsonb,
  is_side = true,
  updated_at = now()
WHERE id = 's5';

UPDATE public.menu_items SET
  name_en = 'Smoky Wings 3pcs/5pcs',
  name_zh = '煙燻雞翼 3件/5件',
  sizes = '[{"label":"3pcs","labelZh":"3件","upcharge":0},{"label":"5pcs","labelZh":"5件","upcharge":13}]'::jsonb,
  is_side = true,
  updated_at = now()
WHERE id = 's3';

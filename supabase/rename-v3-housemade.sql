UPDATE public.menu_items
SET name_zh = '自家製素'
WHERE id = 'v3' AND name_zh IS DISTINCT FROM '自家製素';

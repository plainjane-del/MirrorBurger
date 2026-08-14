-- ============================================================
-- Mirror Burger：完整菜單資料庫（Phase C）
-- Supabase → SQL Editor → 貼上 → Run
-- 之後用 /admin.html 管理；網站會讀呢啲表
-- ============================================================

CREATE TABLE IF NOT EXISTS public.menu_items (
  id text PRIMARY KEY,
  category text NOT NULL,
  name_en text NOT NULL DEFAULT '',
  name_zh text NOT NULL DEFAULT '',
  price numeric NOT NULL DEFAULT 0,
  desc_en text,
  desc_zh text,
  img text,
  tag_en text,
  tag_zh text,
  dietary jsonb DEFAULT '[]'::jsonb,
  sizes jsonb,
  is_side boolean DEFAULT false,
  has_temp boolean DEFAULT false,
  is_sold_out boolean DEFAULT false,
  is_active boolean DEFAULT true,
  sort_order int DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

-- 舊表可能只有部分欄：逐欄補
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS name_en text;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS name_zh text;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS price numeric;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS desc_en text;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS desc_zh text;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS img text;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS tag_en text;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS tag_zh text;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS dietary jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS sizes jsonb;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS is_side boolean DEFAULT false;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS has_temp boolean DEFAULT false;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS is_sold_out boolean DEFAULT false;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS sort_order int DEFAULT 0;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS category text;

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

-- 寫入只經 service_role（admin API）；唔開 anon INSERT/UPDATE/DELETE

-- ========== SEED menu_items（upsert）==========
INSERT INTO public.menu_items (
  id, category, name_en, name_zh, price, desc_en, desc_zh, img, tag_en, tag_zh,
  dietary, sizes, is_side, has_temp, is_sold_out, is_active, sort_order
) VALUES
('b1','beef','Classic Beef','經典芝士牛肉',65,
 'Lava-grilled 4oz Angus & Wagyu beef & red wine onion jam','火山石燒 4oz 澳洲安斯及和牛、紅酒洋蔥醬',
 'https://res.cloudinary.com/dxtmqjdxh/image/upload/f_auto,q_auto/v1777545605/classic_beef_b5lcwl.png',
 '🔥 Best Seller','🔥 人氣必點','[]'::jsonb,NULL,false,false,false,true,10),
('b3','beef','Hottest Beef','墨辣芝士牛肉',68,
 'Double jalapenos: smoked and pickled. Spicy!','雙重墨西哥辣椒：煙燻及醃製。辣！',
 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1777801224/hottest_beef2_flpfqk.jpg',
 NULL,NULL,'["🌶️"]'::jsonb,NULL,false,false,false,true,20),
('b4','beef','Hottest Blue Cheese','墨辣藍紋芝士牛肉',82,
 'For true blue cheese lovers. Mouth-watering.','藍芝士愛好者必選。惹味濃郁。',
 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1777801226/IMG_1624_ljwuo6.png',
 '👨‍🍳 Chef''s Pick','👨‍🍳 主廚推薦','["🌶️"]'::jsonb,NULL,false,false,false,true,30),
('b2','beef','3.2.1','3.2.1',99,
 'Double patty, bacon, triple cheese. Extreme flavor.','雙層漢堡扒、煙肉、三重芝士。極致滋味。',
 'https://res.cloudinary.com/dxtmqjdxh/image/upload/f_auto,q_auto/321_2_spjsm1',
 '🔥 Best Seller','🔥 人氣必點','[]'::jsonb,NULL,false,false,false,true,40),

('v2','others','Smoked Salmon & Egg','煙三文魚煎蛋',60,
 'Healthy avo & fried egg combo.','健康牛油果與煎蛋的完美配搭。',
 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1777825358/unnamed_zsvj4k.jpg',
 NULL,NULL,'[]'::jsonb,NULL,false,false,false,true,10),
('c1','others','Buffalo Chicken','水牛城脆雞',69,
 'House-blend buffalo sauce, marinated thigh, cucumber','自家調配水牛城辣醬、醃製雞大腿、青瓜',
 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1777826197/unnamed_1_rs1od0.jpg',
 NULL,NULL,'["🌶️"]'::jsonb,NULL,false,false,false,true,20),
('c2','others','Soft Shell Crab','脆炸軟殼蟹',99,
 'Crispy whole crab with secret tartar sauce','原隻香脆軟殼蟹配秘製他他醬',
 'https://res.cloudinary.com/dxtmqjdxh/image/upload/f_auto,q_auto/v1777545604/soft_shell_crab_dsrxqx.jpg',
 NULL,NULL,'[]'::jsonb,NULL,false,false,false,true,30),

('v1','veggie','Mushroom Schnitzel','燕麥吉列大啡菇',58,
 'Vegetarian chicken-style schnitzel. Soft and crispy.','素食炸雞排，外脆內軟。',
 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1777829653/unnamed_3_ij0fbk.jpg',
 NULL,NULL,'["🌱"]'::jsonb,NULL,false,false,false,true,10),
('v3','veggie','Housemade Veggie','自家製素肉',61,
 'Sweet potatoes, oats, kidney beans & chickpeas','番薯、燕麥、腰豆及鷹嘴豆自家製成',
 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1777801226/mushroom_vdx1m3.jpg',
 NULL,NULL,'["🌱"]'::jsonb,NULL,false,false,false,true,20),
('v4','veggie','Hottest Veggie','墨辣素',65,
 'Double jalapenos: smoked and pickled. Spicy plant-based joy!','雙重墨西哥辣椒：煙燻及醃製。惹味植物肉！',
 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1777801210/hot_veggie_qtszvh.jpg',
 NULL,NULL,'["🌱", "🌶️"]'::jsonb,NULL,false,false,false,true,30),

('s1','snacks','Crispy Fries M/L','脆炸薯條 M/L',15,
 'A customer complained he cracked his teeth by having just one!','脆到連客客人都投訴話差啲咬崩牙！',
 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1778137380/2a85989b-f02f-47df-82c7-df7af2fd84bf_b84fak.jpg',
 NULL,NULL,'["🌱"]'::jsonb,
 '[{"label":"M","labelZh":"M","upcharge":0},{"label":"L","labelZh":"L","upcharge":8}]'::jsonb,
 true,false,false,true,10),
('s2','snacks','Renkon Chips M/L','蓮藕脆片 M/L',15,
 'For those who wanna be different.','專為追求獨特口味嘅你而設。',
 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1778137520/PHOTO-2026-05-07-14-56-58_intdw2.jpg',
 NULL,NULL,'["🌱"]'::jsonb,
 '[{"label":"M","labelZh":"M","upcharge":0},{"label":"L","labelZh":"L","upcharge":8}]'::jsonb,
 true,false,false,true,20),
('s5','snacks','Sweet Potato M/L','炸番薯條 M/L',26,
 'I have never had such a genuine taste of it in my life.','我人生中未試過咁純粹嘅番薯鮮甜。',
 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1778137381/b766620c-1db8-434d-b929-066dcf0cc46b_wjghea.jpg',
 '👨‍🍳 Chef''s Pick','👨‍🍳 主廚推薦','["🌱"]'::jsonb,
 '[{"label":"M","labelZh":"M","upcharge":0},{"label":"L","labelZh":"L","upcharge":13}]'::jsonb,
 true,false,false,true,30),
('s3','snacks','Smoky Wings 3pcs/5pcs','煙燻雞翼 3件/5件',26,
 'If you don''t smoke, don''t choose (kidding).','煙燻味極濃，非煙民慎點！(講笑)',
 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1778137380/3e099907-efa3-42d8-a2e5-0d92ab7e27a8_ug23hi.jpg',
 NULL,NULL,'[]'::jsonb,
 '[{"label":"3pcs","labelZh":"3件","upcharge":0},{"label":"5pcs","labelZh":"5件","upcharge":13}]'::jsonb,
 true,false,false,true,40),
('s7','snacks','Buffalo Wings 5pcs','水牛城雞翼 5件',50,
 'Just lose your shit!','惹味到令人失去理智！',
 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1778137380/ae707be9-605e-418a-bea8-25b7a79d441f_gtxou9.jpg',
 NULL,NULL,'["🌶️"]'::jsonb,NULL,true,false,false,true,50),

('d1','drinks','Coke','可口可樂',13,NULL,NULL,
 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1778138704/Coke_wba2do.jpg',
 NULL,NULL,'[]'::jsonb,NULL,false,false,false,true,10),
('d1a','drinks','Coke No Sugar','零系可口可樂',13,NULL,NULL,
 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1778138703/coke_zero_jdjubx.jpg',
 NULL,NULL,'["🚫🍬"]'::jsonb,NULL,false,false,false,true,20),
('d2','drinks','Cream Soda','忌廉哥冰',13,NULL,NULL,
 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1778138716/SCHWEPPES-Cream-Soda-Hong-Kong-24-X-330mL-600x600_jiecdy.jpg',
 NULL,NULL,'[]'::jsonb,NULL,false,false,false,true,30),
('d3','drinks','Soda Water','梳打水',15,NULL,NULL,
 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1778138715/170200178-1-schweppes-soda-water-330ml_tyvsww.jpg',
 NULL,NULL,'["🚫🍬"]'::jsonb,NULL,false,false,false,true,40),
('d4','drinks','Cinnamon Iced Lemon Tea','肉桂凍檸茶',22,NULL,NULL,NULL,NULL,NULL,'[]'::jsonb,NULL,false,false,false,true,50),
('d5','drinks','Americano','美式咖啡',22,NULL,NULL,
 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1777801201/americano_fqaszt.png',
 NULL,NULL,'[]'::jsonb,NULL,false,true,false,true,60),
('d6','drinks','Latte','鮮奶咖啡',25,NULL,NULL,NULL,NULL,NULL,'[]'::jsonb,NULL,false,true,false,true,70),
('d7','drinks','Mocha','朱古力咖啡',25,NULL,NULL,
 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1778138479/mocha_niop9r.png',
 NULL,NULL,'[]'::jsonb,NULL,false,true,false,true,80),
('d8','drinks','Chocolate','朱古力',25,NULL,NULL,
 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1778138479/mocha_niop9r.png',
 NULL,NULL,'[]'::jsonb,NULL,false,true,false,true,90),
('d9','drinks','Avocado Smoothie with Oat','燕麥牛油果沙冰',37,NULL,NULL,NULL,NULL,NULL,'[]'::jsonb,NULL,false,false,false,true,100),
('d10','drinks','Double Ovaltine Smoothie','雙重阿華田沙冰',40,NULL,NULL,NULL,NULL,NULL,'[]'::jsonb,NULL,false,false,false,true,110),

('ss1','sauces','Caramelized Garlic','焦糖蒜蓉醬',6,NULL,NULL,
 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1778138619/garlic-mayonnaise_kg8fez.jpg',
 NULL,NULL,'[]'::jsonb,NULL,false,false,false,true,10),
('ss2','sauces','Smoked Jalapeño','煙燻墨西哥辣椒醬',8,NULL,NULL,
 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1778138635/Copy_of_jalapeno_sauce_mfd8qv.jpg',
 NULL,NULL,'[]'::jsonb,NULL,false,false,false,true,20),
('ss3','sauces','Buffalo Sauce','水牛城辣醬',8,NULL,NULL,
 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1778138636/vegan-buffalo-sauce-6-737x1024_vnpb7z.jpg',
 NULL,NULL,'[]'::jsonb,NULL,false,false,false,true,30),
('ss4','sauces','Tartar Sauce','秘製他他醬',8,NULL,NULL,
 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1778138636/tartar-sauce-1500-6-square_i8owfz.jpg',
 NULL,NULL,'[]'::jsonb,NULL,false,false,false,true,40),
('ss5','sauces','Blue Cheese','藍紋芝士醬',8,NULL,NULL,
 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1778138636/blue_cheese_sauce_rewu7i.jpg',
 NULL,NULL,'[]'::jsonb,NULL,false,false,false,true,50)
ON CONFLICT (id) DO UPDATE SET
  category = EXCLUDED.category,
  name_en = EXCLUDED.name_en,
  name_zh = EXCLUDED.name_zh,
  price = EXCLUDED.price,
  desc_en = EXCLUDED.desc_en,
  desc_zh = EXCLUDED.desc_zh,
  img = EXCLUDED.img,
  tag_en = EXCLUDED.tag_en,
  tag_zh = EXCLUDED.tag_zh,
  dietary = EXCLUDED.dietary,
  sizes = EXCLUDED.sizes,
  is_side = EXCLUDED.is_side,
  has_temp = EXCLUDED.has_temp,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- ========== SEED modifiers ==========
INSERT INTO public.menu_modifiers (id, kind, name_en, name_zh, price, is_active, sort_order) VALUES
('a1','addon','Housemade Pickles','自家製酸瓜',4,true,10),
('a2','addon','Pickled Jalapeno','墨西哥酸辣辣椒',4,true,20),
('a3','addon','American Cheese','美國芝士',5,true,30),
('a4','addon','Fried Egg','煎蛋',6,true,40),
('a5','addon','Bacon','煙肉',12,true,50),
('a6','addon','Avocado Slices','牛油果片',12,true,60),
('a7','addon','Danish Blue Cheese','丹麥藍芝士',16,true,70),
('a8','addon','Mushroom Schnitzel','炸素雞排',23,true,80),
('a9','addon','Angus Beef Patty','安格斯漢堡扒',33,true,90),
('sc1','sauce','Caramelized Garlic','焦糖蒜蓉醬',6,true,10),
('sc2','sauce','Smoked Jalapeño','煙燻墨西哥辣椒醬',8,true,20),
('sc3','sauce','Buffalo Sauce','水牛城辣醬',8,true,30),
('sc4','sauce','Tartar Sauce','秘製他他醬',8,true,40),
('sc5','sauce','Blue Cheese','藍紋芝士醬',8,true,50),
('cs1','combo_snack','Crispy Fries (M)','脆炸薯條 (M)',0,true,10),
('cs3','combo_snack','Crispy Fries (L)','脆炸薯條 (L)',4,true,20),
('cs2','combo_snack','Renkon Chips (M)','蓮藕脆片 (M)',0,true,30),
('cs4','combo_snack','Renkon Chips (L)','蓮藕脆片 (L)',4,true,40),
('cs5','combo_snack','Sweet Potato (M)','炸番薯條 (M)',6,true,50),
('cs6','combo_snack','Sweet Potato (L)','炸番薯條 (L)',11,true,60),
('cs7','combo_snack','Smoky Wings (3pcs)','煙燻雞翼 (3件)',6,true,70),
('cd1','combo_drink','Coke','可口可樂',0,true,10),
('cd1a','combo_drink','Coke No Sugar','零系可口可樂',0,true,20),
('cd2','combo_drink','Cream Soda','忌廉哥冰',0,true,30),
('cd3','combo_drink','Soda Water','梳打水',2,true,40),
('cd4','combo_drink','Cinnamon Iced Lemon Tea','肉桂凍檸茶',3,true,50),
('cd5h','combo_drink','Americano (Hot)','美式咖啡 (熱)',6,true,60),
('cd5c','combo_drink','Americano (Iced)','美式咖啡 (凍)',6,true,70),
('cd6h','combo_drink','Latte (Hot)','鮮奶咖啡 (熱)',8,true,80),
('cd6c','combo_drink','Latte (Iced)','鮮奶咖啡 (凍)',8,true,90),
('cd7h','combo_drink','Mocha (Hot)','朱古力咖啡 (熱)',8,true,100),
('cd7c','combo_drink','Mocha (Iced)','朱古力咖啡 (凍)',8,true,110),
('cd8h','combo_drink','Chocolate (Hot)','朱古力 (熱)',8,true,120),
('cd8c','combo_drink','Chocolate (Iced)','朱古力 (凍)',8,true,130),
('cd9','combo_drink','Avocado Smoothie with Oat','燕麥牛油果沙冰',18,true,140),
('cd10','combo_drink','Double Ovaltine Smoothie','雙重阿華田沙冰',20,true,150)
ON CONFLICT (id) DO UPDATE SET
  kind = EXCLUDED.kind,
  name_en = EXCLUDED.name_en,
  name_zh = EXCLUDED.name_zh,
  price = EXCLUDED.price,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

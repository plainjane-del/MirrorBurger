-- ============================================================
-- Mirror Burger：防止訪客自行改 payment_status → PAID
-- 用法：Supabase Dashboard → SQL Editor → New query → 貼上 → Run
-- ============================================================
-- 白話：網站用「anon key」連資料庫。以前如果 RLS 太鬆／冇開，
-- 任何人喺瀏覽器都可以叫 Supabase 改訂單。呢段會：
-- 1) 只准訪客新增 PENDING 單
-- 2) 訪客／anon 唔可以 UPDATE 訂單（廚房改狀態用 /api/kitchen-order-status）
-- 3) 只有 server（service_role / webhook）先可以改 payment_status
-- ============================================================

-- 開 RLS（如果已開會冇事）
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- 清走舊政策名稱（如果冇呢啲名會忽略）
DROP POLICY IF EXISTS "orders_select_all" ON public.orders;
DROP POLICY IF EXISTS "orders_insert_pending" ON public.orders;
DROP POLICY IF EXISTS "orders_update_kitchen" ON public.orders;
DROP POLICY IF EXISTS "orders_delete_none" ON public.orders;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.orders;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.orders;
DROP POLICY IF EXISTS "Enable update for all users" ON public.orders;
DROP POLICY IF EXISTS "Enable delete for all users" ON public.orders;

-- 讀取：廚房同付款確認頁需要讀訂單
CREATE POLICY "orders_select_all"
ON public.orders
FOR SELECT
TO anon, authenticated
USING (true);

-- 新增：只准建立未付款單（唔可以一 INSERT 就寫 PAID）
CREATE POLICY "orders_insert_pending"
ON public.orders
FOR INSERT
TO anon, authenticated
WITH CHECK (upper(coalesce(payment_status, '')) = 'PENDING');

-- ⚠️ 唔再開 anon/authenticated UPDATE policy。
-- 廚房狀態更新必須經 serverless：POST /api/kitchen-order-status（service_role）。
-- 付款狀態更新必須經：/api/kpay-notify、/api/mark-order-paid、cleanup 等。

-- 訪客唔准刪單
--（唔開 DELETE policy = 預設拒絕）

-- Trigger：anon / authenticated 絕對唔可以改 payment_status
-- service_role（webhook / cleanup API）可以改
CREATE OR REPLACE FUNCTION public.restrict_payment_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_role text := coalesce(auth.role(), '');
BEGIN
  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    IF jwt_role IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'payment_status can only be changed by the server (got role %)', jwt_role
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restrict_payment_status ON public.orders;
CREATE TRIGGER trg_restrict_payment_status
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.restrict_payment_status_change();

-- 可選檢查：跑完之後用 anon key 試 UPDATE 應該被 RLS 拒；
-- 試改 PAID 亦應該失敗；webhook 用 service role 改應該成功。

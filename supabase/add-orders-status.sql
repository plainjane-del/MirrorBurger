-- ============================================================
-- Mirror Burger：為 orders 表加廚房用 status 欄位
-- 用法：Supabase → SQL Editor → New query → 貼上 → Run
-- ============================================================
-- 之後：
--   payment_status = 付款（PENDING / PAID / CANCELLED）
--   status         = 廚房流程（PAID / PREPARING / READY / COMPLETED）
-- ============================================================

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS status text;

-- 已付款但未有廚房狀態嘅舊單，預設當「新單」
UPDATE public.orders
SET status = 'PAID'
WHERE upper(coalesce(payment_status, '')) = 'PAID'
  AND (status IS NULL OR btrim(status) = '');

-- 舊資料曾經把廚房狀態寫入 payment_status：抄返去 status
UPDATE public.orders
SET status = upper(payment_status)
WHERE upper(coalesce(payment_status, '')) IN ('PREPARING', 'READY', 'COMPLETED')
  AND (status IS NULL OR btrim(status) = '');

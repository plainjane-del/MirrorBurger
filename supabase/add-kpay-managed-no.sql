-- Optional: store KPay's managedOrderNo so we can query payment status
-- even if the merchant order number lookup fails.
-- Supabase → SQL Editor → paste → Run

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS kpay_managed_no text;

COMMENT ON COLUMN public.orders.kpay_managed_no IS 'KPay managedOrderNo returned when the checkout session is created';

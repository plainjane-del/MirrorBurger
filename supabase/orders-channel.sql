-- Additive: guest website still writes orders without channel (DB default = online).
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'online';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS pay_method text;
COMMENT ON COLUMN public.orders.channel IS 'online = guest website, pos = in-store cashier';
COMMENT ON COLUMN public.orders.pay_method IS 'pos payment: cash, fps, payme';

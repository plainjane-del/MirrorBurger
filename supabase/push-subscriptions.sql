-- ============================================================
-- Mirror Burger：廚房 PWA 推送訂閱表
-- Supabase → SQL Editor → Run
-- ============================================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id bigserial PRIMARY KEY,
    store_name text NOT NULL DEFAULT 'all',
    endpoint text NOT NULL UNIQUE,
    p256dh text NOT NULL,
    auth text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_store_name_idx
    ON public.push_subscriptions (store_name);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- 只用 service role（server）讀寫；anon 唔開政策 = 訪客唔可以亂改
DROP POLICY IF EXISTS "push_no_anon" ON public.push_subscriptions;

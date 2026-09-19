-- Acc: expense categories for HK SME-FRS-style income statement
-- Apply in Supabase SQL Editor after expenses.sql

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS notes text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expenses_category_chk'
  ) THEN
    ALTER TABLE public.expenses
      ADD CONSTRAINT expenses_category_chk
      CHECK (category IN (
        'cost_of_sales',
        'packaging',
        'rent_utilities',
        'repairs',
        'marketing',
        'admin',
        'other'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS expenses_category_idx ON public.expenses (category);

COMMENT ON COLUMN public.expenses.category IS
  'SME-FRS nature: cost_of_sales (食材) vs operating expense classes';

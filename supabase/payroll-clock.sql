-- ============================================================
-- Mirror Burger：員工打卡 / 出糧（Step 1 schema）
-- Supabase Dashboard → SQL Editor → Run
-- ============================================================
-- Stores in this project are identified by store_name text
-- (same as store_settings / orders / push_subscriptions):
--   'Sai Ying Pun'
--   'Fortress Hill'
--   'Tsuen Wan (Takeaway Only)'
-- Sensitive rows are service_role only. Anon cannot read PINs or pay.
-- ============================================================

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS payroll_rules jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.store_settings.payroll_rules IS
  'AI-generated payroll JSON for this store (rounding, late penalty, meal break, etc).';

CREATE TABLE IF NOT EXISTS public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_name text NOT NULL
    REFERENCES public.store_settings(store_name)
    CHECK (store_name IN (
      'Sai Ying Pun',
      'Fortress Hill',
      'Tsuen Wan (Takeaway Only)'
    )),
  name text NOT NULL,
  pin_code text NOT NULL,
  hourly_rate numeric(10, 2) NOT NULL CHECK (hourly_rate >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employees_store_pin_unique UNIQUE (store_name, pin_code)
);

COMMENT ON TABLE public.employees IS 'Per-store staff for clock-in. pin_code is unique within a store.';

CREATE TABLE IF NOT EXISTS public.timecards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_name text NOT NULL
    REFERENCES public.store_settings(store_name)
    CHECK (store_name IN (
      'Sai Ying Pun',
      'Fortress Hill',
      'Tsuen Wan (Takeaway Only)'
    )),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  clock_in_time timestamptz NOT NULL DEFAULT now(),
  clock_out_time timestamptz,
  total_hours numeric(10, 2),
  total_pay numeric(10, 2),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT timecards_out_after_in
    CHECK (clock_out_time IS NULL OR clock_out_time >= clock_in_time)
);

COMMENT ON TABLE public.timecards IS 'One open clock-in per employee (clock_out_time IS NULL) until they clock out.';

CREATE INDEX IF NOT EXISTS employees_store_name_idx
  ON public.employees (store_name);

CREATE INDEX IF NOT EXISTS timecards_store_name_idx
  ON public.timecards (store_name);

CREATE INDEX IF NOT EXISTS timecards_employee_id_idx
  ON public.timecards (employee_id);

CREATE UNIQUE INDEX IF NOT EXISTS timecards_one_open_per_employee
  ON public.timecards (employee_id)
  WHERE clock_out_time IS NULL;

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timecards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employees_no_anon" ON public.employees;
DROP POLICY IF EXISTS "timecards_no_anon" ON public.timecards;

REVOKE ALL ON TABLE public.employees FROM anon, authenticated, PUBLIC;
REVOKE ALL ON TABLE public.timecards FROM anon, authenticated, PUBLIC;

GRANT ALL ON TABLE public.employees TO postgres, service_role;
GRANT ALL ON TABLE public.timecards TO postgres, service_role;

-- payroll_rules stays readable with store_settings (hours/open status),
-- but only service_role can write it — same as the rest of store_settings.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.store_settings FROM anon, authenticated;
GRANT SELECT ON TABLE public.store_settings TO anon, authenticated;
GRANT ALL ON TABLE public.store_settings TO service_role;

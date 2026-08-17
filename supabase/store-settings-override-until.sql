-- Manual kitchen override: while override_until is in the future, is_open wins.
-- After that timestamp, website/kitchen follow published opening hours.

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS override_until timestamptz;

COMMENT ON COLUMN public.store_settings.override_until IS
  'When set in the future, is_open is a manual override until this timestamp; afterwards hours take over.';

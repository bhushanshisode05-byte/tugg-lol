ALTER TABLE public.dodo_orders
  ADD COLUMN IF NOT EXISTS moderation_failures integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS moderation_first_failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS moderation_alerted_at timestamptz;
COMMENT ON COLUMN public.dodo_orders.moderation_failures IS 'Times moderation was unavailable (not a verdict) for this paid matchup order; retried by reconciliation.';
COMMENT ON COLUMN public.dodo_orders.moderation_first_failed_at IS 'First moderation-unavailable attempt for this order.';
COMMENT ON COLUMN public.dodo_orders.moderation_alerted_at IS 'When the owner was alerted that moderation stayed unavailable; set once.';
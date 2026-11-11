-- Payment orders (including the private buyer email) are read and written only by the service role.
-- RLS already returns no rows to visitors; removing the table privileges makes any attempt a permission error.
REVOKE ALL ON public.dodo_orders FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.dodo_orders TO service_role;
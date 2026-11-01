ALTER TABLE public.dodo_orders ADD COLUMN processing_until timestamptz;
CREATE OR REPLACE FUNCTION public.claim_dodo_order(p_order uuid,p_payment text,p_env text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 UPDATE dodo_orders SET processing_until=now()+interval '2 minutes',payment_id=p_payment WHERE id=p_order AND environment=p_env AND (payment_id IS NULL OR payment_id=p_payment) AND (processing_until IS NULL OR processing_until<now()); RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.claim_dodo_order(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_dodo_order(uuid,text,text) TO service_role;
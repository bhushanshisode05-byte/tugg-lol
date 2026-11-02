CREATE TABLE public.payglocal_funnel_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), funnel_id uuid NOT NULL,
 environment text NOT NULL CHECK(environment IN ('sandbox','live')),
 step text NOT NULL CHECK(step IN ('viewed','bundle_selected','turnstile_passed','opened','completed','cancelled','abandoned','failed')),
 bundle integer NOT NULL CHECK(bundle IN (5,10,25)), mode text NOT NULL DEFAULT 'none' CHECK(mode IN ('none','drawer','redirect')),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(funnel_id,environment,step,bundle,mode)
);
GRANT ALL ON public.payglocal_funnel_events TO service_role;
ALTER TABLE public.payglocal_funnel_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX payglocal_funnel_time ON public.payglocal_funnel_events(created_at,environment,step);
ALTER TABLE public.payglocal_orders ADD COLUMN funnel_id uuid;
CREATE FUNCTION public.payglocal_funnel_terminal() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.quantity > 0 AND NEW.funnel_id IS NOT NULL AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('paid','failed','expired') THEN
 INSERT INTO public.payglocal_funnel_events(funnel_id,environment,step,bundle) VALUES(NEW.funnel_id,NEW.environment,CASE WHEN NEW.status='paid' THEN 'completed' ELSE 'failed' END,NEW.quantity) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.payglocal_funnel_terminal() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER payglocal_funnel_terminal AFTER UPDATE OF status ON public.payglocal_orders FOR EACH ROW EXECUTE FUNCTION public.payglocal_funnel_terminal();
CREATE FUNCTION public.tugg_payglocal_funnel() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(t),'[]'::jsonb) FROM (
 SELECT d.days,e.environment,e.step,count(DISTINCT e.funnel_id) AS count FROM public.payglocal_funnel_events e CROSS JOIN (VALUES(7),(30)) d(days)
 WHERE e.created_at>=now()-d.days*interval '1 day' GROUP BY d.days,e.environment,e.step
 ) t
$$;
REVOKE ALL ON FUNCTION public.tugg_payglocal_funnel() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tugg_payglocal_funnel() TO service_role;
CREATE FUNCTION public.payglocal_reconcile_due(p_env text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE expired_count integer; result jsonb;
BEGIN
 UPDATE public.payglocal_orders SET status='expired',reconcile_result='expiry_window',reconciled_at=now()
 WHERE environment=p_env AND status='pending' AND created_at<=now()-interval '24 hours' AND (processing_until IS NULL OR processing_until<now());
 GET DIAGNOSTICS expired_count=ROW_COUNT;
 SELECT coalesce(jsonb_agg(t),'[]'::jsonb) INTO result FROM (
 SELECT id,reconcile_count FROM public.payglocal_orders
 WHERE environment=p_env AND created_at<now()-interval '5 minutes' AND created_at>now()-interval '24 hours'
 AND (processing_until IS NULL OR processing_until<now())
 AND (status='pending' OR (status='paid' AND quantity=0 AND refund_status IS NULL AND (review_allowed IS NULL OR review_allowed=false)))
 AND (reconciled_at IS NULL OR reconciled_at<=now()-CASE WHEN created_at>now()-interval '1 hour' THEN interval '5 minutes' WHEN created_at>now()-interval '6 hours' THEN interval '15 minutes' ELSE interval '1 hour' END)
 ORDER BY reconciled_at NULLS FIRST,created_at LIMIT 10
 ) t;
 RETURN jsonb_build_object('rows',result,'expired',expired_count);
END $$;
REVOKE ALL ON FUNCTION public.payglocal_reconcile_due(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.payglocal_reconcile_due(text) TO service_role;
CREATE INDEX payglocal_pending_age ON public.payglocal_orders(environment,created_at,reconciled_at) WHERE status='pending';
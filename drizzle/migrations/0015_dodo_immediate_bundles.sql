ALTER TABLE public.dodo_orders ADD COLUMN side_id uuid REFERENCES public.sides(id), ADD COLUMN quantity integer NOT NULL DEFAULT 0, ADD COLUMN display_name text NOT NULL DEFAULT '', ADD COLUMN shout_out text NOT NULL DEFAULT '', ADD COLUMN funnel_id uuid, ADD COLUMN paid_at timestamptz, ADD COLUMN provider_status text, ADD COLUMN processing_key uuid, ADD COLUMN reconcile_count integer NOT NULL DEFAULT 0, ADD COLUMN reconciled_at timestamptz, ADD COLUMN reconcile_result text;
ALTER TABLE public.dodo_orders ADD CONSTRAINT dodo_immediate_bundle_shape CHECK (side_id IS NULL OR (wallet_id IS NULL AND matchup_id IS NULL AND ((kind='pull_5' AND quantity=5 AND expected_cents=500) OR (kind='pull_10' AND quantity=10 AND expected_cents=1000) OR (kind='pull_25' AND quantity=25 AND expected_cents=2500))));
COMMENT ON TABLE public.pull_wallets IS 'DEPRECATED: retained for rollback records only; wallet application endpoints are disabled.';
CREATE TABLE public.dodo_bundle_applications (order_id uuid PRIMARY KEY REFERENCES public.dodo_orders(id), payment_id text NOT NULL UNIQUE, pull_id uuid NOT NULL UNIQUE REFERENCES public.pulls(id), quantity integer NOT NULL CHECK(quantity IN (5,10,25)), amount_cents integer NOT NULL CHECK(amount_cents=quantity*100), environment text NOT NULL CHECK(environment IN ('sandbox','live')), created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.dodo_bundle_applications TO service_role;
ALTER TABLE public.dodo_bundle_applications ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.dodo_funnel_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), funnel_id uuid NOT NULL, environment text NOT NULL CHECK(environment IN ('sandbox','live')), step text NOT NULL CHECK(step IN ('viewed','bundle_selected','turnstile_passed','opened','completed','cancelled','abandoned','failed')), bundle integer NOT NULL CHECK(bundle IN (5,10,25)), mode text NOT NULL DEFAULT 'none' CHECK(mode IN ('none','drawer','redirect')), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(funnel_id,environment,step,bundle,mode));
GRANT ALL ON public.dodo_funnel_events TO service_role;
ALTER TABLE public.dodo_funnel_events ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.apply_dodo_bundle(p_order uuid,p_payment text,p_env text,p_cents integer,p_country text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o dodo_orders; result jsonb; pid uuid;
BEGIN
 SELECT * INTO o FROM dodo_orders WHERE id=p_order FOR UPDATE;
 IF NOT FOUND OR o.environment<>p_env OR o.expected_cents<>p_cents OR o.payment_id IS DISTINCT FROM p_payment OR o.wallet_id IS NOT NULL OR o.side_id IS NULL OR o.quantity NOT IN (5,10,25) OR o.expected_cents<>o.quantity*100 THEN RAISE EXCEPTION 'Payment does not match immediate order'; END IF;
 IF o.status='paid' THEN RETURN jsonb_build_object('duplicate',true,'quantity',o.quantity); END IF;
 IF o.status<>'pending' THEN RAISE EXCEPTION 'Terminal unpaid order cannot be paid'; END IF;
 IF NOT EXISTS(SELECT 1 FROM sides s JOIN matchups m ON m.id=s.matchup_id WHERE s.id=o.side_id AND m.status='active') THEN RAISE EXCEPTION 'Matchup not active'; END IF;
 result:=record_pull('dodo:'||o.id::text,o.side_id,o.expected_cents,o.display_name,o.shout_out,p_country,p_env);
 IF (result->>'duplicate')::boolean THEN RAISE EXCEPTION 'Unexpected existing pull'; END IF;
 SELECT id INTO pid FROM pulls WHERE stripe_session_id='dodo:'||o.id::text;
 INSERT INTO dodo_bundle_applications(order_id,payment_id,pull_id,quantity,amount_cents,environment) VALUES(o.id,p_payment,pid,o.quantity,o.expected_cents,p_env);
 UPDATE dodo_orders SET status='paid',paid_at=now(),provider_status='succeeded' WHERE id=o.id;
 RETURN jsonb_build_object('duplicate',false,'quantity',o.quantity);
END $$;
REVOKE ALL ON FUNCTION public.apply_dodo_bundle(uuid,text,text,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_dodo_bundle(uuid,text,text,integer,text) TO service_role;
CREATE FUNCTION public.claim_dodo_immediate_order(p_order uuid,p_payment text,p_env text,p_key uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE dodo_orders SET processing_until=now()+interval '2 minutes',processing_key=p_key,payment_id=p_payment WHERE id=p_order AND environment=p_env AND wallet_id IS NULL AND (payment_id IS NULL OR payment_id=p_payment) AND (processing_until IS NULL OR processing_until<now()); RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.claim_dodo_immediate_order(uuid,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_dodo_immediate_order(uuid,text,text,uuid) TO service_role;
CREATE FUNCTION public.dodo_funnel_terminal() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.quantity>0 AND NEW.funnel_id IS NOT NULL AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('paid','failed','expired') THEN
 INSERT INTO dodo_funnel_events(funnel_id,environment,step,bundle) VALUES(NEW.funnel_id,NEW.environment,CASE WHEN NEW.status='paid' THEN 'completed' ELSE 'failed' END,NEW.quantity) ON CONFLICT DO NOTHING;
 END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.dodo_funnel_terminal() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER dodo_funnel_terminal AFTER UPDATE OF status ON public.dodo_orders FOR EACH ROW EXECUTE FUNCTION public.dodo_funnel_terminal();
CREATE FUNCTION public.tugg_dodo_funnel() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT coalesce(jsonb_agg(t),'[]'::jsonb) FROM (SELECT d.days,e.environment,e.step,count(DISTINCT e.funnel_id) AS count FROM dodo_funnel_events e CROSS JOIN (VALUES(7),(30)) d(days) WHERE e.created_at>=now()-d.days*interval '1 day' GROUP BY d.days,e.environment,e.step) t $$;
REVOKE ALL ON FUNCTION public.tugg_dodo_funnel() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tugg_dodo_funnel() TO service_role;
CREATE FUNCTION public.dodo_reconcile_due(p_env text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE expired_count integer; result jsonb;
BEGIN
 UPDATE dodo_orders SET status='expired',reconcile_result='expiry_window',reconciled_at=now() WHERE environment=p_env AND wallet_id IS NULL AND status='pending' AND created_at<=now()-interval '24 hours' AND (processing_until IS NULL OR processing_until<now()); GET DIAGNOSTICS expired_count=ROW_COUNT;
 SELECT coalesce(jsonb_agg(t),'[]'::jsonb) INTO result FROM (SELECT id,checkout_id,payment_id,reconcile_count FROM dodo_orders WHERE environment=p_env AND wallet_id IS NULL AND checkout_id IS NOT NULL AND created_at<now()-interval '5 minutes' AND created_at>now()-interval '24 hours' AND (processing_until IS NULL OR processing_until<now()) AND (status='pending' OR (status='paid' AND quantity=0 AND refund_status IS NULL AND review_allowed IS DISTINCT FROM true)) AND (reconciled_at IS NULL OR reconciled_at<=now()-CASE WHEN created_at>now()-interval '1 hour' THEN interval '5 minutes' WHEN created_at>now()-interval '6 hours' THEN interval '15 minutes' ELSE interval '1 hour' END) ORDER BY reconciled_at NULLS FIRST,created_at LIMIT 10) t;
 RETURN jsonb_build_object('rows',result,'expired',expired_count);
END $$;
REVOKE ALL ON FUNCTION public.dodo_reconcile_due(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dodo_reconcile_due(text) TO service_role;
CREATE INDEX dodo_pending_age ON public.dodo_orders(environment,created_at,reconciled_at) WHERE status='pending';
CREATE OR REPLACE FUNCTION public.tugg_dodo_summary() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT jsonb_build_object('environments',coalesce(jsonb_agg(t),'[]'::jsonb)) FROM (SELECT environment,coalesce(sum(expected_cents) FILTER(WHERE status='paid'),0) AS revenue_cents,count(*) FILTER(WHERE status='paid' AND side_id IS NOT NULL) AS bundles_sold,coalesce(sum(quantity) FILTER(WHERE status='paid'),0) AS pulls_applied,count(*) FILTER(WHERE refund_status IS NOT NULL) AS refunds,count(*) FILTER(WHERE refund_status='succeeded') AS refunds_succeeded,count(*) FILTER(WHERE refund_status IN ('needs_review','failed','requesting')) AS refund_reviews,count(*) FILTER(WHERE status='pending') AS pending,count(*) FILTER(WHERE status='expired') AS expired,coalesce(sum(reconcile_count),0) AS reconcile_checks,count(*) FILTER(WHERE reconcile_result='paid') AS reconciled_paid,count(*) FILTER(WHERE reconcile_result IN ('expired','expiry_window')) AS reconciled_expired FROM dodo_orders WHERE wallet_id IS NULL GROUP BY environment) t $$;
REVOKE ALL ON FUNCTION public.tugg_dodo_summary() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tugg_dodo_summary() TO service_role;
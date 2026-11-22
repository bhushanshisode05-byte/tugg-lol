ALTER TABLE public.dodo_orders DROP CONSTRAINT dodo_orders_kind_check;
ALTER TABLE public.dodo_orders ADD CONSTRAINT dodo_orders_kind_check CHECK (kind IN ('pull_5','pull_10','pull_25','pull_custom','standard','featured','basket'));
ALTER TABLE public.dodo_orders DROP CONSTRAINT dodo_immediate_bundle_shape;
ALTER TABLE public.dodo_orders ADD CONSTRAINT dodo_immediate_bundle_shape CHECK (side_id IS NULL OR (wallet_id IS NULL AND matchup_id IS NULL AND ((kind='pull_5' AND quantity=5 AND expected_cents=500) OR (kind='pull_10' AND quantity=10 AND expected_cents=1000) OR (kind='pull_25' AND quantity=25 AND expected_cents=2500) OR (kind='pull_custom' AND expected_cents BETWEEN 500 AND 100000 AND expected_cents%100=0 AND quantity=expected_cents/100))));
ALTER TABLE public.dodo_orders ADD CONSTRAINT dodo_custom_shape CHECK (kind<>'pull_custom' OR (side_id IS NOT NULL AND wallet_id IS NULL AND matchup_id IS NULL AND expected_cents BETWEEN 500 AND 100000 AND expected_cents%100=0 AND quantity=expected_cents/100));
ALTER TABLE public.dodo_bundle_applications DROP CONSTRAINT dodo_bundle_applications_quantity_check;
ALTER TABLE public.dodo_bundle_applications ADD CONSTRAINT dodo_bundle_applications_quantity_check CHECK (quantity BETWEEN 5 AND 1000);
ALTER TABLE public.dodo_funnel_events DROP CONSTRAINT dodo_funnel_events_bundle_check;
ALTER TABLE public.dodo_funnel_events ADD CONSTRAINT dodo_funnel_events_bundle_check CHECK (bundle BETWEEN 1 AND 1000);
CREATE OR REPLACE FUNCTION public.apply_dodo_bundle(p_order uuid,p_payment text,p_env text,p_cents integer,p_country text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o dodo_orders; result jsonb; pid uuid; confirmed_pulls integer;
BEGIN
 SELECT * INTO o FROM dodo_orders WHERE id=p_order FOR UPDATE;
 IF NOT FOUND OR o.environment<>p_env OR o.expected_cents<>p_cents OR o.payment_id IS DISTINCT FROM p_payment OR o.wallet_id IS NOT NULL OR o.side_id IS NULL OR o.expected_cents<>o.quantity*100 THEN RAISE EXCEPTION 'Payment does not match immediate order'; END IF;
 IF NOT ((o.kind='pull_5' AND p_cents=500 AND o.quantity=5) OR (o.kind='pull_10' AND p_cents=1000 AND o.quantity=10) OR (o.kind='pull_25' AND p_cents=2500 AND o.quantity=25) OR (o.kind='pull_custom' AND p_cents BETWEEN 500 AND 100000 AND p_cents%100=0)) THEN RAISE EXCEPTION 'Payment does not match immediate order'; END IF;
 confirmed_pulls:=p_cents/100;
 IF o.status='paid' THEN RETURN jsonb_build_object('duplicate',true,'quantity',confirmed_pulls); END IF;
 IF o.status<>'pending' THEN RAISE EXCEPTION 'Terminal unpaid order cannot be paid'; END IF;
 IF NOT EXISTS(SELECT 1 FROM sides s JOIN matchups m ON m.id=s.matchup_id WHERE s.id=o.side_id AND m.status='active') THEN RAISE EXCEPTION 'Matchup not active'; END IF;
 result:=record_pull('dodo:'||o.id::text,o.side_id,p_cents,o.display_name,o.shout_out,p_country,p_env);
 IF (result->>'duplicate')::boolean THEN RAISE EXCEPTION 'Unexpected existing pull'; END IF;
 SELECT id INTO pid FROM pulls WHERE stripe_session_id='dodo:'||o.id::text;
 INSERT INTO dodo_bundle_applications(order_id,payment_id,pull_id,quantity,amount_cents,environment) VALUES(o.id,p_payment,pid,confirmed_pulls,p_cents,p_env);
 UPDATE dodo_orders SET status='paid',quantity=confirmed_pulls,paid_at=now(),provider_status='succeeded' WHERE id=o.id;
 RETURN jsonb_build_object('duplicate',false,'quantity',confirmed_pulls);
END $$;
REVOKE ALL ON FUNCTION public.apply_dodo_bundle(uuid,text,text,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_dodo_bundle(uuid,text,text,integer,text) TO service_role;
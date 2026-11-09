ALTER TABLE public.dodo_orders DROP CONSTRAINT dodo_orders_kind_check;
ALTER TABLE public.dodo_orders ADD CONSTRAINT dodo_orders_kind_check CHECK (kind IN ('pull_5','pull_10','pull_25','standard','featured','basket'));
ALTER TABLE public.dodo_orders ADD COLUMN basket_refund_cents integer NOT NULL DEFAULT 0 CHECK (basket_refund_cents >= 0);
ALTER TABLE public.dodo_orders ADD CONSTRAINT dodo_basket_shape CHECK (kind <> 'basket' OR (wallet_id IS NULL AND side_id IS NULL AND matchup_id IS NULL AND quantity BETWEEN 5 AND 500 AND expected_cents = quantity * 100 AND basket_refund_cents <= expected_cents));
ALTER TABLE public.dodo_funnel_events DROP CONSTRAINT dodo_funnel_events_bundle_check;
ALTER TABLE public.dodo_funnel_events ADD CONSTRAINT dodo_funnel_events_bundle_check CHECK (bundle BETWEEN 1 AND 500);

CREATE TABLE public.dodo_basket_lines (
  order_id uuid NOT NULL REFERENCES public.dodo_orders(id),
  position smallint NOT NULL CHECK (position BETWEEN 0 AND 9),
  matchup_id uuid NOT NULL,
  side_id uuid NOT NULL,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 500),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','refund_due')),
  pull_id uuid UNIQUE REFERENCES public.pulls(id),
  applied_at timestamptz,
  PRIMARY KEY (order_id, position),
  UNIQUE (order_id, matchup_id),
  CHECK ((status = 'applied') = (pull_id IS NOT NULL))
);
REVOKE ALL ON public.dodo_basket_lines FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.dodo_basket_lines TO service_role;
ALTER TABLE public.dodo_basket_lines ENABLE ROW LEVEL SECURITY;

-- Creates a pending basket order and its lines together; re-validates everything the browser sent.
CREATE FUNCTION public.create_dodo_basket(p_order uuid, p_env text, p_product text, p_lines jsonb, p_name text, p_shout text, p_funnel uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer; total integer := 0; e jsonb; i integer := 0; q integer; ms text; sm uuid;
BEGIN
  IF p_env NOT IN ('sandbox','live') OR coalesce(p_product,'') = '' THEN RAISE EXCEPTION 'basket:invalid'; END IF;
  IF jsonb_typeof(p_lines) <> 'array' THEN RAISE EXCEPTION 'basket:invalid'; END IF;
  n := jsonb_array_length(p_lines);
  IF n < 1 OR n > 10 THEN RAISE EXCEPTION 'basket:too_many_matchups'; END IF;
  IF (SELECT count(DISTINCT x->>'matchup_id') FROM jsonb_array_elements(p_lines) x) <> n THEN RAISE EXCEPTION 'basket:duplicate_matchup'; END IF;
  FOR e IN SELECT x FROM jsonb_array_elements(p_lines) x LOOP
    IF jsonb_typeof(e->'quantity') <> 'number' OR (e->>'quantity') !~ '^[1-9][0-9]{0,2}$' THEN RAISE EXCEPTION 'basket:invalid'; END IF;
    q := (e->>'quantity')::integer;
    IF q > 500 THEN RAISE EXCEPTION 'basket:invalid'; END IF;
    SELECT s.matchup_id, m.status INTO sm, ms FROM sides s JOIN matchups m ON m.id = s.matchup_id WHERE s.id = (e->>'side_id')::uuid;
    IF NOT FOUND OR sm <> (e->>'matchup_id')::uuid THEN RAISE EXCEPTION 'basket:side_mismatch'; END IF;
    IF ms <> 'active' THEN RAISE EXCEPTION 'basket:matchup_unavailable'; END IF;
    total := total + q;
  END LOOP;
  IF total < 5 OR total > 500 THEN RAISE EXCEPTION 'basket:amount'; END IF;
  INSERT INTO dodo_orders(id, environment, kind, product_id, expected_cents, quantity, display_name, shout_out, funnel_id)
  VALUES (p_order, p_env, 'basket', p_product, total * 100, total, left(coalesce(p_name,''),40), left(coalesce(p_shout,''),80), p_funnel);
  FOR e IN SELECT x FROM jsonb_array_elements(p_lines) x LOOP
    INSERT INTO dodo_basket_lines(order_id, position, matchup_id, side_id, quantity)
    VALUES (p_order, i, (e->>'matchup_id')::uuid, (e->>'side_id')::uuid, (e->>'quantity')::integer);
    i := i + 1;
  END LOOP;
  RETURN total;
END $$;
REVOKE ALL ON FUNCTION public.create_dodo_basket(uuid,text,text,jsonb,text,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_dodo_basket(uuid,text,text,jsonb,text,text,uuid) TO service_role;

-- Applies a verified basket in one locked transaction. Integrity failures apply nothing and are held for review.
-- Lines whose matchup is no longer active are marked for a partial refund; others go to that matchup's open round.
CREATE FUNCTION public.apply_dodo_basket(p_order uuid, p_payment text, p_env text, p_facts jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o dodo_orders; l dodo_basket_lines; n integer; reason text; refund integer := 0; applied integer := 0; r jsonb; pid uuid; ms text; lines jsonb := p_facts->'lines'; meta_sum numeric;
BEGIN
  SELECT * INTO o FROM dodo_orders WHERE id = p_order FOR UPDATE;
  IF NOT FOUND OR o.kind <> 'basket' OR o.environment <> p_env OR o.wallet_id IS NOT NULL OR o.payment_id IS DISTINCT FROM p_payment THEN
    RAISE EXCEPTION 'Payment does not match basket order';
  END IF;
  IF o.status = 'paid' THEN RETURN jsonb_build_object('duplicate', true, 'refund_cents', o.basket_refund_cents); END IF;
  IF o.status = 'needs_review' THEN RETURN jsonb_build_object('duplicate', true, 'review', true); END IF;
  IF o.status <> 'pending' THEN RAISE EXCEPTION 'Terminal unpaid order cannot be paid'; END IF;
  SELECT count(*) INTO n FROM dodo_basket_lines WHERE order_id = o.id;
  IF p_facts->>'currency' IS DISTINCT FROM 'USD' THEN reason := 'currency';
  ELSIF p_facts->>'cents' IS DISTINCT FROM o.expected_cents::text OR o.expected_cents <> o.quantity * 100 THEN reason := 'amount';
  ELSIF p_facts->>'cart_lines' IS DISTINCT FROM '1' OR p_facts->>'product_id' IS DISTINCT FROM o.product_id OR p_facts->>'cart_quantity' IS DISTINCT FROM o.quantity::text THEN reason := 'cart';
  ELSIF p_facts->>'checkout_id' IS DISTINCT FROM o.checkout_id THEN reason := 'checkout_session';
  ELSIF lines IS NULL OR jsonb_typeof(lines) <> 'array' OR p_facts->>'meta_pulls' IS NULL THEN reason := 'allocation_malformed';
  ELSE
    SELECT sum(CASE WHEN jsonb_typeof(x->'quantity') = 'number' THEN (x->>'quantity')::numeric ELSE NULL END) INTO meta_sum FROM jsonb_array_elements(lines) x;
    IF p_facts->>'meta_pulls' <> o.quantity::text OR meta_sum IS DISTINCT FROM o.quantity THEN reason := 'allocation_sum';
    ELSIF (SELECT count(DISTINCT x->>'matchup_id') FROM jsonb_array_elements(lines) x) <> jsonb_array_length(lines) THEN reason := 'duplicate_matchup';
    ELSIF jsonb_array_length(lines) <> n OR n < 1 OR n > 10 OR EXISTS (
      SELECT 1 FROM dodo_basket_lines b WHERE b.order_id = o.id AND (
        lines->(b.position::int)->>'matchup_id' IS DISTINCT FROM b.matchup_id::text OR
        lines->(b.position::int)->>'side_id' IS DISTINCT FROM b.side_id::text OR
        lines->(b.position::int)->>'quantity' IS DISTINCT FROM b.quantity::text)) THEN reason := 'allocation_mismatch';
    ELSIF (SELECT sum(quantity) FROM dodo_basket_lines WHERE order_id = o.id) <> o.quantity THEN reason := 'allocation_sum';
    ELSIF EXISTS (SELECT 1 FROM dodo_basket_lines b JOIN matchups m ON m.id = b.matchup_id LEFT JOIN sides s ON s.id = b.side_id
                  WHERE b.order_id = o.id AND (s.id IS NULL OR s.matchup_id <> b.matchup_id)) THEN reason := 'side_mismatch';
    END IF;
  END IF;
  IF reason IS NOT NULL THEN
    UPDATE dodo_orders SET status = 'needs_review', review_reason = reason, provider_status = 'succeeded' WHERE id = o.id;
    INSERT INTO events(kind, detail) VALUES ('dodo_basket_review', jsonb_build_object('orderId', o.id, 'reason', reason, 'environment', p_env));
    RETURN jsonb_build_object('duplicate', false, 'review', true, 'reason', reason);
  END IF;
  FOR l IN SELECT * FROM dodo_basket_lines WHERE order_id = o.id ORDER BY position FOR UPDATE LOOP
    SELECT status INTO ms FROM matchups WHERE id = l.matchup_id FOR SHARE;
    IF NOT FOUND OR ms <> 'active' THEN
      UPDATE dodo_basket_lines SET status = 'refund_due' WHERE order_id = o.id AND position = l.position;
      refund := refund + l.quantity * 100;
    ELSE
      r := record_pull('dodo:' || o.id::text || ':' || l.position, l.side_id, l.quantity * 100, o.display_name, o.shout_out, coalesce(p_facts->>'country',''), p_env);
      IF (r->>'duplicate')::boolean THEN RAISE EXCEPTION 'Unexpected existing pull'; END IF;
      SELECT id INTO pid FROM pulls WHERE stripe_session_id = 'dodo:' || o.id::text || ':' || l.position;
      UPDATE dodo_basket_lines SET status = 'applied', pull_id = pid, applied_at = now() WHERE order_id = o.id AND position = l.position;
      applied := applied + l.quantity;
    END IF;
  END LOOP;
  UPDATE dodo_orders SET status = 'paid', paid_at = now(), provider_status = 'succeeded', basket_refund_cents = refund WHERE id = o.id;
  IF refund > 0 THEN
    INSERT INTO events(kind, detail) VALUES ('dodo_basket_partial_refund_due', jsonb_build_object('orderId', o.id, 'refundCents', refund, 'environment', p_env));
  END IF;
  RETURN jsonb_build_object('duplicate', false, 'applied_pulls', applied, 'refund_cents', refund);
END $$;
REVOKE ALL ON FUNCTION public.apply_dodo_basket(uuid,text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_dodo_basket(uuid,text,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.dodo_reconcile_due(p_env text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE expired_count integer; result jsonb;
BEGIN
 UPDATE dodo_orders SET status='expired',reconcile_result='expiry_window',reconciled_at=now() WHERE environment=p_env AND wallet_id IS NULL AND status='pending' AND created_at<=now()-interval '24 hours' AND (processing_until IS NULL OR processing_until<now()); GET DIAGNOSTICS expired_count=ROW_COUNT;
 SELECT coalesce(jsonb_agg(t),'[]'::jsonb) INTO result FROM (SELECT id,checkout_id,payment_id,reconcile_count FROM dodo_orders WHERE environment=p_env AND wallet_id IS NULL AND checkout_id IS NOT NULL AND created_at<now()-interval '5 minutes' AND created_at>now()-interval '24 hours' AND (processing_until IS NULL OR processing_until<now()) AND (status='pending' OR (status='paid' AND quantity=0 AND refund_status IS NULL AND review_allowed IS DISTINCT FROM true) OR (status='paid' AND kind='basket' AND basket_refund_cents>0 AND refund_status IS NULL)) AND (reconciled_at IS NULL OR reconciled_at<=now()-CASE WHEN created_at>now()-interval '1 hour' THEN interval '5 minutes' WHEN created_at>now()-interval '6 hours' THEN interval '15 minutes' ELSE interval '1 hour' END) ORDER BY reconciled_at NULLS FIRST,created_at LIMIT 10) t;
 RETURN jsonb_build_object('rows',result,'expired',expired_count);
END $$;

CREATE OR REPLACE FUNCTION public.tugg_dodo_summary() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT jsonb_build_object('environments',coalesce(jsonb_agg(t),'[]'::jsonb)) FROM (SELECT environment,coalesce(sum(expected_cents) FILTER(WHERE status='paid'),0) AS revenue_cents,count(*) FILTER(WHERE status='paid' AND (side_id IS NOT NULL OR kind='basket')) AS bundles_sold,coalesce(sum(quantity) FILTER(WHERE status='paid'),0) - coalesce(sum(basket_refund_cents/100) FILTER(WHERE status='paid'),0) AS pulls_applied,count(*) FILTER(WHERE refund_status IS NOT NULL) AS refunds,count(*) FILTER(WHERE refund_status='succeeded') AS refunds_succeeded,count(*) FILTER(WHERE refund_status IN ('needs_review','failed','requesting')) AS refund_reviews,count(*) FILTER(WHERE status='pending') AS pending,count(*) FILTER(WHERE status='expired') AS expired,coalesce(sum(reconcile_count),0) AS reconcile_checks,count(*) FILTER(WHERE reconcile_result='paid') AS reconciled_paid,count(*) FILTER(WHERE reconcile_result IN ('expired','expiry_window')) AS reconciled_expired,count(*) FILTER(WHERE status='paid' AND kind='basket') AS baskets_sold,coalesce(sum(basket_refund_cents) FILTER(WHERE status='paid'),0) AS basket_refund_cents,count(*) FILTER(WHERE status='needs_review') AS basket_reviews FROM dodo_orders WHERE wallet_id IS NULL GROUP BY environment) t $$;
REVOKE ALL ON FUNCTION public.tugg_dodo_summary() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tugg_dodo_summary() TO service_role;
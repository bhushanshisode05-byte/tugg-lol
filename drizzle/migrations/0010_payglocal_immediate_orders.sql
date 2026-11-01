CREATE TABLE public.payglocal_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), environment text NOT NULL CHECK(environment IN ('sandbox','live')),
 merchant_unique_id text NOT NULL UNIQUE CHECK(merchant_unique_id ~ '^[A-Za-z0-9]{15,40}$'),
 kind text NOT NULL CHECK(kind IN ('pull_5','pull_10','pull_25','standard','featured')),
 expected_cents integer NOT NULL, quantity integer NOT NULL DEFAULT 0,
 side_id uuid REFERENCES public.sides(id), matchup_id uuid REFERENCES public.matchups(id),
 display_name text NOT NULL DEFAULT '', shout_out text NOT NULL DEFAULT '', billing_country text NOT NULL DEFAULT '',
 return_path text NOT NULL, gid text UNIQUE, status_url text,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','failed','expired')),
 provider_status text, paid_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 processing_until timestamptz, processing_key uuid, reconcile_count integer NOT NULL DEFAULT 0,
 reconciled_at timestamptz, reconcile_result text, review_allowed boolean, review_reason text,
 refund_status text, refund_gid text,
 CHECK((kind='pull_5' AND expected_cents=500 AND quantity=5 AND side_id IS NOT NULL) OR
 (kind='pull_10' AND expected_cents=1000 AND quantity=10 AND side_id IS NOT NULL) OR
 (kind='pull_25' AND expected_cents=2500 AND quantity=25 AND side_id IS NOT NULL) OR
 (kind='standard' AND expected_cents=900 AND quantity=0 AND matchup_id IS NOT NULL) OR
 (kind='featured' AND expected_cents=2900 AND quantity=0 AND matchup_id IS NOT NULL))
);
GRANT ALL ON public.payglocal_orders TO service_role;
ALTER TABLE public.payglocal_orders ENABLE ROW LEVEL SECURITY;
CREATE INDEX payglocal_pending ON public.payglocal_orders(created_at) WHERE status='pending';
CREATE TABLE public.payglocal_ledger (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES public.payglocal_orders(id),
 gid text NOT NULL, entry_type text NOT NULL CHECK(entry_type IN ('credit','debit')), quantity integer NOT NULL CHECK(quantity IN (5,10,25)),
 amount_cents integer NOT NULL CHECK(amount_cents=quantity*100), pull_id uuid REFERENCES public.pulls(id),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(order_id,entry_type), UNIQUE(gid,entry_type)
);
GRANT ALL ON public.payglocal_ledger TO service_role;
ALTER TABLE public.payglocal_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creators ADD COLUMN payglocal_order_id uuid REFERENCES public.payglocal_orders(id);
CREATE UNIQUE INDEX creators_payglocal_order ON public.creators(payglocal_order_id) WHERE payglocal_order_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.apply_payglocal_payment(p_order uuid,p_gid text,p_env text,p_cents integer,p_country text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
 DECLARE o payglocal_orders; result jsonb; pid uuid;
 BEGIN
 SELECT * INTO o FROM payglocal_orders WHERE id=p_order FOR UPDATE;
 IF NOT FOUND OR o.environment<>p_env OR o.expected_cents<>p_cents OR o.gid IS DISTINCT FROM p_gid THEN RAISE EXCEPTION 'Payment does not match order'; END IF;
 IF o.status='paid' THEN RETURN jsonb_build_object('duplicate',true); END IF;
 IF o.quantity>0 THEN
 IF NOT EXISTS(SELECT 1 FROM sides s JOIN matchups m ON m.id=s.matchup_id WHERE s.id=o.side_id AND m.status='active') THEN RAISE EXCEPTION 'Matchup not active'; END IF;
 INSERT INTO payglocal_ledger(order_id,gid,entry_type,quantity,amount_cents) VALUES(o.id,p_gid,'credit',o.quantity,o.expected_cents);
 result:=record_pull('payglocal:'||o.id::text,o.side_id,o.expected_cents,o.display_name,o.shout_out,p_country,p_env);
 IF (result->>'duplicate')::boolean THEN RAISE EXCEPTION 'Unexpected existing pull'; END IF;
 SELECT id INTO pid FROM pulls WHERE stripe_session_id='payglocal:'||o.id::text;
 INSERT INTO payglocal_ledger(order_id,gid,entry_type,quantity,amount_cents,pull_id) VALUES(o.id,p_gid,'debit',o.quantity,o.expected_cents,pid);
 END IF;
 UPDATE payglocal_orders SET status='paid',paid_at=now(),provider_status='SENT_FOR_CAPTURE',billing_country=p_country WHERE id=o.id;
 RETURN jsonb_build_object('duplicate',false,'quantity',o.quantity,'balance',0);
 END $$;
REVOKE ALL ON FUNCTION public.apply_payglocal_payment(uuid,text,text,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_payglocal_payment(uuid,text,text,integer,text) TO service_role;
CREATE OR REPLACE FUNCTION public.claim_payglocal_order(p_order uuid,p_env text,p_key uuid) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
 BEGIN
 UPDATE payglocal_orders SET processing_until=now()+interval '2 minutes',processing_key=p_key WHERE id=p_order AND environment=p_env AND (processing_until IS NULL OR processing_until<now());
 RETURN FOUND;
 END $$;
REVOKE ALL ON FUNCTION public.claim_payglocal_order(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_payglocal_order(uuid,text,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.tugg_payglocal_summary() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('environments',coalesce(jsonb_agg(row_to_json(s)),'[]'::jsonb)) FROM (
 SELECT environment,coalesce(sum(expected_cents) FILTER(WHERE status='paid'),0) AS revenue_cents,
 count(*) FILTER(WHERE status='paid' AND quantity>0) AS bundles_sold,
 coalesce(sum(quantity) FILTER(WHERE status='paid'),0) AS pulls_applied,
 count(*) FILTER(WHERE refund_status IS NOT NULL) AS refunds,
 count(*) FILTER(WHERE refund_status='needs_review') AS refund_reviews,
 count(*) FILTER(WHERE status='pending') AS pending,
 count(*) FILTER(WHERE status='expired') AS expired,
 coalesce(sum(reconcile_count),0) AS reconcile_checks,
 count(*) FILTER(WHERE reconcile_result='paid') AS reconciled_paid,
 count(*) FILTER(WHERE reconcile_result='expired') AS reconciled_expired
 FROM payglocal_orders GROUP BY environment) s $$;
REVOKE ALL ON FUNCTION public.tugg_payglocal_summary() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tugg_payglocal_summary() TO service_role;
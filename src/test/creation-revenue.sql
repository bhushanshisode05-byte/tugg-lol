-- Local disposable PostgreSQL only. Every fixture rolls back.
-- Creation income is the amount actually paid on paid creation orders, per provider and environment;
-- refunded, unpaid, rejected and owner matchups never count. Weekly owner facts read both providers.
BEGIN;
DO $$
DECLARE r jsonb; w jsonb; e jsonb; u uuid; u2 uuid; rej uuid; own uuid; pg uuid; pg2 uuid; o uuid;
BEGIN
  DELETE FROM creators; DELETE FROM dodo_orders; DELETE FROM payglocal_orders; DELETE FROM dodo_funnel_events; DELETE FROM payglocal_funnel_events;
  IF tugg_creation_revenue() <> '{"dodo":{},"payglocal":{}}'::jsonb THEN RAISE EXCEPTION 'empty figure wrong: %', tugg_creation_revenue(); END IF;
  INSERT INTO matchups(slug,title,category,source,status) VALUES ('u-1','U1','Tech','user','active') RETURNING id INTO u;
  INSERT INTO matchups(slug,title,category,source,status) VALUES ('u-2','U2','Tech','user','retired') RETURNING id INTO u2;
  INSERT INTO matchups(slug,title,category,source,status) VALUES ('rej','Rej','Tech','user','rejected') RETURNING id INTO rej;
  INSERT INTO matchups(slug,title,category,source,status) VALUES ('own','Own','Tech','owner','active') RETURNING id INTO own;
  INSERT INTO matchups(slug,title,category,source,status) VALUES ('pg-1','PG1','Tech','user','active') RETURNING id INTO pg;
  INSERT INTO matchups(slug,title,category,source,status) VALUES ('pg-2','PG2','Tech','user','active') RETURNING id INTO pg2;

  -- Counted: paid creations at their actual amounts (1234 is neither $9 nor $29).
  INSERT INTO dodo_orders(environment,kind,expected_cents,product_id,matchup_id,status,payment_id,paid_at) VALUES ('sandbox','standard',1234,'p',u,'paid','pay_1',now()) RETURNING id INTO o;
  INSERT INTO creators(matchup_id,tier,environment,dodo_order_id) VALUES (u,'standard','sandbox',o);
  INSERT INTO dodo_orders(environment,kind,expected_cents,product_id,matchup_id,status,payment_id,paid_at) VALUES ('live','featured',4100,'p',u2,'paid','pay_2',now()) RETURNING id INTO o;
  INSERT INTO creators(matchup_id,tier,environment,dodo_order_id) VALUES (u2,'featured','live',o);
  -- Not counted: refunded by status, refunded by creator record, unpaid, rejected matchup, owner matchup, pull purchases.
  INSERT INTO dodo_orders(environment,kind,expected_cents,product_id,matchup_id,status,payment_id,refund_status) VALUES ('sandbox','featured',2900,'p',u,'paid','pay_3','succeeded');
  INSERT INTO dodo_orders(environment,kind,expected_cents,product_id,matchup_id,status,payment_id) VALUES ('sandbox','standard',900,'p',u,'paid','pay_4') RETURNING id INTO o;
  INSERT INTO creators(matchup_id,tier,environment,dodo_order_id,refunded) VALUES (u,'standard','sandbox',o,true);
  INSERT INTO dodo_orders(environment,kind,expected_cents,product_id,matchup_id,status) VALUES ('sandbox','standard',900,'p',u,'pending');
  INSERT INTO dodo_orders(environment,kind,expected_cents,product_id,matchup_id,status) VALUES ('sandbox','standard',900,'p',u,'failed');
  INSERT INTO dodo_orders(environment,kind,expected_cents,product_id,matchup_id,status,payment_id,refund_status) VALUES ('sandbox','standard',900,'p',rej,'paid','pay_5','needs_review');
  INSERT INTO dodo_orders(environment,kind,expected_cents,product_id,matchup_id,status,payment_id) VALUES ('live','featured',2900,'p',own,'paid','pay_6');
  INSERT INTO dodo_orders(environment,kind,expected_cents,product_id,status,payment_id,quantity) VALUES ('sandbox','pull_5',500,'p','paid','pay_7',5);
  -- PayGlocal is reported separately from its own table.
  INSERT INTO payglocal_orders(environment,merchant_unique_id,kind,expected_cents,quantity,matchup_id,return_path,status,paid_at) VALUES ('sandbox','S000000000000001','standard',900,0,pg,'/','paid',now());
  INSERT INTO payglocal_orders(environment,merchant_unique_id,kind,expected_cents,quantity,matchup_id,return_path,status,refund_status) VALUES ('sandbox','S000000000000002','featured',2900,0,pg2,'/','paid','succeeded');

  r := tugg_creation_revenue();
  IF r <> '{"dodo":{"sandbox":1234,"live":4100},"payglocal":{"sandbox":900}}'::jsonb THEN RAISE EXCEPTION 'creation revenue wrong: %', r; END IF;

  -- Control: a refund confirmed later removes that creation, so the exclusion check can fail.
  UPDATE dodo_orders SET refund_status='succeeded' WHERE payment_id='pay_2';
  r := tugg_creation_revenue();
  IF r->'dodo' ? 'live' THEN RAISE EXCEPTION 'refunded creation still counted: %', r; END IF;

  -- Weekly owner facts: Dodo orders, refunds, failures and funnel now count, by confirmed payment time.
  INSERT INTO dodo_funnel_events(funnel_id,environment,step,bundle) VALUES (gen_random_uuid(),'sandbox','viewed',5);
  w := tugg_weekly_notice_facts(now()-interval '1 day', now()+interval '1 minute');
  SELECT x INTO e FROM jsonb_array_elements(w->'environments') x WHERE x->>'environment'='sandbox';
  -- sandbox paid: 1234 + 2900 + 900 + 900(rejected, still paid before its refund) + 500 + PayGlocal 900 + 2900
  IF (e->>'revenue_cents')::int <> 1234+2900+900+900+500+900+2900 THEN RAISE EXCEPTION 'weekly revenue wrong: %', e; END IF;
  IF (e->>'pending')::int <> 1 OR (e->>'viewed')::int <> 1 OR (e->>'refund_reviews')::int <> 1 THEN RAISE EXCEPTION 'weekly dodo counts missing: %', e; END IF;
  IF (w->>'failed_payments')::int <> 1 OR (w->>'refunds_confirmed')::int <> 3 THEN RAISE EXCEPTION 'weekly totals wrong: %', w; END IF;
  -- A payment confirmed after the week closed belongs to the next week.
  UPDATE dodo_orders SET paid_at=now()+interval '1 hour' WHERE payment_id='pay_1';
  w := tugg_weekly_notice_facts(now()-interval '1 day', now()+interval '1 minute');
  SELECT x INTO e FROM jsonb_array_elements(w->'environments') x WHERE x->>'environment'='sandbox';
  IF (e->>'revenue_cents')::int <> 2900+900+900+500+900+2900 THEN RAISE EXCEPTION 'weekly window not by payment time: %', e; END IF;

  -- Still owner-only.
  IF has_function_privilege('anon','public.tugg_creation_revenue()','EXECUTE') OR has_function_privilege('authenticated','public.tugg_creation_revenue()','EXECUTE') THEN RAISE EXCEPTION 'revenue readable by visitors'; END IF;
  IF has_function_privilege('anon','public.tugg_weekly_notice_facts(timestamptz,timestamptz)','EXECUTE') THEN RAISE EXCEPTION 'weekly facts readable by visitors'; END IF;
  IF NOT has_function_privilege('service_role','public.tugg_creation_revenue()','EXECUTE') THEN RAISE EXCEPTION 'service lost revenue'; END IF;
END $$;
ROLLBACK;
\echo ok: creation-revenue

-- Local disposable PostgreSQL only. Every fixture rolls back.
-- Pull basket: one $1-product checkout split across up to 10 different matchups.
BEGIN;
CREATE FUNCTION pg_temp.facts(o uuid, cents int, qty int, lines jsonb, meta_pulls int) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('currency','USD','cents',cents,'cart_lines',1,'product_id','pdt-unit','cart_quantity',qty,
    'checkout_id','cs-'||o,'meta_pulls',meta_pulls,'lines',lines,'country','US') $$;
CREATE FUNCTION pg_temp.expect_error(q text, expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE q; EXCEPTION WHEN OTHERS THEN
    IF position(expected IN SQLERRM) = 0 THEN RAISE EXCEPTION 'Expected % got %', expected, SQLERRM; END IF; RETURN; END;
  RAISE EXCEPTION 'Expected error % but statement succeeded: %', expected, q;
END $$;
DO $$
DECLARE m1 uuid; m2 uuid; m3 uuid; a1 uuid; b1 uuid; a2 uuid; a3 uuid; b3 uuid; o uuid; f uuid; r jsonb; lines jsonb; rd uuid; old_round uuid; i int; many jsonb := '[]';
BEGIN
  INSERT INTO matchups(slug,title,status) VALUES('basket-1-'||gen_random_uuid(),'One','active') RETURNING id INTO m1;
  INSERT INTO matchups(slug,title,status) VALUES('basket-2-'||gen_random_uuid(),'Two','active') RETURNING id INTO m2;
  INSERT INTO matchups(slug,title,status) VALUES('basket-3-'||gen_random_uuid(),'Three','active') RETURNING id INTO m3;
  INSERT INTO sides(matchup_id,position,name) VALUES(m1,0,'A1') RETURNING id INTO a1;
  INSERT INTO sides(matchup_id,position,name) VALUES(m1,1,'B1') RETURNING id INTO b1;
  INSERT INTO sides(matchup_id,position,name) VALUES(m2,0,'A2') RETURNING id INTO a2;
  INSERT INTO sides(matchup_id,position,name) VALUES(m2,1,'B2');
  INSERT INTO sides(matchup_id,position,name) VALUES(m3,0,'A3') RETURNING id INTO a3;
  INSERT INTO sides(matchup_id,position,name) VALUES(m3,1,'B3') RETURNING id INTO b3;
  lines := jsonb_build_array(
    jsonb_build_object('matchup_id',m1,'side_id',a1,'quantity',7),
    jsonb_build_object('matchup_id',m2,'side_id',a2,'quantity',6),
    jsonb_build_object('matchup_id',m3,'side_id',b3,'quantity',4));

  -- 1. Happy path: 17 pulls, one order, three pulls rows, exact amounts, duplicate-safe replay.
  o := gen_random_uuid(); f := gen_random_uuid();
  IF create_dodo_basket(o,'sandbox','pdt-unit',lines,'Name','Hi',f) <> 17 THEN RAISE EXCEPTION 'Wrong total'; END IF;
  IF (SELECT expected_cents FROM dodo_orders WHERE id=o) <> 1700 THEN RAISE EXCEPTION 'Wrong expected cents'; END IF;
  UPDATE dodo_orders SET checkout_id='cs-'||o, payment_id='pay-'||o WHERE id=o;
  r := apply_dodo_basket(o,'pay-'||o,'sandbox',pg_temp.facts(o,1700,17,lines,17));
  IF (r->>'applied_pulls')::int <> 17 OR (r->>'refund_cents')::int <> 0 THEN RAISE EXCEPTION 'Happy path result %', r; END IF;
  IF (SELECT count(*) FROM pulls WHERE stripe_session_id LIKE 'dodo:'||o||':%') <> 3 THEN RAISE EXCEPTION 'Expected three pulls'; END IF;
  IF (SELECT amount_cents FROM pulls WHERE stripe_session_id='dodo:'||o||':0') <> 700 OR (SELECT side_id FROM pulls WHERE stripe_session_id='dodo:'||o||':2') <> b3 THEN RAISE EXCEPTION 'Wrong allocation'; END IF;
  IF (SELECT status FROM dodo_orders WHERE id=o) <> 'paid' THEN RAISE EXCEPTION 'Order not paid'; END IF;
  r := apply_dodo_basket(o,'pay-'||o,'sandbox',pg_temp.facts(o,1700,17,lines,17));
  IF NOT (r->>'duplicate')::boolean OR (SELECT count(*) FROM pulls WHERE stripe_session_id LIKE 'dodo:'||o||':%') <> 3 THEN RAISE EXCEPTION 'Replay applied twice'; END IF;
  IF (SELECT count(*) FROM dodo_funnel_events WHERE funnel_id=f AND step='completed' AND bundle=17) <> 1 THEN RAISE EXCEPTION 'Funnel completion missing'; END IF;
  IF EXISTS(SELECT 1 FROM pull_wallets) OR EXISTS(SELECT 1 FROM pull_wallet_ledger) THEN RAISE EXCEPTION 'Wallet created'; END IF;

  -- 2. Tampered metadata claims 30 pulls on a 17-pull payment: nothing applied, held for review.
  o := gen_random_uuid(); PERFORM create_dodo_basket(o,'sandbox','pdt-unit',lines,'','',NULL);
  UPDATE dodo_orders SET checkout_id='cs-'||o, payment_id='pay-'||o WHERE id=o;
  r := apply_dodo_basket(o,'pay-'||o,'sandbox',pg_temp.facts(o,1700,17,jsonb_set(lines,'{0,quantity}','20'),30));
  IF r->>'reason' <> 'allocation_sum' THEN RAISE EXCEPTION 'Tamper not caught %', r; END IF;
  IF EXISTS(SELECT 1 FROM pulls WHERE stripe_session_id LIKE 'dodo:'||o||':%') OR (SELECT status FROM dodo_orders WHERE id=o) <> 'needs_review' THEN RAISE EXCEPTION 'Tampered basket applied'; END IF;
  IF NOT EXISTS(SELECT 1 FROM events WHERE kind='dodo_basket_review' AND detail->>'orderId'=o::text AND detail->>'reason'='allocation_sum') THEN RAISE EXCEPTION 'Review not recorded'; END IF;
  r := apply_dodo_basket(o,'pay-'||o,'sandbox',pg_temp.facts(o,1700,17,lines,17));
  IF NOT (r->>'review')::boolean OR EXISTS(SELECT 1 FROM pulls WHERE stripe_session_id LIKE 'dodo:'||o||':%') THEN RAISE EXCEPTION 'Reviewed basket applied on retry'; END IF;
  -- Tampered metadata keeps the declared total but inflates one line: still caught by the sum.
  o := gen_random_uuid(); PERFORM create_dodo_basket(o,'sandbox','pdt-unit',lines,'','',NULL);
  UPDATE dodo_orders SET checkout_id='cs-'||o, payment_id='pay-'||o WHERE id=o;
  r := apply_dodo_basket(o,'pay-'||o,'sandbox',pg_temp.facts(o,1700,17,jsonb_set(lines,'{0,quantity}','20'),17));
  IF r->>'reason' <> 'allocation_sum' THEN RAISE EXCEPTION 'Inflated line not caught %', r; END IF;
  -- Redirected to the other side with the same total: does not match the stored allocation.
  o := gen_random_uuid(); PERFORM create_dodo_basket(o,'sandbox','pdt-unit',lines,'','',NULL);
  UPDATE dodo_orders SET checkout_id='cs-'||o, payment_id='pay-'||o WHERE id=o;
  r := apply_dodo_basket(o,'pay-'||o,'sandbox',pg_temp.facts(o,1700,17,jsonb_set(lines,'{0,side_id}',to_jsonb(b1::text)),17));
  IF r->>'reason' <> 'allocation_mismatch' OR EXISTS(SELECT 1 FROM pulls WHERE stripe_session_id LIKE 'dodo:'||o||':%') THEN RAISE EXCEPTION 'Redirect not caught %', r; END IF;
  -- Duplicate matchup smuggled into metadata.
  o := gen_random_uuid(); PERFORM create_dodo_basket(o,'sandbox','pdt-unit',lines,'','',NULL);
  UPDATE dodo_orders SET checkout_id='cs-'||o, payment_id='pay-'||o WHERE id=o;
  r := apply_dodo_basket(o,'pay-'||o,'sandbox',pg_temp.facts(o,1700,17,jsonb_set(lines,'{1}',jsonb_build_object('matchup_id',m1,'side_id',b1,'quantity',6)),17));
  IF r->>'reason' <> 'duplicate_matchup' THEN RAISE EXCEPTION 'Duplicate matchup not caught %', r; END IF;
  -- Wrong paid amount, wrong currency, wrong cart quantity, wrong checkout, missing metadata.
  FOR i IN 1..5 LOOP
    o := gen_random_uuid(); PERFORM create_dodo_basket(o,'sandbox','pdt-unit',lines,'','',NULL);
    UPDATE dodo_orders SET checkout_id='cs-'||o, payment_id='pay-'||o WHERE id=o;
    r := apply_dodo_basket(o,'pay-'||o,'sandbox', CASE i
      WHEN 1 THEN pg_temp.facts(o,1000,17,lines,17)
      WHEN 2 THEN pg_temp.facts(o,1700,17,lines,17) || '{"currency":"EUR"}'
      WHEN 3 THEN pg_temp.facts(o,1700,10,lines,17)
      WHEN 4 THEN pg_temp.facts(o,1700,17,lines,17) || '{"checkout_id":"cs-other"}'
      ELSE pg_temp.facts(o,1700,17,NULL,17) END);
    IF r->>'reason' IS DISTINCT FROM (ARRAY['amount','currency','cart','checkout_session','allocation_malformed'])[i] OR EXISTS(SELECT 1 FROM pulls WHERE stripe_session_id LIKE 'dodo:'||o||':%') THEN RAISE EXCEPTION 'Check % failed: %', i, r; END IF;
  END LOOP;
  -- Wrong environment and wrong payment identity are rejected outright.
  o := gen_random_uuid(); PERFORM create_dodo_basket(o,'sandbox','pdt-unit',lines,'','',NULL);
  UPDATE dodo_orders SET checkout_id='cs-'||o, payment_id='pay-'||o WHERE id=o;
  PERFORM pg_temp.expect_error(format('SELECT apply_dodo_basket(%L,%L,%L,%L)',o,'pay-'||o,'live',pg_temp.facts(o,1700,17,lines,17)),'does not match basket');
  PERFORM pg_temp.expect_error(format('SELECT apply_dodo_basket(%L,%L,%L,%L)',o,'pay-other','sandbox',pg_temp.facts(o,1700,17,lines,17)),'does not match basket');
  UPDATE dodo_orders SET status='failed' WHERE id=o;
  PERFORM pg_temp.expect_error(format('SELECT apply_dodo_basket(%L,%L,%L,%L)',o,'pay-'||o,'sandbox',pg_temp.facts(o,1700,17,lines,17)),'Terminal unpaid');

  -- 3. Creation rules enforced in the database, not just the browser.
  PERFORM pg_temp.expect_error(format('SELECT create_dodo_basket(%L,%L,%L,%L,%L,%L,NULL)',gen_random_uuid(),'sandbox','pdt-unit',
    jsonb_build_array(jsonb_build_object('matchup_id',m1,'side_id',a1,'quantity',5),jsonb_build_object('matchup_id',m1,'side_id',b1,'quantity',5)),'',''),'basket:duplicate_matchup');
  PERFORM pg_temp.expect_error(format('SELECT create_dodo_basket(%L,%L,%L,%L,%L,%L,NULL)',gen_random_uuid(),'sandbox','pdt-unit',
    jsonb_build_array(jsonb_build_object('matchup_id',m1,'side_id',a2,'quantity',5)),'',''),'basket:side_mismatch');
  PERFORM pg_temp.expect_error(format('SELECT create_dodo_basket(%L,%L,%L,%L,%L,%L,NULL)',gen_random_uuid(),'sandbox','pdt-unit',
    jsonb_build_array(jsonb_build_object('matchup_id',m1,'side_id',a1,'quantity',4)),'',''),'basket:amount');
  PERFORM pg_temp.expect_error(format('SELECT create_dodo_basket(%L,%L,%L,%L,%L,%L,NULL)',gen_random_uuid(),'sandbox','pdt-unit',
    jsonb_build_array(jsonb_build_object('matchup_id',m1,'side_id',a1,'quantity',300),jsonb_build_object('matchup_id',m2,'side_id',a2,'quantity',201)),'',''),'basket:amount');
  PERFORM pg_temp.expect_error(format('SELECT create_dodo_basket(%L,%L,%L,%L,%L,%L,NULL)',gen_random_uuid(),'sandbox','pdt-unit',
    jsonb_build_array(jsonb_build_object('matchup_id',m1,'side_id',a1,'quantity',5.5)),'',''),'basket:invalid');
  FOR i IN 1..11 LOOP many := many || jsonb_build_array(jsonb_build_object('matchup_id',gen_random_uuid(),'side_id',a1,'quantity',1)); END LOOP;
  PERFORM pg_temp.expect_error(format('SELECT create_dodo_basket(%L,%L,%L,%L,%L,%L,NULL)',gen_random_uuid(),'sandbox','pdt-unit',many,'',''),'basket:too_many_matchups');
  IF create_dodo_basket(gen_random_uuid(),'sandbox','pdt-unit',jsonb_build_array(jsonb_build_object('matchup_id',m1,'side_id',a1,'quantity',500)),'','',NULL) <> 500 THEN RAISE EXCEPTION '500 rejected'; END IF;
  UPDATE matchups SET status='retired' WHERE id=m2;
  PERFORM pg_temp.expect_error(format('SELECT create_dodo_basket(%L,%L,%L,%L,%L,%L,NULL)',gen_random_uuid(),'sandbox','pdt-unit',lines,'',''),'basket:matchup_unavailable');
  UPDATE matchups SET status='active' WHERE id=m2;

  -- 4. Matchup retired between payment and fulfilment: other lines apply, that portion is marked for refund.
  o := gen_random_uuid(); PERFORM create_dodo_basket(o,'sandbox','pdt-unit',lines,'','',NULL);
  UPDATE dodo_orders SET checkout_id='cs-'||o, payment_id='pay-'||o, created_at=now()-interval '10 minutes' WHERE id=o;
  UPDATE matchups SET status='retired' WHERE id=m2;
  r := apply_dodo_basket(o,'pay-'||o,'sandbox',pg_temp.facts(o,1700,17,lines,17));
  IF (r->>'applied_pulls')::int <> 11 OR (r->>'refund_cents')::int <> 600 THEN RAISE EXCEPTION 'Partial result %', r; END IF;
  IF (SELECT status FROM dodo_basket_lines WHERE order_id=o AND position=1) <> 'refund_due' OR EXISTS(SELECT 1 FROM pulls WHERE stripe_session_id='dodo:'||o||':1') THEN RAISE EXCEPTION 'Retired line applied'; END IF;
  IF (SELECT basket_refund_cents FROM dodo_orders WHERE id=o) <> 600 THEN RAISE EXCEPTION 'Refund amount not stored'; END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(dodo_reconcile_due('sandbox')->'rows') e WHERE e->>'id'=o::text) THEN RAISE EXCEPTION 'Pending partial refund not reconciled'; END IF;
  UPDATE dodo_orders SET refund_status='requesting' WHERE id=o;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(dodo_reconcile_due('sandbox')->'rows') e WHERE e->>'id'=o::text) THEN RAISE EXCEPTION 'Claimed refund re-queued'; END IF;
  UPDATE matchups SET status='active' WHERE id=m2;

  -- 5. Round closes between payment and fulfilment: pulls go to that matchup's newly opened round.
  old_round := ensure_open_round(m1);
  UPDATE rounds SET ends_at=now()-interval '1 second' WHERE id=old_round;
  o := gen_random_uuid(); PERFORM create_dodo_basket(o,'sandbox','pdt-unit',jsonb_build_array(jsonb_build_object('matchup_id',m1,'side_id',a1,'quantity',5)),'','',NULL);
  UPDATE dodo_orders SET checkout_id='cs-'||o, payment_id='pay-'||o WHERE id=o;
  PERFORM apply_dodo_basket(o,'pay-'||o,'sandbox',pg_temp.facts(o,500,5,jsonb_build_array(jsonb_build_object('matchup_id',m1,'side_id',a1,'quantity',5)),5));
  SELECT round_id INTO rd FROM pulls WHERE stripe_session_id='dodo:'||o||':0';
  IF rd = old_round OR (SELECT status FROM rounds WHERE id=rd) <> 'open' OR (SELECT status FROM rounds WHERE id=old_round) <> 'closed' THEN RAISE EXCEPTION 'Pull landed in closed round'; END IF;

  -- 6. A crash mid-basket applies nothing (third line fails after the first two were recorded).
  o := gen_random_uuid(); PERFORM create_dodo_basket(o,'sandbox','pdt-unit',lines,'','',NULL);
  UPDATE dodo_orders SET checkout_id='cs-'||o, payment_id='pay-'||o WHERE id=o;
  EXECUTE format('CREATE FUNCTION pg_temp.boom() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN IF NEW.side_id = %L THEN RAISE EXCEPTION %L; END IF; RETURN NEW; END $f$', b3, 'simulated crash');
  CREATE TRIGGER basket_boom BEFORE INSERT ON pulls FOR EACH ROW EXECUTE FUNCTION pg_temp.boom();
  PERFORM pg_temp.expect_error(format('SELECT apply_dodo_basket(%L,%L,%L,%L)',o,'pay-'||o,'sandbox',pg_temp.facts(o,1700,17,lines,17)),'simulated crash');
  IF EXISTS(SELECT 1 FROM pulls WHERE stripe_session_id LIKE 'dodo:'||o||':%') OR (SELECT status FROM dodo_orders WHERE id=o) <> 'pending'
     OR EXISTS(SELECT 1 FROM dodo_basket_lines WHERE order_id=o AND status<>'pending') THEN RAISE EXCEPTION 'Partial basket applied'; END IF;
  DROP TRIGGER basket_boom ON pulls;
  r := apply_dodo_basket(o,'pay-'||o,'sandbox',pg_temp.facts(o,1700,17,lines,17));
  IF (r->>'applied_pulls')::int <> 17 THEN RAISE EXCEPTION 'Retry after crash failed'; END IF;

  -- 7. Private: no browser role can create, apply or read baskets.
  IF has_function_privilege('anon','apply_dodo_basket(uuid,text,text,jsonb)','EXECUTE') OR has_function_privilege('authenticated','create_dodo_basket(uuid,text,text,jsonb,text,text,uuid)','EXECUTE')
     OR has_table_privilege('anon','dodo_basket_lines','SELECT') OR has_table_privilege('authenticated','dodo_basket_lines','SELECT') THEN RAISE EXCEPTION 'Basket exposed'; END IF;
  -- 8. Single-bundle path untouched: a 5-pull bundle still applies.
  o := gen_random_uuid();
  INSERT INTO dodo_orders(id,environment,kind,expected_cents,product_id,side_id,quantity,payment_id) VALUES(o,'sandbox','pull_5',500,'product',a1,5,'pay-'||o);
  IF (apply_dodo_bundle(o,'pay-'||o,'sandbox',500,'US')->>'duplicate')::boolean THEN RAISE EXCEPTION 'Bundle path broken'; END IF;
END $$;
ROLLBACK;

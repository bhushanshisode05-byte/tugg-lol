-- Local disposable PostgreSQL only. All sequential fixtures roll back.
BEGIN;
DO $$
DECLARE m uuid; s uuid; o uuid; f uuid; r jsonb; q integer; c integer; before_total bigint;
BEGIN
 INSERT INTO matchups(slug,title,status) VALUES('dodo-immediate-'||gen_random_uuid(),'Dodo fixture','active') RETURNING id INTO m;
 INSERT INTO sides(matchup_id,position,name) VALUES(m,0,'A') RETURNING id INTO s;
 INSERT INTO sides(matchup_id,position,name) VALUES(m,1,'B');
 FOR q IN SELECT unnest(ARRAY[5,10,25]) LOOP
  o:=gen_random_uuid();f:=gen_random_uuid();
  INSERT INTO dodo_orders(id,environment,kind,expected_cents,product_id,side_id,quantity,payment_id,funnel_id) VALUES(o,'sandbox','pull_'||q,q*100,'product',s,q,'pay-'||o,f);
  PERFORM apply_dodo_bundle(o,'pay-'||o,'sandbox',q*100,'US');
  r:=apply_dodo_bundle(o,'pay-'||o,'sandbox',q*100,'US');
  IF NOT (r->>'duplicate')::boolean THEN RAISE EXCEPTION 'Duplicate not detected'; END IF;
  IF (SELECT count(*) FROM pulls WHERE stripe_session_id='dodo:'||o)<>1 THEN RAISE EXCEPTION 'Duplicate pulls'; END IF;
  IF (SELECT count(*) FROM dodo_bundle_applications WHERE order_id=o)<>1 THEN RAISE EXCEPTION 'Duplicate application'; END IF;
  IF (SELECT count(*) FROM dodo_funnel_events WHERE funnel_id=f AND step='completed')<>1 THEN RAISE EXCEPTION 'Completion replay'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pull_wallets) OR EXISTS(SELECT 1 FROM pull_wallet_ledger) THEN RAISE EXCEPTION 'Wallet created'; END IF;
 IF (SELECT sum(amount_cents) FROM pulls WHERE matchup_id=m)<>4000 THEN RAISE EXCEPTION 'Expected 40 pulls'; END IF;
 IF (SELECT total_cents FROM tugg_stats(true))<>0 THEN RAISE EXCEPTION 'Sandbox counted in live public totals'; END IF;
 IF (SELECT total_cents FROM tugg_stats(false))<>4000 THEN RAISE EXCEPTION 'Sandbox missing in test totals'; END IF;
 o:=gen_random_uuid();
 INSERT INTO dodo_orders(id,environment,kind,expected_cents,product_id,side_id,quantity,payment_id) VALUES(o,'sandbox','pull_5',500,'product',s,5,'pay-'||o);
 BEGIN PERFORM apply_dodo_bundle(o,'pay-'||o,'live',500,'US'); RAISE EXCEPTION 'Wrong environment accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='Wrong environment accepted' THEN RAISE; END IF; END;
 BEGIN PERFORM apply_dodo_bundle(o,'pay-'||o,'sandbox',100,'US'); RAISE EXCEPTION 'Wrong amount accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='Wrong amount accepted' THEN RAISE; END IF; END;
 UPDATE matchups SET status='retired' WHERE id=m;
 BEGIN PERFORM apply_dodo_bundle(o,'pay-'||o,'sandbox',500,'US'); RAISE EXCEPTION 'Inactive accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='Inactive accepted' THEN RAISE; END IF; END;
 IF EXISTS(SELECT 1 FROM dodo_bundle_applications WHERE order_id=o) OR (SELECT status FROM dodo_orders WHERE id=o)<>'pending' THEN RAISE EXCEPTION 'Partial transaction'; END IF;
 UPDATE matchups SET status='active' WHERE id=m;
 UPDATE dodo_orders SET status='failed' WHERE id=o;
 BEGIN PERFORM apply_dodo_bundle(o,'pay-'||o,'sandbox',500,'US'); RAISE EXCEPTION 'Failed order accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='Failed order accepted' THEN RAISE; END IF; END;
 UPDATE dodo_orders SET status='pending',checkout_id='cs-'||o,created_at=now()-interval '25 hours' WHERE id=o;
 r:=dodo_reconcile_due('live');IF (SELECT status FROM dodo_orders WHERE id=o)<>'pending' THEN RAISE EXCEPTION 'Cross env expiry'; END IF;
 r:=dodo_reconcile_due('sandbox');IF (SELECT status FROM dodo_orders WHERE id=o)<>'expired' OR jsonb_array_length(r->'rows')<>0 THEN RAISE EXCEPTION 'Expiry checking provider'; END IF;
 FOR c IN SELECT unnest(ARRAY[0,2,8]) LOOP
  o:=gen_random_uuid();q:=CASE WHEN c=0 THEN 5 WHEN c=2 THEN 15 ELSE 60 END;
  INSERT INTO dodo_orders(id,environment,kind,expected_cents,product_id,side_id,quantity,checkout_id,created_at,reconciled_at) VALUES(o,'sandbox','pull_5',500,'product',s,5,'cs-'||o,now()-c*interval '1 hour'-interval '10 minutes',now()-(q-1)*interval '1 minute');
  r:=dodo_reconcile_due('sandbox');IF EXISTS(SELECT 1 FROM jsonb_array_elements(r->'rows') e WHERE e->>'id'=o::text) THEN RAISE EXCEPTION 'Early backoff'; END IF;
  UPDATE dodo_orders SET reconciled_at=now()-(q+1)*interval '1 minute' WHERE id=o;
  r:=dodo_reconcile_due('sandbox');IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r->'rows') e WHERE e->>'id'=o::text) THEN RAISE EXCEPTION 'Due missing'; END IF;
  UPDATE dodo_orders SET status='failed' WHERE id=o;
 END LOOP;
 IF has_function_privilege('anon','apply_dodo_bundle(uuid,text,text,integer,text)','EXECUTE') OR has_table_privilege('authenticated','dodo_bundle_applications','SELECT') THEN RAISE EXCEPTION 'Private data exposed'; END IF;
 INSERT INTO dodo_webhook_events(id,environment,event_type,payload) VALUES('sandbox:local-duplicate','sandbox','payment.succeeded','{}') ON CONFLICT DO NOTHING;
 INSERT INTO dodo_webhook_events(id,environment,event_type,payload) VALUES('sandbox:local-duplicate','sandbox','payment.succeeded','{}') ON CONFLICT DO NOTHING;
 IF (SELECT count(*) FROM dodo_webhook_events WHERE id='sandbox:local-duplicate')<>1 THEN RAISE EXCEPTION 'Duplicate webhook'; END IF;
 IF NOT claim_dodo_event('sandbox:local-duplicate') OR claim_dodo_event('sandbox:local-duplicate') THEN RAISE EXCEPTION 'Event claim replay'; END IF;
END $$;
ROLLBACK;
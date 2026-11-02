-- Disposable PostgreSQL only. No fixtures persist.
BEGIN;
DO $$
DECLARE m uuid; s uuid; o uuid; f uuid:=gen_random_uuid(); r jsonb; age_hours integer; wait_minutes integer;
BEGIN
 INSERT INTO matchups(slug,title) VALUES('funnel-'||gen_random_uuid(),'Funnel test') RETURNING id INTO m;
 INSERT INTO sides(matchup_id,position,name) VALUES(m,0,'A') RETURNING id INTO s;
 FOR age_hours,wait_minutes IN SELECT * FROM (VALUES(0,5),(2,15),(8,60)) v(a,w) LOOP
  o:=gen_random_uuid();
  INSERT INTO payglocal_orders(id,environment,merchant_unique_id,kind,expected_cents,quantity,side_id,return_path,created_at,reconciled_at)
   VALUES(o,'sandbox',replace(o::text,'-',''),'pull_5',500,5,s,'/',now()-age_hours*interval '1 hour'-interval '10 minutes',now()-(wait_minutes-1)*interval '1 minute');
  r:=payglocal_reconcile_due('sandbox');
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(r->'rows') e WHERE e->>'id'=o::text) THEN RAISE EXCEPTION 'Backoff too early for % hours',age_hours; END IF;
  UPDATE payglocal_orders SET reconciled_at=now()-(wait_minutes+1)*interval '1 minute' WHERE id=o;
  r:=payglocal_reconcile_due('sandbox');
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r->'rows') e WHERE e->>'id'=o::text) THEN RAISE EXCEPTION 'Due payment missing for % hours',age_hours; END IF;
  UPDATE payglocal_orders SET status='failed' WHERE id=o;
 END LOOP;
 o:=gen_random_uuid();
 INSERT INTO payglocal_orders(id,environment,merchant_unique_id,kind,expected_cents,quantity,side_id,return_path,created_at,funnel_id)
  VALUES(o,'sandbox',replace(o::text,'-',''),'pull_5',500,5,s,'/',now()-interval '25 hours',f);
 r:=payglocal_reconcile_due('live');
 IF (SELECT status FROM payglocal_orders WHERE id=o)<>'pending' THEN RAISE EXCEPTION 'Cross environment expiry'; END IF;
 r:=payglocal_reconcile_due('sandbox');
 IF (r->>'expired')::integer<>1 OR jsonb_array_length(r->'rows')<>0 THEN RAISE EXCEPTION 'Expiry must stop API checks'; END IF;
 IF NOT EXISTS(SELECT 1 FROM payglocal_funnel_events WHERE funnel_id=f AND step='failed') THEN RAISE EXCEPTION 'Terminal failure not recorded'; END IF;
 INSERT INTO payglocal_funnel_events(funnel_id,environment,step,bundle) VALUES(f,'sandbox','viewed',5),(f,'sandbox','viewed',10);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(tugg_payglocal_funnel()) e WHERE e->>'days'='7' AND e->>'environment'='sandbox' AND e->>'step'='viewed' AND e->>'count'='1') THEN RAISE EXCEPTION 'Visit not deduplicated'; END IF;
 IF has_table_privilege('anon','payglocal_funnel_events','SELECT') OR has_function_privilege('authenticated','tugg_payglocal_funnel()','EXECUTE') THEN RAISE EXCEPTION 'Private funnel exposed'; END IF;
 IF EXISTS(SELECT 1 FROM payglocal_ledger WHERE order_id=o) THEN RAISE EXCEPTION 'Expiry applied pulls'; END IF;
 o:=gen_random_uuid(); f:=gen_random_uuid();
 INSERT INTO payglocal_orders(id,environment,merchant_unique_id,kind,expected_cents,quantity,side_id,return_path,funnel_id,gid)
 VALUES(o,'sandbox',replace(o::text,'-',''),'pull_5',500,5,s,'/',f,'funnel-gid-'||o);
 r:=payglocal_reconcile_due('sandbox');
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(r->'rows') e WHERE e->>'id'=o::text) THEN RAISE EXCEPTION 'Payment younger than five minutes checked'; END IF;
 PERFORM apply_payglocal_payment(o,'funnel-gid-'||o,'sandbox',500,'USA');
 PERFORM apply_payglocal_payment(o,'funnel-gid-'||o,'sandbox',500,'USA');
 IF (SELECT count(*) FROM payglocal_funnel_events WHERE funnel_id=f AND step='completed')<>1 THEN RAISE EXCEPTION 'Completion replay counted twice'; END IF;
END $$;
ROLLBACK;
-- Transactional database regression; all fixtures roll back, including pulls and email outbox triggers.
BEGIN;
DO $$
DECLARE m uuid; s uuid; o uuid; cents integer; result jsonb; before_total bigint;
BEGIN
 INSERT INTO matchups(slug,title,status) VALUES('custom-regression-'||gen_random_uuid(),'Custom pull fixture','active') RETURNING id INTO m;
 INSERT INTO sides(matchup_id,position,name) VALUES(m,0,'A') RETURNING id INTO s;
 INSERT INTO sides(matchup_id,position,name) VALUES(m,1,'B');
 FOR cents IN SELECT unnest(ARRAY[500,1700,100000]) LOOP
  o:=gen_random_uuid();
  INSERT INTO dodo_orders(id,environment,kind,expected_cents,product_id,side_id,quantity,payment_id,funnel_id)
    VALUES(o,'sandbox','pull_custom',cents,'fixture',s,cents/100,'fixture-'||o,gen_random_uuid());
  result:=apply_dodo_bundle(o,'fixture-'||o,'sandbox',cents,'US');
  IF (result->>'quantity')::integer<>cents/100 THEN RAISE EXCEPTION 'Incorrect confirmed pull count'; END IF;
  IF (SELECT amount_cents FROM pulls WHERE stripe_session_id='dodo:'||o)<>cents THEN RAISE EXCEPTION 'Incorrect applied money'; END IF;
  IF (SELECT quantity FROM dodo_bundle_applications WHERE order_id=o)<>cents/100 THEN RAISE EXCEPTION 'Incorrect application quantity'; END IF;
  result:=apply_dodo_bundle(o,'fixture-'||o,'sandbox',cents,'US');
  IF NOT (result->>'duplicate')::boolean OR (SELECT count(*) FROM pulls WHERE stripe_session_id='dodo:'||o)<>1 THEN RAISE EXCEPTION 'Duplicate credited'; END IF;
 END LOOP;
 FOR cents IN SELECT unnest(ARRAY[499,0,-100,100001,550]) LOOP
  BEGIN
   INSERT INTO dodo_orders(environment,kind,expected_cents,product_id,side_id,quantity) VALUES('sandbox','pull_custom',cents,'fixture',s,cents/100);
   RAISE EXCEPTION 'Invalid custom order accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
 END LOOP;
 o:=gen_random_uuid();
 INSERT INTO dodo_orders(id,environment,kind,expected_cents,product_id,side_id,quantity,payment_id) VALUES(o,'sandbox','pull_custom',2100,'fixture',s,21,'fixture-'||o);
 SELECT coalesce(sum(amount_cents),0) INTO before_total FROM pulls WHERE matchup_id=m;
 BEGIN
  PERFORM apply_dodo_bundle(o,'fixture-'||o,'sandbox',2000,'US');
  RAISE EXCEPTION 'Underpaid order credited';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='Underpaid order credited' THEN RAISE; END IF; END;
 IF EXISTS(SELECT 1 FROM dodo_bundle_applications WHERE order_id=o) OR (SELECT status FROM dodo_orders WHERE id=o)<>'pending' OR (SELECT sum(amount_cents) FROM pulls WHERE matchup_id=m)<>before_total THEN RAISE EXCEPTION 'Underpayment partially applied'; END IF;
 BEGIN
  UPDATE dodo_orders SET quantity=1000 WHERE id=o;
  RAISE EXCEPTION 'Tampered quantity accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 IF has_function_privilege('anon','apply_dodo_bundle(uuid,text,text,integer,text)','EXECUTE') OR has_table_privilege('authenticated','dodo_orders','SELECT') THEN RAISE EXCEPTION 'Private payment access widened'; END IF;
END $$;
ROLLBACK;
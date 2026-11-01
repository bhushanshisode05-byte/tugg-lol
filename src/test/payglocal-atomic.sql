-- Disposable local PostgreSQL only. Every fixture is rolled back.
BEGIN;
DO $$
DECLARE m uuid; a uuid; b uuid; o uuid; r jsonb; n integer; before_total bigint; bad uuid;
BEGIN
 INSERT INTO matchups(slug,title,status) VALUES('payglocal-sql-'||gen_random_uuid(),'Atomic fixture','active') RETURNING id INTO m;
 INSERT INTO sides(matchup_id,position,name) VALUES(m,0,'A') RETURNING id INTO a;
 INSERT INTO sides(matchup_id,position,name) VALUES(m,1,'B') RETURNING id INTO b;
 FOREACH n IN ARRAY ARRAY[5,10,25] LOOP
  o:=gen_random_uuid();
  INSERT INTO payglocal_orders(id,environment,merchant_unique_id,kind,expected_cents,quantity,side_id,gid,return_path)
   VALUES(o,'sandbox','S'||replace(o::text,'-',''),'pull_'||n,n*100,n,a,'gid-'||o,'/');
  r:=apply_payglocal_payment(o,'gid-'||o,'sandbox',n*100,'USA');
  IF (r->>'balance')::integer<>0 THEN RAISE EXCEPTION 'Carryover balance'; END IF;
  r:=apply_payglocal_payment(o,'gid-'||o,'sandbox',n*100,'USA');
  IF r->>'duplicate'<>'true' THEN RAISE EXCEPTION 'Replay applied twice'; END IF;
  IF (SELECT count(*) FROM payglocal_ledger WHERE order_id=o)<>2 THEN RAISE EXCEPTION 'Credit/debit mismatch'; END IF;
 END LOOP;
 IF (SELECT all_time_cents FROM sides WHERE id=a)<>4000 THEN RAISE EXCEPTION 'Bundle total incorrect'; END IF;
 IF (SELECT coalesce(sum(CASE WHEN entry_type='credit' THEN l.quantity ELSE -l.quantity END),0) FROM payglocal_ledger l JOIN payglocal_orders po ON po.id=l.order_id WHERE po.side_id=a)<>0 THEN RAISE EXCEPTION 'Unspent credit'; END IF;
 IF (SELECT coalesce(sum(total_a_cents+total_b_cents),0) FROM tugg_round_totals(true,ARRAY[(SELECT id FROM rounds WHERE matchup_id=m AND status='open')]))<>0 THEN RAISE EXCEPTION 'Sandbox leaked into live totals'; END IF;
 bad:=gen_random_uuid();
 INSERT INTO payglocal_orders(id,environment,merchant_unique_id,kind,expected_cents,quantity,side_id,gid,return_path)
  VALUES(bad,'sandbox','S'||replace(bad::text,'-',''),'pull_5',500,5,a,'bad-'||bad,'/');
 -- Force failure midway, after the credit and record_pull, at the debit uniqueness boundary.
 INSERT INTO payglocal_ledger(order_id,gid,entry_type,quantity,amount_cents) VALUES(bad,'bad-'||bad,'debit',5,500);
 SELECT all_time_cents INTO before_total FROM sides WHERE id=a;
 BEGIN
  PERFORM apply_payglocal_payment(bad,'bad-'||bad,'sandbox',500,'USA');
  RAISE EXCEPTION 'Midway failure did not happen';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 IF (SELECT all_time_cents FROM sides WHERE id=a)<>before_total OR EXISTS(SELECT 1 FROM pulls WHERE stripe_session_id='payglocal:'||bad::text) OR EXISTS(SELECT 1 FROM payglocal_ledger WHERE order_id=bad AND entry_type='credit') OR (SELECT status FROM payglocal_orders WHERE id=bad)<>'pending' THEN RAISE EXCEPTION 'Partial apply escaped rollback'; END IF;
 BEGIN
  PERFORM apply_payglocal_payment(bad,'bad-'||bad,'live',500,'USA');
  RAISE EXCEPTION 'Wrong environment accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='Wrong environment accepted' THEN RAISE; END IF;
 END;
 UPDATE payglocal_orders SET status='expired' WHERE id=bad;
 BEGIN
  UPDATE payglocal_orders SET status='paid' WHERE id=bad;
  RAISE EXCEPTION 'Expired order became paid';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='Expired order became paid' THEN RAISE; END IF;
 END;
 IF (SELECT status FROM payglocal_orders WHERE id=bad)<>'expired' THEN RAISE EXCEPTION 'Terminal guard failed'; END IF;
END $$;
ROLLBACK;
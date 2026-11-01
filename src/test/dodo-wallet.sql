-- Run with psql -v ON_ERROR_STOP=1 -f src/test/dodo-wallet.sql.
-- Every fixture and pull is rolled back; no fake public totals persist.
BEGIN;
DO $$
DECLARE w uuid; o uuid; m uuid; a uuid; b uuid; req uuid:=gen_random_uuid(); r jsonb; n integer;
BEGIN
 INSERT INTO public.pull_wallets(token_hash,environment) VALUES(repeat('a',64),'sandbox') RETURNING id INTO w;
 INSERT INTO public.matchups(slug,title,source,status) VALUES('sql-test-'||gen_random_uuid(),'Transactional test','user','active') RETURNING id INTO m;
 INSERT INTO public.sides(matchup_id,position,name) VALUES(m,0,'A') RETURNING id INTO a;
 INSERT INTO public.sides(matchup_id,position,name) VALUES(m,1,'B') RETURNING id INTO b;
 FOREACH n IN ARRAY ARRAY[5,10,25] LOOP
  INSERT INTO public.dodo_orders(environment,kind,expected_cents,product_id,wallet_id) VALUES('sandbox','pull_'||n,n*100,'fixture',w) RETURNING id INTO o;
  r:=public.credit_dodo_wallet(o,'fixture-'||o,'US','sandbox',n*100);
  r:=public.credit_dodo_wallet(o,'fixture-'||o,'US','sandbox',n*100);
  IF r->>'duplicate'<>'true' THEN RAISE EXCEPTION 'Duplicate credit failed'; END IF;
 END LOOP;
 IF (SELECT balance FROM public.pull_wallets WHERE id=w)<>40 THEN RAISE EXCEPTION 'Pack credits incorrect'; END IF;
 r:=public.spend_wallet_pull(repeat('a',64),'sandbox',a,1,req,'','');
 r:=public.spend_wallet_pull(repeat('a',64),'sandbox',a,1,req,'','');
 IF r->>'duplicate'<>'true' OR (r->>'balance')::int<>39 THEN RAISE EXCEPTION 'Duplicate spend failed'; END IF;
 r:=public.spend_wallet_pull(repeat('a',64),'sandbox',a,5,gen_random_uuid(),'','');
 r:=public.spend_wallet_pull(repeat('a',64),'sandbox',b,10,gen_random_uuid(),'','');
 IF (r->>'balance')::int<>24 THEN RAISE EXCEPTION 'Spend balance incorrect'; END IF;
 IF (SELECT count(*) FROM public.pull_wallet_ledger WHERE wallet_id=w AND kind='debit')<>3 THEN RAISE EXCEPTION 'Debit ledger incorrect'; END IF;
 BEGIN PERFORM public.spend_wallet_pull(repeat('a',64),'live',a,1,gen_random_uuid(),'',''); RAISE EXCEPTION 'Wrong environment accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='Wrong environment accepted' THEN RAISE; END IF; END;
 UPDATE public.pull_wallets SET balance=0 WHERE id=w;
 BEGIN PERFORM public.spend_wallet_pull(repeat('a',64),'sandbox',a,1,gen_random_uuid(),'',''); RAISE EXCEPTION 'Overdraw accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='Overdraw accepted' THEN RAISE; END IF; END;
 UPDATE public.pull_wallets SET balance=5,flagged=true WHERE id=w;
 BEGIN PERFORM public.spend_wallet_pull(repeat('a',64),'sandbox',a,1,gen_random_uuid(),'',''); RAISE EXCEPTION 'Flagged wallet accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='Flagged wallet accepted' THEN RAISE; END IF; END;
 INSERT INTO public.dodo_webhook_events(id,environment,event_type,payload) VALUES('sql-duplicate-fixture','sandbox','payment.succeeded','{}');
 IF NOT public.claim_dodo_event('sql-duplicate-fixture') THEN RAISE EXCEPTION 'Initial event claim failed'; END IF;
 IF public.claim_dodo_event('sql-duplicate-fixture') THEN RAISE EXCEPTION 'Concurrent event claim accepted'; END IF;
 UPDATE public.dodo_webhook_events SET status='done',lease_until=null WHERE id='sql-duplicate-fixture';
 IF public.claim_dodo_event('sql-duplicate-fixture') THEN RAISE EXCEPTION 'Completed webhook replay accepted'; END IF;
END $$;
ROLLBACK;
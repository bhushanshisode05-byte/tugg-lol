-- Local disposable PostgreSQL only. Everything rolls back.
-- Player notification emails: frequency caps under a flip war, environment separation, eligibility cut-off,
-- closing-soon rule, one result per person with a true streak, unsubscribe, claim/lease/stale and retries.
BEGIN;
CREATE FUNCTION pg_temp.buy(p_side uuid, p_email text, p_env text, p_pack integer) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE o uuid := gen_random_uuid(); pid uuid;
BEGIN
  INSERT INTO dodo_orders(id, environment, kind, expected_cents, product_id, status, buyer_email, side_id, quantity)
  VALUES (o, p_env, 'pull_'||p_pack, p_pack*100, 'prod', 'paid', p_email, p_side, p_pack);
  PERFORM record_pull('eng:'||o, p_side, p_pack*100, '', '', 'US', p_env);
  SELECT id INTO pid FROM pulls WHERE stripe_session_id = 'eng:'||o;
  INSERT INTO dodo_bundle_applications(order_id, payment_id, pull_id, quantity, amount_cents, environment) VALUES (o, 'pay_'||o, pid, p_pack, p_pack*100, p_env);
  RETURN pid;
END $$;
CREATE FUNCTION pg_temp.h(p text) RETURNS text LANGUAGE sql AS $$ SELECT engagement_email_hash(p) $$;
DO $$
DECLARE m uuid; a uuid; b uuid; r uuid; r_old uuid; i integer; n integer; res jsonb; c record; ids uuid[]; m2 uuid; a2 uuid; b2 uuid; r2 uuid;
BEGIN
  DELETE FROM engagement_notifications; DELETE FROM engagement_round_state; DELETE FROM engagement_unsubscribes;
  UPDATE round_settings SET default_length = 'weekly';
  INSERT INTO matchups(slug,title,status) VALUES('eng-'||gen_random_uuid(),'Notion vs Obsidian','active') RETURNING id INTO m;
  INSERT INTO sides(matchup_id,position,name) VALUES(m,0,'Notion') RETURNING id INTO a;
  INSERT INTO sides(matchup_id,position,name) VALUES(m,1,'Obsidian') RETURNING id INTO b;
  r := ensure_open_round(m);

  -- Defaults: everything off and no cut-off, so nothing is ever queued.
  IF (SELECT (live_enabled, sandbox_enabled, eligible_from IS NULL) FROM engagement_settings) IS DISTINCT FROM (false,false,true) THEN RAISE EXCEPTION 'defaults not off'; END IF;
  PERFORM pg_temp.buy(b, 'Bob@Example.com', 'sandbox', 10);
  PERFORM engagement_scan(true);
  PERFORM pg_temp.buy(a, 'ann@example.com', 'sandbox', 25);
  PERFORM engagement_scan(true);
  IF (SELECT count(*) FROM engagement_notifications) <> 0 THEN RAISE EXCEPTION 'queued while off'; END IF;

  -- Pulls before the cut-off never count. Turn sandbox on from now.
  UPDATE engagement_settings SET sandbox_enabled = true, eligible_from = now();
  UPDATE pulls SET created_at = now() - interval '1 hour' WHERE round_id = r;

  -- Flip war: 20 lead changes in one round. Ann backs Notion, Bob backs Obsidian, Cat backs both (skipped), Old only pre-cut-off.
  PERFORM pg_temp.buy(a, 'cat@example.com', 'sandbox', 5);
  PERFORM pg_temp.buy(b, 'cat@example.com', 'sandbox', 5);
  PERFORM pg_temp.buy(a, 'old@example.com', 'sandbox', 5);
  UPDATE pulls SET created_at = now() - interval '2 hours' WHERE stripe_session_id IN (SELECT 'eng:'||id FROM dodo_orders WHERE buyer_email='old@example.com');
  PERFORM engagement_scan(true);
  FOR i IN 1..20 LOOP
    IF i % 2 = 1 THEN PERFORM pg_temp.buy(b, 'bob@example.com', 'sandbox', 25); ELSE PERFORM pg_temp.buy(a, 'ann@example.com', 'sandbox', 25); END IF;
    PERFORM pg_temp.buy(b, 'bob@example.com', 'sandbox', 25); PERFORM pg_temp.buy(b, 'bob@example.com', 'sandbox', 25);
    -- Bring Notion back in front on even steps so the lead flips every time.
    IF i % 2 = 0 THEN PERFORM pg_temp.buy(a, 'ann@example.com', 'sandbox', 25); PERFORM pg_temp.buy(a, 'ann@example.com', 'sandbox', 25); PERFORM pg_temp.buy(a, 'ann@example.com', 'sandbox', 25); PERFORM pg_temp.buy(a, 'ann@example.com', 'sandbox', 25); END IF;
    PERFORM engagement_scan(true);
  END LOOP;
  SELECT count(*) INTO n FROM engagement_notifications WHERE kind = 'overtaken';
  IF n <> 2 THEN RAISE EXCEPTION 'flip war produced % overtaken rows (want exactly one each for Ann and Bob)', n; END IF;
  IF EXISTS (SELECT 1 FROM engagement_notifications GROUP BY kind, round_id, environment, email_hash HAVING count(*) > 1) THEN RAISE EXCEPTION 'duplicate per person'; END IF;
  IF EXISTS (SELECT 1 FROM engagement_notifications WHERE email_hash IN (pg_temp.h('cat@example.com'), pg_temp.h('old@example.com'))) THEN RAISE EXCEPTION 'mixed or pre-cut-off buyer emailed'; END IF;
  IF (SELECT recipient_email FROM engagement_notifications WHERE email_hash = pg_temp.h('bob@example.com')) <> 'bob@example.com' THEN RAISE EXCEPTION 'address not normalised'; END IF;
  IF EXISTS (SELECT 1 FROM engagement_notifications WHERE environment <> 'sandbox') THEN RAISE EXCEPTION 'wrong environment'; END IF;
  -- Overtaken facts are public side names and totals only.
  IF EXISTS (SELECT 1 FROM engagement_notifications, jsonb_object_keys(data) k WHERE k NOT IN ('title','slug','round_length','a_id','a_name','b_id','b_name','a_cents','b_cents','ends_at','leader_id')) THEN RAISE EXCEPTION 'private field in data'; END IF;

  -- Live stays separate: live pulls by Dan flip the live score; sandbox buyers never get live mail, and live is off.
  PERFORM pg_temp.buy(a, 'dan@example.com', 'live', 5);
  PERFORM engagement_scan(true);
  PERFORM pg_temp.buy(b, 'eve@example.com', 'live', 10);
  PERFORM engagement_scan(true);
  IF EXISTS (SELECT 1 FROM engagement_notifications WHERE environment = 'live') THEN RAISE EXCEPTION 'live queued while live off'; END IF;
  UPDATE engagement_settings SET live_enabled = true;
  PERFORM pg_temp.buy(a, 'dan@example.com', 'live', 10);
  PERFORM engagement_scan(true);
  IF (SELECT array_agg(email_hash) FROM engagement_notifications WHERE environment = 'live') IS DISTINCT FROM ARRAY[pg_temp.h('eve@example.com')] THEN RAISE EXCEPTION 'live recipients wrong'; END IF;
  IF (SELECT (data->>'a_cents', data->>'b_cents') FROM engagement_notifications WHERE environment = 'live') IS DISTINCT FROM ('1500'::text,'1000'::text) THEN RAISE EXCEPTION 'live score includes sandbox pulls'; END IF;
  UPDATE engagement_settings SET live_enabled = false;

  -- Claim: one claimer gets each row; a concurrent claim gets nothing; a stale overtaken (side leads again) is dropped.
  SELECT array_agg(id) INTO ids FROM engagement_claim(10);
  -- Live was switched off after queueing, so the live row is cancelled, not sent.
  IF (SELECT status FROM engagement_notifications WHERE environment = 'live') <> 'disabled' THEN RAISE EXCEPTION 'live switch-off not honoured'; END IF;
  IF (SELECT count(*) FROM engagement_claim(10)) <> 0 THEN RAISE EXCEPTION 'double claim'; END IF;
  -- Final standing: after step 20 Notion leads, so Ann's overtaken (Notion lost lead) is stale; Bob's is still true.
  IF (SELECT status FROM engagement_notifications WHERE email_hash = pg_temp.h('ann@example.com') AND kind='overtaken') <> 'stale' THEN RAISE EXCEPTION 'stale overtaken was not dropped'; END IF;
  IF (SELECT status FROM engagement_notifications WHERE email_hash = pg_temp.h('bob@example.com') AND kind='overtaken') <> 'sending' THEN RAISE EXCEPTION 'true overtaken not claimed'; END IF;
  -- Provider failure: retry keeps the row, three failures end it and clear the address.
  SELECT id INTO r_old FROM engagement_notifications WHERE email_hash = pg_temp.h('bob@example.com') AND kind='overtaken';
  IF engagement_finish(r_old, 'retry', 'provider_5xx') <> 'ok' THEN RAISE EXCEPTION 'finish retry'; END IF;
  IF (SELECT (status, recipient_email IS NOT NULL) FROM engagement_notifications WHERE id = r_old) IS DISTINCT FROM ('pending'::text, true) THEN RAISE EXCEPTION 'retry state'; END IF;
  FOR i IN 1..2 LOOP
    UPDATE engagement_notifications SET next_attempt_at = now() WHERE id = r_old;
    PERFORM engagement_claim(10);
    PERFORM engagement_finish(r_old, 'retry', 'provider_5xx');
  END LOOP;
  IF (SELECT (status, recipient_email IS NULL, attempts) FROM engagement_notifications WHERE id = r_old) IS DISTINCT FROM ('failed'::text, true, 3) THEN RAISE EXCEPTION 'retry cap'; END IF;
  -- A crashed sender: lease expiry hands the row back once, with the same id (the provider idempotency key).
  UPDATE engagement_notifications SET status='pending', attempts=0, recipient_email='bob@example.com', next_attempt_at=now(), last_error=NULL WHERE id = r_old;
  PERFORM engagement_claim(10);
  UPDATE engagement_notifications SET lease_until = now() - interval '1 second' WHERE id = r_old;
  IF (SELECT array_agg(id) FROM engagement_claim(10)) IS DISTINCT FROM ARRAY[r_old] THEN RAISE EXCEPTION 'lease not reclaimed'; END IF;
  IF engagement_finish(r_old, 'sent') <> 'ok' THEN RAISE EXCEPTION 'finish sent'; END IF;
  IF (SELECT recipient_email FROM engagement_notifications WHERE id = r_old) IS NOT NULL THEN RAISE EXCEPTION 'address kept after send'; END IF;
  IF engagement_finish(r_old, 'sent') <> 'not_sending' THEN RAISE EXCEPTION 'second finish changed a sent row'; END IF;

  -- Closing soon (weekly window 6 h). Hopeless gap: nothing. Closable gap: one per trailing backer, once.
  INSERT INTO matchups(slug,title,status) VALUES('eng2-'||gen_random_uuid(),'Tea vs Coffee','active') RETURNING id INTO m2;
  INSERT INTO sides(matchup_id,position,name) VALUES(m2,0,'Tea') RETURNING id INTO a2;
  INSERT INTO sides(matchup_id,position,name) VALUES(m2,1,'Coffee') RETURNING id INTO b2;
  r2 := ensure_open_round(m2);
  PERFORM pg_temp.buy(a2, 'tia@example.com', 'sandbox', 5);
  FOR i IN 1..8 LOOP PERFORM pg_temp.buy(b2, 'cole@example.com', 'sandbox', 25); END LOOP;
  UPDATE rounds SET ends_at = now() + interval '2 hours' WHERE id = r2;
  PERFORM engagement_scan(true, now() + interval '31 minutes');
  IF EXISTS (SELECT 1 FROM engagement_notifications WHERE round_id = r2) THEN RAISE EXCEPTION 'hopeless gap ($5 vs $200) emailed'; END IF;
  IF engagement_closable(2500, 2600) IS NOT TRUE OR engagement_closable(2600, 2600) IS NOT FALSE OR engagement_closable(4000, 20000) IS NOT TRUE
     OR engagement_closable(4100, 20000) IS NOT FALSE OR engagement_closable(0, 100) IS NOT FALSE THEN RAISE EXCEPTION 'closable rule'; END IF;
  FOR i IN 1..7 LOOP PERFORM pg_temp.buy(a2, 'tom@example.com', 'sandbox', 25); END LOOP;  -- Tea 180 vs Coffee 200: gap $20
  PERFORM engagement_scan(true, now() + interval '31 minutes');
  PERFORM engagement_scan(true, now() + interval '41 minutes');
  IF (SELECT array_agg(email_hash ORDER BY email_hash) FROM engagement_notifications WHERE round_id = r2 AND kind = 'closing_soon')
     IS DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY[pg_temp.h('tia@example.com'), pg_temp.h('tom@example.com')]) x) THEN RAISE EXCEPTION 'closing soon recipients'; END IF;
  -- Outside the window nothing new is queued.
  UPDATE rounds SET ends_at = now() + interval '3 days' WHERE id = r2;
  DELETE FROM engagement_notifications WHERE round_id = r2;
  PERFORM engagement_scan(true, now() + interval '31 minutes');
  IF EXISTS (SELECT 1 FROM engagement_notifications WHERE round_id = r2) THEN RAISE EXCEPTION 'closing soon outside window'; END IF;

  -- Unsubscribe is permanent, immediate and cancels queued mail; receipts are untouched (different system).
  IF engagement_unsubscribe(pg_temp.h('tom@example.com'), 'link') <> 'unsubscribed' THEN RAISE EXCEPTION 'unsubscribe'; END IF;
  IF engagement_unsubscribe('not-a-hash', 'link') <> 'invalid' THEN RAISE EXCEPTION 'bad hash accepted'; END IF;

  -- Round result: one per person, true streaks only. Two earlier closed rounds where Tia backed the winner (Tea).
  FOR i IN 1..2 LOOP
    INSERT INTO rounds(matchup_id, starts_at, ends_at, status, closed_at, winner_side_id, round_length)
      VALUES (m2, now() - (i * interval '8 days'), now() - (i * interval '8 days') + interval '7 days', 'closed', now() - interval '3 days', a2, 'weekly') RETURNING id INTO r_old;
    INSERT INTO engagement_round_state(round_id, environment, result_done) VALUES (r_old, 'sandbox', true);
    INSERT INTO dodo_orders(id, environment, kind, expected_cents, product_id, status, buyer_email, side_id, quantity)
      VALUES (r_old, 'sandbox', 'pull_5', 500, 'prod', 'paid', 'tia@example.com', a2, 5);
    INSERT INTO pulls(round_id, matchup_id, side_id, amount_cents, stripe_session_id, environment, created_at)
      VALUES (r_old, m2, a2, 500, 'eng-old:'||r_old, 'sandbox', now() - (i * interval '8 days') + interval '1 day');
    INSERT INTO dodo_bundle_applications(order_id, payment_id, pull_id, quantity, amount_cents, environment)
      SELECT r_old, 'pay-old-'||r_old, id, 5, 500, 'sandbox' FROM pulls WHERE stripe_session_id = 'eng-old:'||r_old;
  END LOOP;
  PERFORM pg_temp.buy(a2, 'tia@example.com', 'sandbox', 25);  -- Tea 205 vs Coffee 200
  PERFORM close_round(r2);
  IF (SELECT winner_side_id FROM rounds WHERE id = r2) <> a2 THEN RAISE EXCEPTION 'fixture winner'; END IF;
  PERFORM engagement_scan(true); PERFORM engagement_scan(true);
  IF (SELECT count(*) FROM engagement_notifications WHERE round_id = r2 AND kind = 'round_result') <> 2 THEN RAISE EXCEPTION 'result count (Tia + Cole; Tom unsubscribed)'; END IF;
  IF (SELECT (data->>'streak')::int FROM engagement_notifications WHERE round_id = r2 AND kind='round_result' AND email_hash = pg_temp.h('tia@example.com')) <> 3 THEN RAISE EXCEPTION 'Tia streak should be 3'; END IF;
  IF (SELECT (data->>'streak')::int FROM engagement_notifications WHERE round_id = r2 AND kind='round_result' AND email_hash = pg_temp.h('cole@example.com')) <> 0 THEN RAISE EXCEPTION 'Cole lost: streak 0'; END IF;
  IF EXISTS (SELECT 1 FROM engagement_notifications WHERE email_hash = pg_temp.h('tom@example.com') AND status IN ('pending','sending')) THEN RAISE EXCEPTION 'unsubscribed address still queued'; END IF;

  -- Independence: no trigger on pulls, rounds or orders touches engagement tables.
  IF EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid WHERE NOT t.tgisinternal AND t.tgrelid IN ('pulls'::regclass,'rounds'::regclass,'dodo_orders'::regclass,'payglocal_orders'::regclass) AND pg_get_functiondef(p.oid) ILIKE '%engagement%') THEN RAISE EXCEPTION 'engagement wired into pull/payment path'; END IF;
  -- Private: no anon/authenticated access to any engagement table or function.
  IF has_table_privilege('anon','engagement_notifications','SELECT') OR has_table_privilege('authenticated','engagement_unsubscribes','SELECT')
     OR has_function_privilege('anon','engagement_unsubscribe(text,text)','EXECUTE') OR has_function_privilege('authenticated','engagement_scan(boolean,timestamptz)','EXECUTE') THEN RAISE EXCEPTION 'engagement data exposed'; END IF;
  RAISE NOTICE 'engagement.sql: all checks passed';
END $$;
ROLLBACK;

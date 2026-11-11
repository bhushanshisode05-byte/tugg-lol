-- Local disposable PostgreSQL only. Every fixture rolls back.
-- Personal pull cards: totals stored right after each pull, and the public read exposes only public facts.
BEGIN;
DO $$
DECLARE m uuid; a uuid; b uuid; p1 uuid; p2 uuid; p3 uuid; p4 uuid; c record; cols text;
BEGIN
  INSERT INTO matchups(slug,title) VALUES('snap-'||gen_random_uuid(),'Messi vs Ronaldo') RETURNING id INTO m;
  INSERT INTO sides(matchup_id,position,name) VALUES(m,0,'Messi') RETURNING id INTO a;
  INSERT INTO sides(matchup_id,position,name) VALUES(m,1,'Ronaldo') RETURNING id INTO b;
  PERFORM record_pull('snap:1', b, 2500, '', '', 'US', 'sandbox');
  PERFORM record_pull('snap:2', a, 500, 'Harry', '', 'US', 'sandbox');
  PERFORM record_pull('snap:3', b, 100, '', '', 'US', 'live');
  PERFORM record_pull('snap:4', b, 700, '', '', 'US', 'sandbox');
  SELECT id INTO p1 FROM pulls WHERE stripe_session_id='snap:1';
  SELECT id INTO p2 FROM pulls WHERE stripe_session_id='snap:2';
  SELECT id INTO p3 FROM pulls WHERE stripe_session_id='snap:3';
  SELECT id INTO p4 FROM pulls WHERE stripe_session_id='snap:4';
  -- Each pull keeps the score right after itself, even after later pulls move the rope.
  IF (SELECT (round_a_after_cents, round_b_after_cents) FROM pulls WHERE id=p1) IS DISTINCT FROM (0::bigint, 2500::bigint) THEN RAISE EXCEPTION 'p1 snapshot wrong'; END IF;
  IF (SELECT (round_a_after_cents, round_b_after_cents) FROM pulls WHERE id=p2) IS DISTINCT FROM (500::bigint, 2500::bigint) THEN RAISE EXCEPTION 'p2 snapshot wrong'; END IF;
  -- A live pull counts live pulls only, exactly as the live site shows totals.
  IF (SELECT (round_a_after_cents, round_b_after_cents) FROM pulls WHERE id=p3) IS DISTINCT FROM (0::bigint, 100::bigint) THEN RAISE EXCEPTION 'p3 live snapshot wrong'; END IF;
  IF (SELECT (round_a_after_cents, round_b_after_cents) FROM pulls WHERE id=p4) IS DISTINCT FROM (500::bigint, 3300::bigint) THEN RAISE EXCEPTION 'p4 snapshot wrong'; END IF;
  -- The live total stays matched to record_pull's own round totals.
  IF (SELECT (total_a_cents,total_b_cents) FROM rounds WHERE matchup_id=m) IS DISTINCT FROM (500::bigint, 3300::bigint) THEN RAISE EXCEPTION 'round totals changed'; END IF;

  -- Public read: snapshot totals, display name, nothing private; live-only mode hides test pulls.
  SELECT * INTO c FROM tugg_pull_card(false, p2);
  IF c.total_a_cents <> 500 OR c.total_b_cents <> 2500 OR c.display_name <> 'Harry' OR c.amount_cents <> 500 THEN RAISE EXCEPTION 'card read wrong'; END IF;
  IF EXISTS (SELECT 1 FROM tugg_pull_card(true, p2)) THEN RAISE EXCEPTION 'live mode exposed a test pull'; END IF;
  IF NOT EXISTS (SELECT 1 FROM tugg_pull_card(true, p3)) THEN RAISE EXCEPTION 'live pull missing in live mode'; END IF;
  SELECT pg_get_function_result('public.tugg_pull_card(boolean,uuid)'::regprocedure) INTO cols;
  IF cols ~* '(session|email|payment|checkout|country|environment|shout)' THEN RAISE EXCEPTION 'private column in public read: %', cols; END IF;
  -- Derived fallback for a pull whose snapshot is missing.
  UPDATE pulls SET round_a_after_cents=NULL, round_b_after_cents=NULL WHERE id=p2;
  SELECT * INTO c FROM tugg_pull_card(false, p2);
  IF c.total_a_cents <> 500 OR c.total_b_cents <> 2500 THEN RAISE EXCEPTION 'derived fallback wrong: % %', c.total_a_cents, c.total_b_cents; END IF;
  -- Hidden (rejected) matchups are not served.
  UPDATE matchups SET status='rejected' WHERE id=m;
  IF EXISTS (SELECT 1 FROM tugg_pull_card(false, p1)) THEN RAISE EXCEPTION 'rejected matchup card served'; END IF;
END $$;
-- Grants: anonymous visitors may call the public read but cannot read pulls or call the trigger function.
DO $$ BEGIN
  IF NOT has_function_privilege('anon','public.tugg_pull_card(boolean,uuid)','EXECUTE') THEN RAISE EXCEPTION 'anon cannot read cards'; END IF;
  IF has_function_privilege('anon','public.tugg_pull_snapshot()','EXECUTE') THEN RAISE EXCEPTION 'anon can call snapshot trigger fn'; END IF;
  IF has_table_privilege('anon','public.pulls','SELECT') THEN RAISE EXCEPTION 'anon can read pulls'; END IF;
END $$;
ROLLBACK;

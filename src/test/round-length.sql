-- Local disposable PostgreSQL only. Every fixture rolls back.
-- Round length: global default + per-matchup override, weekly closes (winner, tie, empty, Hall of Fame), daily still works.
BEGIN;
DO $$
DECLARE g text; m uuid; d uuid; a uuid; b uuid; da uuid; db uuid; r1 uuid; r2 uuid; r3 uuid; rd rounds; won int; n int; ev jsonb; res jsonb; t record;
BEGIN
  -- Boundaries: weekly ends Monday 00:00 UTC strictly after the start; daily ends the next 00:00 UTC.
  IF round_end_after('weekly','2026-11-12 00:53Z') <> '2026-11-16 00:00Z' THEN RAISE EXCEPTION 'weekly from Thursday'; END IF;
  IF round_end_after('weekly','2026-11-16 00:00Z') <> '2026-11-23 00:00Z' THEN RAISE EXCEPTION 'weekly from Monday 00:00'; END IF;
  IF round_end_after('weekly','2026-11-16 00:30:05Z') <> '2026-11-23 00:00Z' THEN RAISE EXCEPTION 'weekly after final-hour extension'; END IF;
  IF round_end_after('weekly','2026-11-15 23:59:59Z') <> '2026-11-16 00:00Z' THEN RAISE EXCEPTION 'weekly from Sunday night'; END IF;
  IF round_end_after('daily','2026-11-12 00:53Z') <> '2026-11-13 00:00Z' THEN RAISE EXCEPTION 'daily'; END IF;
  IF round_end_after('daily','2026-11-12 23:59:59Z') <> '2026-11-13 00:00Z' THEN RAISE EXCEPTION 'daily late'; END IF;

  -- Settings: one row; matchups without an override follow it.
  SELECT default_length INTO g FROM round_settings;
  IF g NOT IN ('daily','weekly') OR (SELECT count(*) FROM round_settings) <> 1 THEN RAISE EXCEPTION 'settings row'; END IF;
  UPDATE round_settings SET default_length = 'weekly';
  INSERT INTO matchups(slug,title,status) VALUES('rl-w-'||gen_random_uuid(),'Notion vs Obsidian','active') RETURNING id INTO m;
  INSERT INTO sides(matchup_id,position,name) VALUES(m,0,'Notion') RETURNING id INTO a;
  INSERT INTO sides(matchup_id,position,name) VALUES(m,1,'Obsidian') RETURNING id INTO b;
  INSERT INTO matchups(slug,title,status,round_length) VALUES('rl-d-'||gen_random_uuid(),'Busy rope','active','daily') RETURNING id INTO d;
  INSERT INTO sides(matchup_id,position,name) VALUES(d,0,'DA') RETURNING id INTO da;
  INSERT INTO sides(matchup_id,position,name) VALUES(d,1,'DB') RETURNING id INTO db;
  r1 := ensure_open_round(m);
  SELECT * INTO rd FROM rounds WHERE id = r1;
  IF rd.round_length <> 'weekly' OR rd.ends_at <> round_end_after('weekly', now()) OR extract(isodow FROM rd.ends_at AT TIME ZONE 'utc') <> 1
     OR (rd.ends_at AT TIME ZONE 'utc')::time <> '00:00' THEN RAISE EXCEPTION 'weekly round opened wrong: % %', rd.round_length, rd.ends_at; END IF;
  r2 := ensure_open_round(d);
  SELECT * INTO rd FROM rounds WHERE id = r2;
  IF rd.round_length <> 'daily' OR rd.ends_at <> round_end_after('daily', now()) THEN RAISE EXCEPTION 'per-matchup daily override ignored'; END IF;
  IF ensure_open_round(m) <> r1 THEN RAISE EXCEPTION 'second open round'; END IF;

  -- Pulls still land in the matchup's currently open round, exactly as before.
  res := record_pull('rl:1', a, 500, 'Ann', '', 'US', 'sandbox');
  IF (res->>'round')::uuid <> r1 THEN RAISE EXCEPTION 'pull went to another round'; END IF;
  PERFORM record_pull('rl:2', b, 2500, 'Bo', '', 'US', 'sandbox');
  PERFORM record_pull('rl:3', b, 100, '', '', 'US', 'live');
  PERFORM record_pull('rl:4', da, 300, '', '', 'US', 'sandbox');
  IF (SELECT (total_a_cents,total_b_cents) FROM rounds WHERE id=r1) IS DISTINCT FROM (500::bigint, 2600::bigint) THEN RAISE EXCEPTION 'weekly totals'; END IF;

  -- Daily recap facts per matchup for one day, whatever round the pulls belong to; live mode counts live pulls only.
  SELECT * INTO t FROM tugg_day_matchups(false, now() - interval '1 hour', now() + interval '1 hour') WHERE matchup_id = m;
  IF t.a_cents <> 500 OR t.b_cents <> 2600 OR t.pulls <> 3 THEN RAISE EXCEPTION 'day matchups: %', t; END IF;
  SELECT * INTO t FROM tugg_day_matchups(true, now() - interval '1 hour', now() + interval '1 hour') WHERE matchup_id = m;
  IF t.a_cents <> 0 OR t.b_cents <> 100 OR t.pulls <> 1 THEN RAISE EXCEPTION 'live day matchups: %', t; END IF;
  IF EXISTS (SELECT 1 FROM tugg_day_matchups(false, now() + interval '1 hour', now() + interval '2 hours')) THEN RAISE EXCEPTION 'other day counted'; END IF;

  -- Changing a matchup's length never moves its open round; the next round uses the new length.
  UPDATE matchups SET round_length = 'weekly' WHERE id = d;
  IF (SELECT ends_at FROM rounds WHERE id = r2) <> round_end_after('daily', now()) THEN RAISE EXCEPTION 'open round moved'; END IF;

  -- Weekly close: Monday 00:00 UTC arrives. Obsidian has more money and wins.
  UPDATE rounds SET starts_at = now() - interval '7 days', ends_at = now() - interval '1 second' WHERE id IN (r1, r2);
  n := close_due_rounds();
  IF n < 2 THEN RAISE EXCEPTION 'due rounds not closed: %', n; END IF;
  SELECT * INTO rd FROM rounds WHERE id = r1;
  IF rd.status <> 'closed' OR rd.winner_side_id <> b OR rd.result_note IS NOT NULL OR rd.closed_at IS NULL THEN RAISE EXCEPTION 'weekly winner wrong: %', rd; END IF;
  IF (SELECT (wins, current_streak, best_streak) FROM sides WHERE id = b) IS DISTINCT FROM (1, 1, 1) THEN RAISE EXCEPTION 'winner streak'; END IF;
  IF (SELECT (wins, current_streak) FROM sides WHERE id = a) IS DISTINCT FROM (0, 0) THEN RAISE EXCEPTION 'loser streak'; END IF;
  SELECT detail INTO ev FROM events WHERE kind = 'round_closed' AND detail->>'round' = r1::text;
  IF ev->>'winner' <> b::text THEN RAISE EXCEPTION 'close event'; END IF;
  -- Hall of Fame reads closed rounds that have a winner, for public matchups.
  IF NOT EXISTS (SELECT 1 FROM rounds r JOIN matchups x ON x.id = r.matchup_id AND x.status IN ('active','retired')
                 WHERE r.id = r1 AND r.status = 'closed' AND r.winner_side_id IS NOT NULL) THEN RAISE EXCEPTION 'no Hall of Fame entry'; END IF;
  -- Final totals (live-only too) are what the result card shows.
  SELECT * INTO t FROM tugg_round_totals(false, ARRAY[r1]);
  IF t.total_a_cents <> 500 OR t.total_b_cents <> 2600 THEN RAISE EXCEPTION 'final totals'; END IF;
  -- The next weekly round opens at the close and ends the following Monday.
  SELECT * INTO rd FROM rounds WHERE matchup_id = m AND status = 'open';
  IF rd.round_length <> 'weekly' OR rd.ends_at <> round_end_after('weekly', now()) OR rd.total_a_cents + rd.total_b_cents <> 0 THEN RAISE EXCEPTION 'next weekly round: %', rd; END IF;
  r3 := rd.id;
  -- The busy rope switched to weekly from its next round.
  SELECT * INTO rd FROM rounds WHERE matchup_id = d AND status = 'open';
  IF rd.round_length <> 'weekly' THEN RAISE EXCEPTION 'override change not applied at next round'; END IF;
  IF (SELECT winner_side_id FROM rounds WHERE id = r2) <> da THEN RAISE EXCEPTION 'daily winner'; END IF;

  -- Weekly tie: the side that reached the final total first wins.
  PERFORM record_pull('rl:5', a, 700, '', '', 'US', 'sandbox');
  UPDATE pulls SET created_at = now() - interval '2 hours' WHERE stripe_session_id = 'rl:5';
  PERFORM record_pull('rl:6', b, 700, '', '', 'US', 'sandbox');
  UPDATE pulls SET created_at = now() - interval '1 hour' WHERE stripe_session_id = 'rl:6';
  UPDATE rounds SET starts_at = now() - interval '7 days', ends_at = now() - interval '1 second' WHERE id = r3;
  PERFORM close_due_rounds();
  SELECT * INTO rd FROM rounds WHERE id = r3;
  IF rd.winner_side_id <> a OR rd.result_note <> 'tie' THEN RAISE EXCEPTION 'weekly tie-break: %', rd; END IF;
  IF (SELECT (wins, current_streak, best_streak) FROM sides WHERE id = b) IS DISTINCT FROM (1, 0, 1) THEN RAISE EXCEPTION 'tie streaks'; END IF;

  -- Empty weekly round: no winner, streaks unchanged, a fresh weekly round opens.
  SELECT id INTO r3 FROM rounds WHERE matchup_id = m AND status = 'open';
  UPDATE rounds SET starts_at = now() - interval '7 days', ends_at = now() - interval '1 second' WHERE id = r3;
  PERFORM close_due_rounds();
  SELECT * INTO rd FROM rounds WHERE id = r3;
  IF rd.winner_side_id IS NOT NULL OR rd.result_note <> 'empty' THEN RAISE EXCEPTION 'empty weekly round'; END IF;
  IF (SELECT (wins, current_streak) FROM sides WHERE id = a) IS DISTINCT FROM (1, 1) THEN RAISE EXCEPTION 'empty round changed streak'; END IF;
  IF (SELECT count(*) FROM rounds WHERE matchup_id = m AND status = 'closed') <> 3 THEN RAISE EXCEPTION 'closed round count'; END IF;

  -- A pull arriving after Monday 00:00 but before the close job closes the old round first and lands in the new one.
  SELECT id INTO r3 FROM rounds WHERE matchup_id = m AND status = 'open';
  UPDATE rounds SET ends_at = now() - interval '1 second' WHERE id = r3;
  res := record_pull('rl:7', a, 100, '', '', 'US', 'sandbox');
  IF (res->>'round')::uuid = r3 OR (SELECT status FROM rounds WHERE id = r3) <> 'closed'
     OR (SELECT round_length FROM rounds WHERE id = (res->>'round')::uuid) <> 'weekly' THEN RAISE EXCEPTION 'late pull round'; END IF;

  -- Final-hour rule still applies at the end of a weekly round.
  r3 := (res->>'round')::uuid;
  UPDATE rounds SET ends_at = now() + interval '5 minutes' WHERE id = r3;
  res := record_pull('rl:8', b, 300, '', '', 'US', 'sandbox');
  IF NOT (res->>'extended')::boolean OR (SELECT ends_at FROM rounds WHERE id = r3) <> now() + interval '15 minutes' THEN RAISE EXCEPTION 'final-hour extension'; END IF;

  -- Retired matchups get no new round.
  UPDATE matchups SET status = 'retired' WHERE id = m;
  UPDATE rounds SET ends_at = now() - interval '500 milliseconds' WHERE id = r3;
  PERFORM close_due_rounds();
  IF EXISTS (SELECT 1 FROM rounds WHERE matchup_id = m AND status = 'open') THEN RAISE EXCEPTION 'retired matchup reopened'; END IF;

  -- Public history for the all-time score: 5 closed rounds; the latest-ending one is the previous round.
  SELECT * INTO t FROM tugg_matchup_history(false, ARRAY[m, m]);
  IF t.closed_rounds <> 5 OR t.last_round_id <> r3 OR t.last_round_length <> 'weekly' OR t.last_b_cents <> 300 OR t.last_a_cents <> 100 OR t.last_winner_side_id <> b THEN RAISE EXCEPTION 'history: %', t; END IF;
  IF (SELECT count(*) FROM tugg_matchup_history(false, ARRAY[m, m])) <> 1 THEN RAISE EXCEPTION 'duplicate ids repeated'; END IF;
  SELECT * INTO t FROM tugg_matchup_history(true, ARRAY[m]);
  IF t.last_a_cents <> 0 OR t.last_b_cents <> 0 THEN RAISE EXCEPTION 'live history counted test pulls: %', t; END IF;
  UPDATE matchups SET status = 'rejected' WHERE id = m;
  IF EXISTS (SELECT 1 FROM tugg_matchup_history(false, ARRAY[m])) THEN RAISE EXCEPTION 'hidden matchup history served'; END IF;
  UPDATE matchups SET status = 'retired' WHERE id = m;

  -- Global switch back to daily: matchups without an override follow it.
  UPDATE round_settings SET default_length = 'daily';
  INSERT INTO matchups(slug,title,status) VALUES('rl-g-'||gen_random_uuid(),'G','active') RETURNING id INTO m;
  IF (SELECT round_length FROM rounds WHERE id = ensure_open_round(m)) <> 'daily' THEN RAISE EXCEPTION 'global daily ignored'; END IF;
  -- Pull card round length follows the same visibility rules as the card itself.
  SELECT id INTO r1 FROM pulls WHERE stripe_session_id = 'rl:1';
  IF tugg_pull_round_length(false, r1) <> 'weekly' THEN RAISE EXCEPTION 'pull round length'; END IF;
  IF tugg_pull_round_length(true, r1) IS NOT NULL THEN RAISE EXCEPTION 'live mode exposed a test pull'; END IF;
END $$;

-- Privileges: only the service may change rounds or read settings; the pull-card length is public.
DO $$ BEGIN
  IF has_table_privilege('anon','public.round_settings','SELECT') OR has_table_privilege('authenticated','public.round_settings','SELECT') THEN RAISE EXCEPTION 'settings readable by visitors'; END IF;
  IF has_function_privilege('anon','public.matchup_round_length(uuid)','EXECUTE') THEN RAISE EXCEPTION 'anon can read settings via function'; END IF;
  IF has_function_privilege('anon','public.tugg_day_matchups(boolean,timestamptz,timestamptz)','EXECUTE') THEN RAISE EXCEPTION 'anon can run recap aggregate'; END IF;
  IF has_function_privilege('anon','public.close_round(uuid)','EXECUTE') OR has_function_privilege('anon','public.ensure_open_round(uuid)','EXECUTE') THEN RAISE EXCEPTION 'anon can change rounds'; END IF;
  IF NOT has_function_privilege('anon','public.tugg_pull_round_length(boolean,uuid)','EXECUTE') THEN RAISE EXCEPTION 'pull card length not public'; END IF;
  IF NOT has_function_privilege('anon','public.tugg_matchup_history(boolean,uuid[])','EXECUTE') THEN RAISE EXCEPTION 'history not public'; END IF;
  IF pg_get_function_result('public.tugg_matchup_history(boolean,uuid[])'::regprocedure) ~* '(session|email|payment|checkout|country|environment|shout|display)' THEN RAISE EXCEPTION 'private column in history'; END IF;
  IF NOT has_function_privilege('service_role','public.close_due_rounds()','EXECUTE') THEN RAISE EXCEPTION 'service lost close'; END IF;
END $$;
ROLLBACK;
\echo ok: round-length

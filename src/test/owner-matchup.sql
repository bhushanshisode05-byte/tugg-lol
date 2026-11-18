-- Local disposable PostgreSQL only. Every fixture rolls back.
-- Owner-created matchups: allowed source, first round opens, and creation income never moves.
BEGIN;
DO $$
DECLARE before jsonb; after jsonb; m uuid; u uuid; r uuid; n int;
BEGIN
  -- A paid user matchup already counted, so the figure is non-trivial.
  INSERT INTO matchups(slug,title,description,category,source,status) VALUES ('paid-x-vs-y','Paid X vs Y','','Tech','user','active') RETURNING id INTO u;
  INSERT INTO dodo_orders(environment,kind,expected_cents,product_id,matchup_id,status,payment_id) VALUES ('sandbox','standard',900,'p',u,'paid','pay_paid_x');
  before := tugg_creation_revenue();
  IF coalesce((before->'dodo'->>'sandbox')::int,0) < 900 THEN RAISE EXCEPTION 'fixture not counted: %', before; END IF;

  -- The owner path: matchup with source owner, two sides, first round.
  INSERT INTO matchups(slug,title,description,category,source,status) VALUES ('owner-a-vs-b','Owner A vs B','','Food','owner','active') RETURNING id INTO m;
  INSERT INTO sides(matchup_id,position,name,emoji,color) VALUES (m,0,'Owner A','🍕','#ff3b30'),(m,1,'Owner B','🍔','#0a84ff');
  r := ensure_open_round(m);
  IF NOT EXISTS (SELECT 1 FROM rounds WHERE id = r AND matchup_id = m AND status = 'open') THEN RAISE EXCEPTION 'no open round'; END IF;
  after := tugg_creation_revenue();
  IF after IS DISTINCT FROM before THEN RAISE EXCEPTION 'owner matchup changed revenue: % -> %', before, after; END IF;

  -- Even a stray paid order or creator record on an owner matchup is never income.
  INSERT INTO creators(matchup_id,tier,environment) VALUES (m,'featured','sandbox'),(m,'standard','live');
  INSERT INTO dodo_orders(environment,kind,expected_cents,product_id,matchup_id,status,payment_id) VALUES ('sandbox','featured',2900,'p',m,'paid','pay_owner_a'),('live','standard',900,'p',m,'paid','pay_owner_b');
  after := tugg_creation_revenue();
  IF after IS DISTINCT FROM before THEN RAISE EXCEPTION 'owner creator record counted: % -> %', before, after; END IF;

  -- Control: the figure does move for a paid user matchup, so the checks above can fail.
  INSERT INTO dodo_orders(environment,kind,expected_cents,product_id,matchup_id,status,payment_id) VALUES ('sandbox','featured',2900,'p',u,'paid','pay_paid_y');
  after := tugg_creation_revenue();
  IF (after->'dodo'->>'sandbox')::int IS DISTINCT FROM (before->'dodo'->>'sandbox')::int + 2900 THEN RAISE EXCEPTION 'paid record not counted: %', after; END IF;

  -- Unknown sources are still refused; old sources still accepted.
  BEGIN
    INSERT INTO matchups(slug,title,description,category,source,status) VALUES ('bogus','Bogus','','Tech','bogus','active');
    RAISE EXCEPTION 'bogus source accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  SELECT count(*) INTO n FROM (VALUES ('seed'),('user'),('ai'),('owner')) s(v) WHERE pg_get_constraintdef((SELECT oid FROM pg_constraint WHERE conname='matchups_source_check')) LIKE '%''' || v || '''%';
  IF n <> 4 THEN RAISE EXCEPTION 'source list changed'; END IF;

  -- Still owner-only.
  IF has_function_privilege('anon','public.tugg_creation_revenue()','EXECUTE') OR has_function_privilege('authenticated','public.tugg_creation_revenue()','EXECUTE') THEN RAISE EXCEPTION 'revenue readable by visitors'; END IF;
  IF NOT has_function_privilege('service_role','public.tugg_creation_revenue()','EXECUTE') THEN RAISE EXCEPTION 'service lost revenue'; END IF;
END $$;
ROLLBACK;
\echo ok: owner-matchup

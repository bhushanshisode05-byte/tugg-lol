-- Player notification (engagement) emails: overtaken, closing soon, round result.
-- Additive and service-only. Nothing here runs inside record_pull, close_round or payment fulfilment: a separate
-- scheduled scan reads committed pulls and rounds, so a notification problem can never block or roll back them.

CREATE TABLE IF NOT EXISTS public.engagement_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  live_enabled boolean NOT NULL DEFAULT false,
  sandbox_enabled boolean NOT NULL DEFAULT false,
  eligible_from timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.engagement_settings IS 'Single row. Engagement email per environment is off until enabled. Only pulls (and round closes) at or after eligible_from count, so buyers who paid before the purchase disclosure was published are never emailed.';
INSERT INTO public.engagement_settings(id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.engagement_unsubscribes (
  email_hash text PRIMARY KEY CHECK (email_hash ~ '^[a-f0-9]{64}$'),
  source text NOT NULL CHECK (source IN ('link','one_click','owner')),
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.engagement_unsubscribes IS 'Permanent engagement-email opt-outs keyed by SHA-256 of the lowercased address. Never affects receipts or refund notices.';

CREATE TABLE IF NOT EXISTS public.engagement_round_state (
  round_id uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  environment text NOT NULL CHECK (environment IN ('sandbox','live')),
  leader_side_id uuid,
  result_done boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (round_id, environment)
);

CREATE TABLE IF NOT EXISTS public.engagement_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('overtaken','closing_soon','round_result')),
  round_id uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  matchup_id uuid NOT NULL,
  environment text NOT NULL CHECK (environment IN ('sandbox','live')),
  email_hash text NOT NULL CHECK (email_hash ~ '^[a-f0-9]{64}$'),
  recipient_email text,
  backed_side_ids uuid[] NOT NULL,
  data jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed','expired','stale','unsubscribed','disabled')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  claimed_at timestamptz,
  last_error text CHECK (last_error IS NULL OR last_error ~ '^[a-z_0-9]{1,40}$'),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE (kind, round_id, environment, email_hash)
);
COMMENT ON TABLE public.engagement_notifications IS 'Once-only engagement outbox. The unique key is the frequency cap: one email per kind, person, round and environment. recipient_email is cleared at every terminal status.';
CREATE INDEX IF NOT EXISTS engagement_notifications_due_idx ON public.engagement_notifications(next_attempt_at) WHERE status IN ('pending','sending');
CREATE INDEX IF NOT EXISTS engagement_notifications_recipient_idx ON public.engagement_notifications(email_hash, claimed_at);

GRANT ALL ON public.engagement_settings, public.engagement_unsubscribes, public.engagement_round_state, public.engagement_notifications TO service_role;
ALTER TABLE public.engagement_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_unsubscribes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_round_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_notifications ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.engagement_email_hash(p_email text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT encode(sha256(convert_to(lower(trim(p_email)), 'UTF8')), 'hex') $$;

-- Paid buyers of one round's pulls in one environment (private). Only provider-verified buyer emails count.
CREATE OR REPLACE FUNCTION public.engagement_round_buyers(p_round uuid, p_env text, p_from timestamptz)
RETURNS TABLE(pull_id uuid, side_id uuid, created_at timestamptz, email text, email_hash text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.side_id, p.created_at, lower(trim(x.raw)), engagement_email_hash(x.raw)
  FROM pulls p
  CROSS JOIN LATERAL (SELECT coalesce(
    (SELECT o.buyer_email FROM dodo_bundle_applications a JOIN dodo_orders o ON o.id = a.order_id
      WHERE a.pull_id = p.id AND o.status = 'paid' AND o.environment = p_env AND o.refund_status IS NULL),
    (SELECT o.buyer_email FROM dodo_basket_lines l JOIN dodo_orders o ON o.id = l.order_id
      WHERE l.pull_id = p.id AND o.status = 'paid' AND o.environment = p_env),
    (SELECT o.buyer_email FROM payglocal_orders o
      WHERE p.stripe_session_id ~ '^payglocal:[0-9a-f-]{36}$' AND o.id = substr(p.stripe_session_id, 11)::uuid
        AND o.status = 'paid' AND o.environment = p_env AND o.refund_status IS NULL)) AS raw) x
  WHERE p.round_id = p_round AND p.environment = p_env AND p.created_at >= p_from
    AND x.raw IS NOT NULL AND length(x.raw) <= 254 AND x.raw ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
$$;

-- Queue one kind for the people in a round. p_side limits it to people who backed only that side.
CREATE OR REPLACE FUNCTION public.engagement_enqueue(p_kind text, p_round uuid, p_matchup uuid, p_env text, p_side uuid,
  p_data jsonb, p_expires timestamptz, p_from timestamptz, p_now timestamptz) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  INSERT INTO engagement_notifications(kind, round_id, matchup_id, environment, email_hash, recipient_email, backed_side_ids, data, expires_at)
  SELECT p_kind, p_round, p_matchup, p_env, b.email_hash, min(b.email), array_agg(DISTINCT b.side_id ORDER BY b.side_id), p_data, p_expires
  FROM engagement_round_buyers(p_round, p_env, p_from) b
  WHERE NOT EXISTS (SELECT 1 FROM engagement_unsubscribes u WHERE u.email_hash = b.email_hash)
    AND (p_kind <> 'closing_soon' OR NOT EXISTS (SELECT 1 FROM engagement_notifications o WHERE o.kind = 'overtaken'
         AND o.round_id = p_round AND o.environment = p_env AND o.email_hash = b.email_hash AND o.created_at > p_now - interval '2 hours'))
  GROUP BY b.email_hash
  HAVING (p_side IS NULL OR bool_and(b.side_id = p_side))
     AND (p_kind <> 'closing_soon' OR max(b.created_at) < p_now - interval '30 minutes')
  ON CONFLICT (kind, round_id, environment, email_hash) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.engagement_closing_window(p_length text) RETURNS interval
LANGUAGE sql IMMUTABLE AS $$ SELECT CASE WHEN p_length = 'weekly' THEN interval '6 hours' ELSE interval '2 hours' END $$;

-- Closable: behind by no more than $25 or 20% of the leading side's round total, whichever is larger.
CREATE OR REPLACE FUNCTION public.engagement_closable(p_gap bigint, p_leader bigint) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$ SELECT p_gap > 0 AND p_gap <= greatest(2500, (p_leader * 20) / 100) $$;

-- One serial scan: lead flips, closing-soon checks and closed-round results per environment.
CREATE OR REPLACE FUNCTION public.engagement_scan(p_enqueue boolean, p_now timestamptz DEFAULT now()) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE st engagement_settings; env text; enabled boolean; r record; leader uuid; trail_side uuid; base jsonb; k integer;
  n_over integer := 0; n_close integer := 0; n_result integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('tugg-engagement-scan'));
  SELECT * INTO st FROM engagement_settings WHERE id;
  FOREACH env IN ARRAY ARRAY['live','sandbox'] LOOP
    enabled := p_enqueue AND st.eligible_from IS NOT NULL AND CASE env WHEN 'live' THEN st.live_enabled ELSE st.sandbox_enabled END;
    FOR r IN
      SELECT rd.id, rd.matchup_id, rd.ends_at, rd.round_length, m.title, m.slug,
             sa.id AS a_id, sa.name AS a_name, sb.id AS b_id, sb.name AS b_name,
             coalesce(sum(p.amount_cents) FILTER (WHERE p.side_id = sa.id), 0)::bigint AS a_cents,
             coalesce(sum(p.amount_cents) FILTER (WHERE p.side_id = sb.id), 0)::bigint AS b_cents,
             s.round_id IS NOT NULL AS has_state, s.leader_side_id AS prev_leader
      FROM rounds rd
      JOIN matchups m ON m.id = rd.matchup_id AND m.status = 'active'
      JOIN sides sa ON sa.matchup_id = rd.matchup_id AND sa.position = 0
      JOIN sides sb ON sb.matchup_id = rd.matchup_id AND sb.position = 1
      JOIN pulls p ON p.round_id = rd.id AND p.environment = env
      LEFT JOIN engagement_round_state s ON s.round_id = rd.id AND s.environment = env
      WHERE rd.status = 'open' AND rd.ends_at > p_now
      GROUP BY rd.id, m.id, sa.id, sb.id, s.round_id, s.leader_side_id
    LOOP
      leader := CASE WHEN r.a_cents > r.b_cents THEN r.a_id WHEN r.b_cents > r.a_cents THEN r.b_id END;
      base := jsonb_build_object('title', r.title, 'slug', r.slug, 'round_length', r.round_length,
        'a_id', r.a_id, 'a_name', r.a_name, 'b_id', r.b_id, 'b_name', r.b_name, 'a_cents', r.a_cents, 'b_cents', r.b_cents, 'ends_at', r.ends_at);
      IF NOT r.has_state THEN
        INSERT INTO engagement_round_state(round_id, environment, leader_side_id) VALUES (r.id, env, leader);
      ELSIF leader IS NOT NULL AND leader IS DISTINCT FROM r.prev_leader THEN
        -- A strict lead passed from one side to the other (ties in between keep the previous leader).
        IF enabled AND r.prev_leader IS NOT NULL THEN
          n_over := n_over + engagement_enqueue('overtaken', r.id, r.matchup_id, env, r.prev_leader,
            base || jsonb_build_object('leader_id', leader), least(r.ends_at, p_now + interval '3 hours'), st.eligible_from, p_now);
        END IF;
        UPDATE engagement_round_state SET leader_side_id = leader, updated_at = p_now WHERE round_id = r.id AND environment = env;
      END IF;
      IF enabled AND leader IS NOT NULL AND r.ends_at - p_now <= engagement_closing_window(r.round_length)
         AND r.ends_at - p_now > interval '5 minutes' AND engagement_closable(abs(r.a_cents - r.b_cents), greatest(r.a_cents, r.b_cents)) THEN
        trail_side := CASE WHEN leader = r.a_id THEN r.b_id ELSE r.a_id END;
        n_close := n_close + engagement_enqueue('closing_soon', r.id, r.matchup_id, env, trail_side,
          base || jsonb_build_object('leader_id', leader), r.ends_at, st.eligible_from, p_now);
      END IF;
    END LOOP;

    FOR r IN
      SELECT rd.id, rd.matchup_id, rd.starts_at, rd.closed_at, rd.round_length, rd.winner_side_id, rd.result_note, m.title, m.slug,
             m.status = 'active' AS still_active, sa.id AS a_id, sa.name AS a_name, sb.id AS b_id, sb.name AS b_name,
             coalesce(sum(p.amount_cents) FILTER (WHERE p.side_id = sa.id), 0)::bigint AS a_cents,
             coalesce(sum(p.amount_cents) FILTER (WHERE p.side_id = sb.id), 0)::bigint AS b_cents
      FROM rounds rd
      JOIN matchups m ON m.id = rd.matchup_id AND m.status IN ('active','retired')
      JOIN sides sa ON sa.matchup_id = rd.matchup_id AND sa.position = 0
      JOIN sides sb ON sb.matchup_id = rd.matchup_id AND sb.position = 1
      JOIN pulls p ON p.round_id = rd.id AND p.environment = env
      WHERE rd.status = 'closed' AND rd.winner_side_id IS NOT NULL AND rd.closed_at > p_now - interval '48 hours'
        AND NOT EXISTS (SELECT 1 FROM engagement_round_state s WHERE s.round_id = rd.id AND s.environment = env AND s.result_done)
      GROUP BY rd.id, m.id, sa.id, sb.id
    LOOP
      IF enabled AND r.closed_at >= st.eligible_from THEN
        WITH rs AS (
          SELECT x.id, x.winner_side_id, row_number() OVER (ORDER BY x.starts_at DESC) AS rn
          FROM (SELECT id, winner_side_id, starts_at FROM rounds WHERE matchup_id = r.matchup_id AND status = 'closed' AND starts_at <= r.starts_at
                ORDER BY starts_at DESC LIMIT 30) x),
        part AS (
          SELECT rs.rn, b.email_hash FROM rs CROSS JOIN LATERAL engagement_round_buyers(rs.id, env, '-infinity'::timestamptz) b
          GROUP BY rs.rn, rs.winner_side_id, b.email_hash
          HAVING rs.winner_side_id IS NOT NULL AND bool_and(b.side_id = rs.winner_side_id)),
        cur AS (
          SELECT b.email_hash, min(b.email) AS email, array_agg(DISTINCT b.side_id ORDER BY b.side_id) AS sides
          FROM engagement_round_buyers(r.id, env, st.eligible_from) b
          WHERE NOT EXISTS (SELECT 1 FROM engagement_unsubscribes u WHERE u.email_hash = b.email_hash)
          GROUP BY b.email_hash)
        INSERT INTO engagement_notifications(kind, round_id, matchup_id, environment, email_hash, recipient_email, backed_side_ids, data, expires_at)
        SELECT 'round_result', r.id, r.matchup_id, env, cur.email_hash, cur.email, cur.sides,
          jsonb_build_object('title', r.title, 'slug', r.slug, 'round_length', r.round_length, 'a_id', r.a_id, 'a_name', r.a_name,
            'b_id', r.b_id, 'b_name', r.b_name, 'a_cents', r.a_cents, 'b_cents', r.b_cents, 'winner_id', r.winner_side_id,
            'tie', r.result_note = 'tie', 'next_round', r.still_active,
            'streak', (SELECT coalesce(min(g), 31) - 1 FROM generate_series(1, 31) g
                       WHERE NOT EXISTS (SELECT 1 FROM part WHERE part.email_hash = cur.email_hash AND part.rn = g))),
          r.closed_at + interval '24 hours'
        FROM cur
        ON CONFLICT (kind, round_id, environment, email_hash) DO NOTHING;
        GET DIAGNOSTICS k = ROW_COUNT;
        n_result := n_result + k;
      END IF;
      INSERT INTO engagement_round_state(round_id, environment, result_done) VALUES (r.id, env, true)
      ON CONFLICT (round_id, environment) DO UPDATE SET result_done = true, updated_at = p_now;
    END LOOP;
  END LOOP;
  UPDATE engagement_notifications SET status = 'expired', recipient_email = NULL, lease_until = NULL
   WHERE status IN ('pending','sending') AND expires_at <= p_now;
  DELETE FROM engagement_notifications WHERE created_at < p_now - interval '90 days';
  RETURN jsonb_build_object('overtaken', n_over, 'closing_soon', n_close, 'round_result', n_result, 'enqueue', p_enqueue);
END $$;

-- Claim due notifications for sending with a lease. Re-checks everything at send time: expiry, unsubscribe,
-- environment switch, whether an overtaken/closing-soon message is still true, and per-person caps.
CREATE OR REPLACE FUNCTION public.engagement_claim(p_limit integer, p_lease_seconds integer DEFAULT 600, p_now timestamptz DEFAULT now())
RETURNS TABLE(id uuid, kind text, environment text, recipient_email text, email_hash text, backed_side_ids uuid[], data jsonb,
  attempts integer, ends_at timestamptz, a_cents bigint, b_cents bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE st engagement_settings; n engagement_notifications; rd rounds; a bigint; b bigint; mine bigint; taken integer := 0; hourly integer; daily integer;
BEGIN
  SELECT * INTO st FROM engagement_settings WHERE engagement_settings.id;
  FOR n IN SELECT * FROM engagement_notifications e
           WHERE (e.status = 'pending' AND e.next_attempt_at <= p_now) OR (e.status = 'sending' AND e.lease_until <= p_now)
           ORDER BY CASE e.kind WHEN 'closing_soon' THEN 0 WHEN 'overtaken' THEN 1 ELSE 2 END, e.created_at
           LIMIT greatest(p_limit, 0) * 5
           FOR UPDATE SKIP LOCKED
  LOOP
    EXIT WHEN taken >= p_limit;
    IF n.expires_at <= p_now THEN
      UPDATE engagement_notifications SET status = 'expired', recipient_email = NULL, lease_until = NULL WHERE id = n.id; CONTINUE;
    END IF;
    IF n.attempts >= 3 THEN
      UPDATE engagement_notifications SET status = 'failed', last_error = coalesce(last_error, 'lease_expired'), recipient_email = NULL, lease_until = NULL WHERE id = n.id; CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM engagement_unsubscribes u WHERE u.email_hash = n.email_hash) THEN
      UPDATE engagement_notifications SET status = 'unsubscribed', recipient_email = NULL, lease_until = NULL WHERE id = n.id; CONTINUE;
    END IF;
    IF NOT coalesce(CASE n.environment WHEN 'live' THEN st.live_enabled ELSE st.sandbox_enabled END, false) THEN
      UPDATE engagement_notifications SET status = 'disabled', recipient_email = NULL, lease_until = NULL WHERE id = n.id; CONTINUE;
    END IF;
    SELECT * INTO rd FROM rounds WHERE rounds.id = n.round_id;
    SELECT coalesce(sum(p.amount_cents) FILTER (WHERE p.side_id = (n.data->>'a_id')::uuid), 0),
           coalesce(sum(p.amount_cents) FILTER (WHERE p.side_id = (n.data->>'b_id')::uuid), 0)
      INTO a, b FROM pulls p WHERE p.round_id = n.round_id AND p.environment = n.environment;
    IF n.kind <> 'round_result' THEN
      mine := CASE WHEN n.backed_side_ids[1] = (n.data->>'a_id')::uuid THEN a ELSE b END;
      IF rd.status <> 'open' OR rd.ends_at <= p_now OR mine >= (a + b - mine) THEN
        UPDATE engagement_notifications SET status = 'stale', recipient_email = NULL, lease_until = NULL WHERE id = n.id; CONTINUE;
      END IF;
    ELSE
      a := (n.data->>'a_cents')::bigint; b := (n.data->>'b_cents')::bigint;
    END IF;
    SELECT count(*) FILTER (WHERE e.claimed_at > p_now - interval '1 hour'), count(*) INTO hourly, daily
      FROM engagement_notifications e
     WHERE e.email_hash = n.email_hash AND e.id <> n.id AND e.status IN ('sending','sent') AND e.claimed_at > p_now - interval '24 hours';
    IF hourly >= 4 OR daily >= 12 THEN
      UPDATE engagement_notifications SET status = 'pending', lease_until = NULL, next_attempt_at = p_now + interval '20 minutes' WHERE id = n.id; CONTINUE;
    END IF;
    UPDATE engagement_notifications SET status = 'sending', attempts = attempts + 1, claimed_at = p_now,
      lease_until = p_now + make_interval(secs => greatest(p_lease_seconds, 60)) WHERE id = n.id;
    taken := taken + 1;
    id := n.id; kind := n.kind; environment := n.environment; recipient_email := n.recipient_email; email_hash := n.email_hash;
    backed_side_ids := n.backed_side_ids; data := n.data; attempts := n.attempts + 1; ends_at := rd.ends_at; a_cents := a; b_cents := b;
    RETURN NEXT;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.engagement_finish(p_id uuid, p_outcome text, p_error text DEFAULT NULL, p_retry_after integer DEFAULT NULL, p_now timestamptz DEFAULT now())
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE err text := CASE WHEN p_error ~ '^[a-z_0-9]{1,40}$' THEN p_error END; n integer;
BEGIN
  IF p_outcome = 'sent' THEN
    UPDATE engagement_notifications SET status = 'sent', sent_at = p_now, recipient_email = NULL, lease_until = NULL, last_error = NULL WHERE id = p_id AND status = 'sending';
  ELSIF p_outcome = 'failed' THEN
    UPDATE engagement_notifications SET status = 'failed', recipient_email = NULL, lease_until = NULL, last_error = coalesce(err, 'send_failed') WHERE id = p_id AND status = 'sending';
  ELSIF p_outcome = 'retry' THEN
    UPDATE engagement_notifications SET
      status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'pending' END,
      recipient_email = CASE WHEN attempts >= 3 THEN NULL ELSE recipient_email END,
      next_attempt_at = p_now + make_interval(secs => greatest(coalesce(p_retry_after, 0), 300 * attempts)),
      lease_until = NULL, last_error = coalesce(err, 'retry')
    WHERE id = p_id AND status = 'sending';
  ELSE RETURN 'invalid';
  END IF;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN CASE WHEN n = 1 THEN 'ok' ELSE 'not_sending' END;
END $$;

-- Permanent opt-out for one address (by hash). Cancels anything still queued for it.
CREATE OR REPLACE FUNCTION public.engagement_unsubscribe(p_hash text, p_source text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_hash !~ '^[a-f0-9]{64}$' OR p_source NOT IN ('link','one_click','owner') THEN RETURN 'invalid'; END IF;
  INSERT INTO engagement_unsubscribes(email_hash, source) VALUES (p_hash, p_source) ON CONFLICT (email_hash) DO NOTHING;
  UPDATE engagement_notifications SET status = 'unsubscribed', recipient_email = NULL, lease_until = NULL WHERE email_hash = p_hash AND status = 'pending';
  RETURN 'unsubscribed';
END $$;

REVOKE ALL ON FUNCTION public.engagement_email_hash(text), public.engagement_round_buyers(uuid, text, timestamptz),
  public.engagement_enqueue(text, uuid, uuid, text, uuid, jsonb, timestamptz, timestamptz, timestamptz),
  public.engagement_closing_window(text), public.engagement_closable(bigint, bigint), public.engagement_scan(boolean, timestamptz),
  public.engagement_claim(integer, integer, timestamptz), public.engagement_finish(uuid, text, text, integer, timestamptz),
  public.engagement_unsubscribe(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.engagement_email_hash(text), public.engagement_round_buyers(uuid, text, timestamptz),
  public.engagement_enqueue(text, uuid, uuid, text, uuid, jsonb, timestamptz, timestamptz, timestamptz),
  public.engagement_closing_window(text), public.engagement_closable(bigint, bigint), public.engagement_scan(boolean, timestamptz),
  public.engagement_claim(integer, integer, timestamptz), public.engagement_finish(uuid, text, text, integer, timestamptz),
  public.engagement_unsubscribe(text, text) TO service_role;
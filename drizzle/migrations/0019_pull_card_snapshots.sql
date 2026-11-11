-- Personal pull share cards: round totals as they stood immediately after each pull.
-- Additive only: two nullable columns, a backfill, a fail-safe trigger and a narrow public read.
ALTER TABLE public.pulls ADD COLUMN IF NOT EXISTS round_a_after_cents bigint, ADD COLUMN IF NOT EXISTS round_b_after_cents bigint;
COMMENT ON COLUMN public.pulls.round_a_after_cents IS 'Round total for side A (position 0) immediately after this pull, counted the way the site displayed it at the time (live pulls only for a live pull). Snapshot for share cards.';
COMMENT ON COLUMN public.pulls.round_b_after_cents IS 'Round total for side B (position 1) immediately after this pull. Snapshot for share cards.';

-- Backfill existing pulls in their recorded order.
UPDATE public.pulls p SET round_a_after_cents = t.a, round_b_after_cents = t.b
FROM public.pulls p1
CROSS JOIN LATERAL (
  SELECT coalesce(sum(q.amount_cents) FILTER (WHERE s.position = 0), 0)::bigint AS a,
         coalesce(sum(q.amount_cents) FILTER (WHERE s.position = 1), 0)::bigint AS b
  FROM public.pulls q JOIN public.sides s ON s.id = q.side_id
  WHERE q.round_id = p1.round_id AND (q.created_at, q.id) <= (p1.created_at, p1.id)
    AND (p1.environment <> 'live' OR q.environment = 'live')
) t
WHERE p.id = p1.id AND p.round_a_after_cents IS NULL;

-- Filled while record_pull already holds the round row lock, so concurrent pulls cannot interleave.
-- Any error leaves the snapshot empty and never blocks the pull itself.
CREATE OR REPLACE FUNCTION public.tugg_pull_snapshot() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE pos smallint; sa bigint; sb bigint;
BEGIN
  BEGIN
    SELECT position INTO pos FROM sides WHERE id = NEW.side_id;
    SELECT coalesce(sum(q.amount_cents) FILTER (WHERE s.position = 0), 0),
           coalesce(sum(q.amount_cents) FILTER (WHERE s.position = 1), 0)
      INTO sa, sb
      FROM pulls q JOIN sides s ON s.id = q.side_id
      WHERE q.round_id = NEW.round_id AND (coalesce(NEW.environment,'sandbox') <> 'live' OR q.environment = 'live');
    NEW.round_a_after_cents := sa + CASE WHEN pos = 0 THEN NEW.amount_cents ELSE 0 END;
    NEW.round_b_after_cents := sb + CASE WHEN pos = 1 THEN NEW.amount_cents ELSE 0 END;
  EXCEPTION WHEN OTHERS THEN
    NEW.round_a_after_cents := NULL;
    NEW.round_b_after_cents := NULL;
  END;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tugg_pull_snapshot() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS pulls_snapshot_totals ON public.pulls;
CREATE TRIGGER pulls_snapshot_totals BEFORE INSERT ON public.pulls
FOR EACH ROW EXECUTE FUNCTION public.tugg_pull_snapshot();

-- Public pull card facts: no session ids, payment references, emails, country or environment.
CREATE OR REPLACE FUNCTION public.tugg_pull_card(p_live boolean, p_pull uuid)
RETURNS TABLE(id uuid, matchup_id uuid, side_id uuid, amount_cents int, display_name text, round_starts_at timestamptz, total_a_cents bigint, total_b_cents bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.matchup_id, p.side_id, p.amount_cents, p.display_name, r.starts_at,
         coalesce(p.round_a_after_cents, d.a), coalesce(p.round_b_after_cents, d.b)
  FROM pulls p
  JOIN matchups m ON m.id = p.matchup_id AND m.status IN ('active','retired')
  JOIN rounds r ON r.id = p.round_id
  CROSS JOIN LATERAL (
    SELECT coalesce(sum(q.amount_cents) FILTER (WHERE s.position = 0), 0)::bigint AS a,
           coalesce(sum(q.amount_cents) FILTER (WHERE s.position = 1), 0)::bigint AS b
    FROM pulls q JOIN sides s ON s.id = q.side_id
    WHERE q.round_id = p.round_id AND (q.created_at, q.id) <= (p.created_at, p.id)
      AND (p.environment <> 'live' OR q.environment = 'live')
  ) d
  WHERE p.id = p_pull AND (NOT p_live OR p.environment = 'live')
$$;
REVOKE ALL ON FUNCTION public.tugg_pull_card(boolean, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tugg_pull_card(boolean, uuid) TO anon, authenticated, service_role;
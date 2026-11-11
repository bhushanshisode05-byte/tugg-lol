-- Personal pull card receipt line: the pulled side's all-time total as it stood right after that pull.
-- Additive only: one narrow public read. All-time after a pull = this side's pulls in earlier (closed) rounds
-- + the stored round snapshot, so the figure is permanent and always consistent with the card's round totals.
CREATE OR REPLACE FUNCTION public.tugg_pull_side_prior_cents(p_live boolean, p_pull uuid)
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum(q.amount_cents), 0)::bigint
  FROM pulls p
  JOIN matchups m ON m.id = p.matchup_id AND m.status IN ('active','retired')
  JOIN rounds pr ON pr.id = p.round_id
  JOIN pulls q ON q.side_id = p.side_id AND q.round_id <> p.round_id
    AND (p.environment <> 'live' OR q.environment = 'live')
  JOIN rounds qr ON qr.id = q.round_id AND qr.starts_at < pr.starts_at
  WHERE p.id = p_pull AND (NOT p_live OR p.environment = 'live')
$$;
REVOKE ALL ON FUNCTION public.tugg_pull_side_prior_cents(boolean, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tugg_pull_side_prior_cents(boolean, uuid) TO anon, authenticated, service_role;
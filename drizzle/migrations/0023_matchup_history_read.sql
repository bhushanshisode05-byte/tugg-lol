-- Public history for each matchup's all-time score and the previous round: closed-round count and the latest
-- closed round's result with totals counted the way the site shows them (live pulls only when live). No private fields.
CREATE OR REPLACE FUNCTION public.tugg_matchup_history(p_live boolean, p_matchups uuid[])
RETURNS TABLE(matchup_id uuid, closed_rounds bigint, last_round_id uuid, last_winner_side_id uuid, last_note text,
              last_starts_at timestamptz, last_ends_at timestamptz, last_round_length text, last_a_cents bigint, last_b_cents bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT x.id,
         (SELECT count(*) FROM rounds c WHERE c.matchup_id = x.id AND c.status = 'closed'),
         l.id, l.winner_side_id, l.result_note, l.starts_at, l.ends_at, l.round_length,
         coalesce(t.a, 0)::bigint, coalesce(t.b, 0)::bigint
  FROM (SELECT DISTINCT unnest(p_matchups[1:200]) AS id) x
  JOIN matchups m ON m.id = x.id AND m.status IN ('active','retired')
  LEFT JOIN LATERAL (
    SELECT r.* FROM rounds r WHERE r.matchup_id = x.id AND r.status = 'closed' ORDER BY r.ends_at DESC, r.starts_at DESC LIMIT 1
  ) l ON true
  LEFT JOIN LATERAL (
    SELECT sum(p.amount_cents) FILTER (WHERE s.position = 0) AS a, sum(p.amount_cents) FILTER (WHERE s.position = 1) AS b
    FROM pulls p JOIN sides s ON s.id = p.side_id
    WHERE p.round_id = l.id AND (NOT p_live OR p.environment = 'live')
  ) t ON true
$$;
REVOKE ALL ON FUNCTION public.tugg_matchup_history(boolean, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tugg_matchup_history(boolean, uuid[]) TO anon, authenticated, service_role;
-- Round length becomes a setting: a global default plus an optional per-matchup override.
-- Additive only. Every existing round keeps its row, totals, winner and end time; each round now records its own length.

CREATE TABLE IF NOT EXISTS public.round_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  default_length text NOT NULL DEFAULT 'weekly' CHECK (default_length IN ('daily','weekly')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.round_settings TO service_role;
ALTER TABLE public.round_settings ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.round_settings IS 'Single row. default_length applies to every matchup whose matchups.round_length is null. A change takes effect when each matchup''s current round closes; open rounds keep their end time.';
-- The preview and the live site share this database, so the live schedule stays daily until the weekly wording is published.
INSERT INTO public.round_settings(id, default_length) VALUES (true, 'daily') ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.matchups ADD COLUMN IF NOT EXISTS round_length text CHECK (round_length IN ('daily','weekly'));
COMMENT ON COLUMN public.matchups.round_length IS 'Optional per-matchup round length (daily or weekly). Null uses round_settings.default_length. Takes effect from the next round.';

ALTER TABLE public.rounds ADD COLUMN IF NOT EXISTS round_length text NOT NULL DEFAULT 'daily' CHECK (round_length IN ('daily','weekly'));
COMMENT ON COLUMN public.rounds.round_length IS 'Length this round was opened with. Every round before round lengths existed was daily.';

-- Next boundary strictly after p_from: 00:00 UTC tomorrow (daily) or Monday 00:00 UTC (weekly, ISO calendar week).
CREATE OR REPLACE FUNCTION public.round_end_after(p_length text, p_from timestamptz) RETURNS timestamptz
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_length = 'weekly'
    THEN (date_trunc('week', p_from AT TIME ZONE 'utc') + interval '7 days') AT TIME ZONE 'utc'
    ELSE (date_trunc('day', p_from AT TIME ZONE 'utc') + interval '1 day') AT TIME ZONE 'utc' END
$$;

CREATE OR REPLACE FUNCTION public.matchup_round_length(p_matchup uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT round_length FROM matchups WHERE id = p_matchup),
                  (SELECT default_length FROM round_settings WHERE id),
                  'weekly')
$$;
REVOKE ALL ON FUNCTION public.matchup_round_length(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.matchup_round_length(uuid) TO service_role;

-- Same as before; a missing round now opens with the matchup's length.
CREATE OR REPLACE FUNCTION public.ensure_open_round(p_matchup uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare r uuid; len text;
begin
  select id into r from rounds where matchup_id = p_matchup and status = 'open';
  if r is null then
    len := matchup_round_length(p_matchup);
    insert into rounds(matchup_id, ends_at, round_length) values (p_matchup, round_end_after(len, now()), len) returning id into r;
  end if;
  return r;
end $$;

-- Winner, tie-break, streaks and event are unchanged; only the next round's length and end time are new.
CREATE OR REPLACE FUNCTION public.close_round(p_round uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare rd rounds; sa uuid; sb uuid; winner uuid; loser uuid; last_a timestamptz; last_b timestamptz; note text; len text;
begin
  select * into rd from rounds where id = p_round and status = 'open' for update;
  if not found then return; end if;
  select id into sa from sides where matchup_id = rd.matchup_id and position = 0;
  select id into sb from sides where matchup_id = rd.matchup_id and position = 1;
  if rd.total_a_cents = 0 and rd.total_b_cents = 0 then
    note := 'empty';
  elsif rd.total_a_cents > rd.total_b_cents then winner := sa; loser := sb;
  elsif rd.total_b_cents > rd.total_a_cents then winner := sb; loser := sa;
  else
    -- tie: side that reached the total first (earlier final pull) wins
    select max(created_at) into last_a from pulls where round_id = p_round and side_id = sa;
    select max(created_at) into last_b from pulls where round_id = p_round and side_id = sb;
    if last_a <= last_b then winner := sa; loser := sb; else winner := sb; loser := sa; end if;
    note := 'tie';
  end if;
  update rounds set status = 'closed', closed_at = now(), winner_side_id = winner, result_note = note where id = p_round;
  if winner is not null then
    update sides set wins = wins + 1, current_streak = current_streak + 1,
      best_streak = greatest(best_streak, current_streak + 1) where id = winner;
    update sides set current_streak = 0 where id = loser;
  end if;
  insert into events(kind, detail) values ('round_closed', jsonb_build_object('round', p_round, 'winner', winner, 'note', note));
  if exists (select 1 from matchups where id = rd.matchup_id and status = 'active') then
    len := matchup_round_length(rd.matchup_id);
    insert into rounds(matchup_id, starts_at, ends_at, round_length) values (rd.matchup_id, now(), round_end_after(len, now()), len);
  end if;
end $$;

-- Daily recap: each matchup's pulls on one UTC day, whatever round they belong to (live-only when live).
CREATE OR REPLACE FUNCTION public.tugg_day_matchups(p_live boolean, p_from timestamptz, p_to timestamptz)
RETURNS TABLE(matchup_id uuid, a_cents bigint, b_cents bigint, pulls bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.matchup_id,
         coalesce(sum(p.amount_cents) FILTER (WHERE s.position = 0), 0)::bigint,
         coalesce(sum(p.amount_cents) FILTER (WHERE s.position = 1), 0)::bigint,
         count(*)::bigint
  FROM pulls p
  JOIN sides s ON s.id = p.side_id
  JOIN matchups m ON m.id = p.matchup_id AND m.status IN ('active','retired')
  WHERE p.created_at >= p_from AND p.created_at < p_to AND (NOT p_live OR p.environment = 'live')
  GROUP BY p.matchup_id
$$;
REVOKE ALL ON FUNCTION public.tugg_day_matchups(boolean, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tugg_day_matchups(boolean, timestamptz, timestamptz) TO service_role;

-- Personal pull card: the length of the round the pull landed in (same visibility rules as tugg_pull_card).
CREATE OR REPLACE FUNCTION public.tugg_pull_round_length(p_live boolean, p_pull uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.round_length
  FROM pulls p
  JOIN matchups m ON m.id = p.matchup_id AND m.status IN ('active','retired')
  JOIN rounds r ON r.id = p.round_id
  WHERE p.id = p_pull AND (NOT p_live OR p.environment = 'live')
$$;
REVOKE ALL ON FUNCTION public.tugg_pull_round_length(boolean, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tugg_pull_round_length(boolean, uuid) TO anon, authenticated, service_role;
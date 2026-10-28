-- Hide raw pulls (stripe_session_id etc.) from the public; serve them via functions.
drop policy if exists "public pulls" on public.pulls;
revoke select on public.pulls from anon, authenticated;
create index if not exists pulls_env_created_idx on public.pulls(environment, created_at desc);

create or replace function public.tugg_recent_pulls(p_live boolean, p_matchup uuid default null, p_limit int default 20)
returns table(id uuid, side_id uuid, matchup_id uuid, amount_cents int, display_name text, shout_out text, country text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.side_id, p.matchup_id, p.amount_cents, p.display_name, p.shout_out, p.country, p.created_at
  from pulls p join matchups m on m.id = p.matchup_id and m.status in ('active','retired')
  where (not p_live or p.environment = 'live') and (p_matchup is null or p.matchup_id = p_matchup)
  order by p.created_at desc limit least(greatest(p_limit,1),100)
$$;

create or replace function public.tugg_round_totals(p_live boolean, p_rounds uuid[])
returns table(round_id uuid, total_a_cents bigint, total_b_cents bigint, pullers int)
language sql stable security definer set search_path = public as $$
  select r.id,
    coalesce(sum(p.amount_cents) filter (where s.position = 0), 0)::bigint,
    coalesce(sum(p.amount_cents) filter (where s.position = 1), 0)::bigint,
    count(distinct coalesce(nullif(p.display_name,''), p.id::text))::int
  from rounds r
  join matchups m on m.id = r.matchup_id and m.status in ('active','retired')
  left join pulls p on p.round_id = r.id and (not p_live or p.environment = 'live')
  left join sides s on s.id = p.side_id
  where r.id = any(p_rounds) group by r.id
$$;

create or replace function public.tugg_side_totals(p_live boolean, p_matchups uuid[])
returns table(side_id uuid, cents bigint)
language sql stable security definer set search_path = public as $$
  select s.id, coalesce(sum(p.amount_cents), 0)::bigint
  from sides s join matchups m on m.id = s.matchup_id and m.status in ('active','retired')
  left join pulls p on p.side_id = s.id and (not p_live or p.environment = 'live')
  where s.matchup_id = any(p_matchups) group by s.id
$$;

create or replace function public.tugg_top_pullers(p_live boolean, p_round uuid, p_limit int default 5)
returns table(side_id uuid, name text, cents bigint)
language sql stable security definer set search_path = public as $$
  select side_id, name, cents from (
    select p.side_id, coalesce(nullif(p.display_name,''),'Anonymous') as name, sum(p.amount_cents)::bigint as cents,
      row_number() over (partition by p.side_id order by sum(p.amount_cents) desc) rn
    from pulls p join matchups m on m.id = p.matchup_id and m.status in ('active','retired')
    where p.round_id = p_round and (not p_live or p.environment = 'live')
    group by p.side_id, coalesce(nullif(p.display_name,''),'Anonymous')
  ) t where rn <= least(greatest(p_limit,1),50) order by side_id, cents desc
$$;

create or replace function public.tugg_countries(p_live boolean, p_matchup uuid default null, p_limit int default 20)
returns table(country text, cents bigint, pulls bigint)
language sql stable security definer set search_path = public as $$
  select p.country, sum(p.amount_cents)::bigint, count(*)::bigint
  from pulls p join matchups m on m.id = p.matchup_id and m.status in ('active','retired')
  where coalesce(p.country,'') <> '' and (not p_live or p.environment = 'live') and (p_matchup is null or p.matchup_id = p_matchup)
  group by p.country order by 2 desc limit least(greatest(p_limit,1),250)
$$;

create or replace function public.tugg_stats(p_live boolean)
returns table(total_cents bigint, total_pulls bigint, pulls_today bigint, today_cents bigint, countries bigint)
language sql stable security definer set search_path = public as $$
  select coalesce(sum(p.amount_cents),0)::bigint, count(*)::bigint,
    count(*) filter (where p.created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc')::bigint,
    coalesce(sum(p.amount_cents) filter (where p.created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'),0)::bigint,
    count(distinct nullif(p.country,''))::bigint
  from pulls p join matchups m on m.id = p.matchup_id and m.status in ('active','retired')
  where (not p_live or p.environment = 'live')
$$;

create or replace function public.tugg_round_leaders(p_live boolean, p_open_only boolean, p_limit int default 15)
returns table(round_id uuid, matchup_id uuid, status text, ends_at timestamptz, total_a_cents bigint, total_b_cents bigint, pullers int)
language sql stable security definer set search_path = public as $$
  select r.id, r.matchup_id, r.status, r.ends_at,
    coalesce(sum(p.amount_cents) filter (where s.position = 0),0)::bigint,
    coalesce(sum(p.amount_cents) filter (where s.position = 1),0)::bigint,
    count(distinct coalesce(nullif(p.display_name,''), p.id::text))::int
  from pulls p
  join rounds r on r.id = p.round_id
  join matchups m on m.id = r.matchup_id and m.status in ('active','retired')
  join sides s on s.id = p.side_id
  where (not p_live or p.environment = 'live') and (not p_open_only or r.status = 'open')
  group by r.id order by sum(p.amount_cents) desc limit least(greatest(p_limit,1),100)
$$;

grant execute on function public.tugg_recent_pulls(boolean,uuid,int), public.tugg_round_totals(boolean,uuid[]),
  public.tugg_side_totals(boolean,uuid[]), public.tugg_top_pullers(boolean,uuid,int), public.tugg_countries(boolean,uuid,int),
  public.tugg_stats(boolean), public.tugg_round_leaders(boolean,boolean,int) to anon, authenticated, service_role;

-- Cleanup of abandoned matchup checkouts.
create or replace function public.cleanup_stale_matchups()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  create temp table _stale on commit drop as
    select id from matchups where status = 'pending_payment' and created_at < now() - interval '24 hours';
  delete from creators where matchup_id in (select id from _stale);
  delete from sides where matchup_id in (select id from _stale);
  delete from matchups where id in (select id from _stale);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.cleanup_stale_matchups() from public, anon, authenticated;
grant execute on function public.cleanup_stale_matchups() to service_role;
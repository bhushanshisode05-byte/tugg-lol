create table public.recaps (
  day date primary key,
  summary text not null,
  body jsonb not null default '{}',
  facts jsonb not null default '{}',
  created_at timestamptz not null default now()
);
grant select on public.recaps to anon, authenticated;
grant all on public.recaps to service_role;
alter table public.recaps enable row level security;
create policy "public recaps" on public.recaps for select to anon, authenticated using (true);

create table public.digest_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);
grant all on public.digest_subscribers to service_role;
alter table public.digest_subscribers enable row level security;

create table public.job_runs (
  job text not null,
  day date not null,
  status text not null default 'running',
  detail jsonb not null default '{}',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  primary key (job, day)
);
grant all on public.job_runs to service_role;
alter table public.job_runs enable row level security;

create table public.job_state (
  job text primary key,
  paused boolean not null default false,
  status int,
  reason text,
  updated_at timestamptz not null default now()
);
grant all on public.job_state to service_role;
alter table public.job_state enable row level security;

create or replace function public.tugg_day_facts(p_live boolean, p_from timestamptz, p_to timestamptz)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'total_cents', coalesce((select sum(amount_cents) from pulls where created_at >= p_from and created_at < p_to and (not p_live or environment = 'live')), 0),
    'pulls', (select count(*) from pulls where created_at >= p_from and created_at < p_to and (not p_live or environment = 'live')),
    'countries', coalesce((select jsonb_agg(jsonb_build_object('country', country, 'pulls', n, 'cents', c) order by n desc) from (
      select country, count(*) n, sum(amount_cents) c from pulls
      where created_at >= p_from and created_at < p_to and (not p_live or environment = 'live') and country is not null
      group by country order by count(*) desc limit 15) x), '[]'::jsonb)
  )
$$;
revoke execute on function public.tugg_day_facts(boolean,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.tugg_day_facts(boolean,timestamptz,timestamptz) to service_role;

create or replace function public.retire_idle_ai_matchups(p_live boolean)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update matchups m set status = 'retired'
  where m.source = 'ai' and m.status = 'active' and m.created_at < now() - interval '14 days'
    and not exists (select 1 from pulls p where p.matchup_id = m.id and (not p_live or p.environment = 'live'));
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.retire_idle_ai_matchups(boolean) from public, anon, authenticated;
grant execute on function public.retire_idle_ai_matchups(boolean) to service_role;
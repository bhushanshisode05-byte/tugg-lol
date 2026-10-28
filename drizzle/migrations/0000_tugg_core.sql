
create table public.matchups (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null default '',
  category text not null default 'Other',
  source text not null default 'seed' check (source in ('seed','user','ai')),
  status text not null default 'active' check (status in ('pending_payment','pending_review','active','rejected','retired')),
  featured_until timestamptz,
  created_at timestamptz not null default now()
);
create table public.sides (
  id uuid primary key default gen_random_uuid(),
  matchup_id uuid not null references public.matchups(id) on delete cascade,
  position smallint not null check (position in (0,1)),
  name text not null,
  emoji text not null default '',
  color text not null default '#ff3b30',
  all_time_cents bigint not null default 0,
  wins int not null default 0,
  current_streak int not null default 0,
  best_streak int not null default 0,
  unique (matchup_id, position)
);
create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  matchup_id uuid not null references public.matchups(id) on delete cascade,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  extensions int not null default 0,
  status text not null default 'open' check (status in ('open','closed')),
  total_a_cents bigint not null default 0,
  total_b_cents bigint not null default 0,
  pullers int not null default 0,
  winner_side_id uuid references public.sides(id),
  result_note text,
  closed_at timestamptz
);
create unique index rounds_one_open on public.rounds(matchup_id) where status = 'open';
create index rounds_matchup_idx on public.rounds(matchup_id, starts_at desc);
create index rounds_due_idx on public.rounds(ends_at) where status = 'open';
create table public.pulls (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds(id) on delete cascade,
  matchup_id uuid not null references public.matchups(id) on delete cascade,
  side_id uuid not null references public.sides(id) on delete cascade,
  amount_cents int not null check (amount_cents > 0),
  display_name text,
  shout_out text,
  country text,
  stripe_session_id text not null unique,
  environment text not null default 'sandbox',
  created_at timestamptz not null default now()
);
create index pulls_round_idx on public.pulls(round_id, created_at desc);
create index pulls_matchup_idx on public.pulls(matchup_id, created_at desc);
create index pulls_created_idx on public.pulls(created_at desc);
create table public.creators (
  id uuid primary key default gen_random_uuid(),
  matchup_id uuid not null references public.matchups(id) on delete cascade,
  email text,
  tier text not null check (tier in ('standard','featured')),
  stripe_session_id text unique,
  payment_intent text,
  refunded boolean not null default false,
  environment text not null default 'sandbox',
  created_at timestamptz not null default now()
);
create table public.moderation_log (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null,
  subject_id text,
  content text,
  verdict text not null,
  reason text,
  created_at timestamptz not null default now()
);
create table public.events (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

grant select on public.matchups, public.sides, public.rounds, public.pulls to anon, authenticated;
grant all on public.matchups, public.sides, public.rounds, public.pulls, public.creators, public.moderation_log, public.events to service_role;

alter table public.matchups enable row level security;
alter table public.sides enable row level security;
alter table public.rounds enable row level security;
alter table public.pulls enable row level security;
alter table public.creators enable row level security;
alter table public.moderation_log enable row level security;
alter table public.events enable row level security;

create policy "public matchups" on public.matchups for select to anon, authenticated using (status in ('active','retired'));
create policy "public sides" on public.sides for select to anon, authenticated using (exists (select 1 from public.matchups m where m.id = matchup_id and m.status in ('active','retired')));
create policy "public rounds" on public.rounds for select to anon, authenticated using (exists (select 1 from public.matchups m where m.id = matchup_id and m.status in ('active','retired')));
create policy "public pulls" on public.pulls for select to anon, authenticated using (true);

alter publication supabase_realtime add table public.rounds;
alter publication supabase_realtime add table public.pulls;

-- next 00:00 UTC
create or replace function public.next_utc_midnight() returns timestamptz language sql stable as $$
  select (date_trunc('day', now() at time zone 'utc') + interval '1 day') at time zone 'utc'
$$;

create or replace function public.ensure_open_round(p_matchup uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare r uuid;
begin
  select id into r from rounds where matchup_id = p_matchup and status = 'open';
  if r is null then
    insert into rounds(matchup_id, ends_at) values (p_matchup, next_utc_midnight()) returning id into r;
  end if;
  return r;
end $$;

create or replace function public.close_round(p_round uuid) returns void
language plpgsql security definer set search_path = public as $$
declare rd rounds; sa uuid; sb uuid; winner uuid; loser uuid; last_a timestamptz; last_b timestamptz; note text;
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
    insert into rounds(matchup_id, starts_at, ends_at) values (rd.matchup_id, now(), next_utc_midnight());
  end if;
end $$;

create or replace function public.close_due_rounds() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select id from rounds where status = 'open' and ends_at <= now() order by ends_at limit 500 loop
    perform close_round(r.id); n := n + 1;
  end loop;
  update matchups set featured_until = null where featured_until is not null and featured_until < now();
  return n;
end $$;

create or replace function public.record_pull(p_session text, p_side uuid, p_amount int, p_name text, p_shout text, p_country text, p_env text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s sides; rid uuid; rd rounds; before_lead smallint; after_lead smallint; extended boolean := false; new_puller boolean;
begin
  if exists (select 1 from pulls where stripe_session_id = p_session) then
    return jsonb_build_object('duplicate', true);
  end if;
  select * into s from sides where id = p_side;
  if not found then raise exception 'side not found'; end if;
  perform close_due_rounds();
  rid := ensure_open_round(s.matchup_id);
  select * into rd from rounds where id = rid for update;
  before_lead := case when rd.total_a_cents > rd.total_b_cents then 0 when rd.total_b_cents > rd.total_a_cents then 1 else null end;
  new_puller := p_name is null or not exists (select 1 from pulls where round_id = rid and display_name = p_name);
  insert into pulls(round_id, matchup_id, side_id, amount_cents, display_name, shout_out, country, stripe_session_id, environment)
  values (rid, s.matchup_id, p_side, p_amount, nullif(p_name,''), nullif(p_shout,''), upper(nullif(p_country,'')), p_session, coalesce(p_env,'sandbox'))
  on conflict (stripe_session_id) do nothing;
  if not found then return jsonb_build_object('duplicate', true); end if;
  update rounds set
    total_a_cents = total_a_cents + case when s.position = 0 then p_amount else 0 end,
    total_b_cents = total_b_cents + case when s.position = 1 then p_amount else 0 end,
    pullers = pullers + case when new_puller then 1 else 0 end
  where id = rid returning * into rd;
  after_lead := case when rd.total_a_cents > rd.total_b_cents then 0 when rd.total_b_cents > rd.total_a_cents then 1 else null end;
  if now() >= rd.ends_at - interval '10 minutes' and after_lead = s.position
     and before_lead is distinct from s.position and rd.extensions < 3 then
    update rounds set ends_at = ends_at + interval '10 minutes', extensions = extensions + 1 where id = rid;
    extended := true;
  end if;
  update sides set all_time_cents = all_time_cents + p_amount where id = p_side;
  return jsonb_build_object('duplicate', false, 'round', rid, 'extended', extended);
end $$;

revoke all on function public.record_pull(text,uuid,int,text,text,text,text) from public, anon, authenticated;
revoke all on function public.close_due_rounds() from public, anon, authenticated;
revoke all on function public.close_round(uuid) from public, anon, authenticated;
revoke all on function public.ensure_open_round(uuid) from public, anon, authenticated;
grant execute on function public.record_pull(text,uuid,int,text,text,text,text), public.close_due_rounds(), public.close_round(uuid), public.ensure_open_round(uuid) to service_role;

-- seed 30 matchups at zero
with seed(slug, a, ae, ac, b, be, bc, cat) as (values
 ('cursor-vs-claude-code','Cursor','🖱️','#3b82f6','Claude Code','🤖','#f97316','Tech'),
 ('notion-vs-obsidian','Notion','📝','#e5e5e5','Obsidian','💎','#8b5cf6','Tech'),
 ('iphone-vs-android','iPhone','📱','#a3a3a3','Android','🤖','#22c55e','Brands'),
 ('mac-vs-windows','Mac','🍎','#d4d4d4','Windows','🪟','#0ea5e9','Tech'),
 ('tabs-vs-spaces','Tabs','⇥','#f59e0b','Spaces','␣','#06b6d4','Tech'),
 ('vs-code-vs-vim','VS Code','💙','#3b82f6','Vim','⌨️','#16a34a','Tech'),
 ('mumbai-vs-delhi','Mumbai','🌊','#0ea5e9','Delhi','🏛️','#ef4444','Cities'),
 ('tokyo-vs-seoul','Tokyo','🗼','#ef4444','Seoul','🏯','#3b82f6','Cities'),
 ('cricket-vs-football','Cricket','🏏','#22c55e','Football','⚽','#f5f5f5','Sports'),
 ('pizza-vs-burgers','Pizza','🍕','#ef4444','Burgers','🍔','#f59e0b','Food'),
 ('coffee-vs-tea','Coffee','☕','#92400e','Tea','🍵','#65a30d','Food'),
 ('sushi-vs-tacos','Sushi','🍣','#fb7185','Tacos','🌮','#eab308','Food'),
 ('dogs-vs-cats','Dogs','🐶','#f59e0b','Cats','🐱','#a855f7','Other'),
 ('marvel-vs-dc','Marvel','🦸','#dc2626','DC','🦇','#2563eb','Entertainment'),
 ('netflix-vs-youtube','Netflix','🎬','#e50914','YouTube','▶️','#ff0033','Entertainment'),
 ('spotify-vs-apple-music','Spotify','🎧','#1db954','Apple Music','🎵','#fa2d48','Brands'),
 ('messi-vs-ronaldo','Messi','🐐','#60a5fa','Ronaldo','👑','#dc2626','Sports'),
 ('real-madrid-vs-barcelona','Real Madrid','⚪','#f5f5f5','Barcelona','🔵','#a50044','Sports'),
 ('lakers-vs-celtics','Lakers','💜','#fdb927','Celtics','☘️','#007a33','Sports'),
 ('star-wars-vs-star-trek','Star Wars','⚔️','#facc15','Star Trek','🖖','#3b82f6','Entertainment'),
 ('mountains-vs-beach','Mountains','🏔️','#64748b','Beach','🏖️','#06b6d4','Other'),
 ('morning-vs-night','Morning','🌅','#f59e0b','Night','🌙','#6366f1','Other'),
 ('summer-vs-winter','Summer','☀️','#f97316','Winter','❄️','#38bdf8','Other'),
 ('pineapple-on-pizza-vs-no-pineapple','Pineapple on pizza','🍍','#facc15','No pineapple','🚫','#ef4444','Food'),
 ('chrome-vs-safari','Chrome','🌐','#22c55e','Safari','🧭','#0ea5e9','Tech'),
 ('playstation-vs-xbox','PlayStation','🎮','#2563eb','Xbox','❎','#16a34a','Brands'),
 ('bitcoin-vs-ethereum','Bitcoin','₿','#f7931a','Ethereum','Ξ','#8b5cf6','Tech'),
 ('remote-vs-office','Remote','🏠','#14b8a6','Office','🏢','#64748b','Other'),
 ('books-vs-movies','Books','📚','#b45309','Movies','🍿','#ef4444','Entertainment'),
 ('sweet-vs-salty','Sweet','🍬','#ec4899','Salty','🧂','#94a3b8','Food')
), m as (
  insert into public.matchups(slug, title, category, source, description)
  select slug, a || ' vs ' || b, cat, 'seed', 'The eternal rivalry: ' || a || ' or ' || b || '? Pull the rope for your side.' from seed
  returning id, slug
)
, sa as (insert into public.sides(matchup_id, position, name, emoji, color) select m.id, 0, s.a, s.ae, s.ac from m join seed s using (slug) returning 1)
, sb as (insert into public.sides(matchup_id, position, name, emoji, color) select m.id, 1, s.b, s.be, s.bc from m join seed s using (slug) returning 1)
insert into public.rounds(matchup_id, ends_at) select id, public.next_utc_midnight() from m;

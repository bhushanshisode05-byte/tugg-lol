create table public.checkout_attempts (
  id bigserial primary key,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index checkout_attempts_ip_time on public.checkout_attempts (ip_hash, created_at);
grant all on public.checkout_attempts to service_role;
grant usage, select on sequence public.checkout_attempts_id_seq to service_role;
alter table public.checkout_attempts enable row level security;

-- Atomically records an attempt; returns false when the IP is over the limit.
create or replace function public.take_checkout_slot(p_ip text, p_max int, p_window_minutes int)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform pg_advisory_xact_lock(hashtext(p_ip));
  delete from checkout_attempts where created_at < now() - interval '1 day';
  select count(*) into n from checkout_attempts
    where ip_hash = p_ip and created_at > now() - make_interval(mins => p_window_minutes);
  if n >= p_max then return false; end if;
  insert into checkout_attempts(ip_hash) values (p_ip);
  return true;
end $$;
revoke execute on function public.take_checkout_slot(text,int,int) from public, anon, authenticated;
grant execute on function public.take_checkout_slot(text,int,int) to service_role;
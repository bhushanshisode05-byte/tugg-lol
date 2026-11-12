"""Disposable local database only; never runs against Tugg's hosted database.
Usage: PGROUND_HOST=/tmp/pgr/sock PGROUND_PORT=55433 PGROUND_DB=t python3 src/test/round-length-concurrency.py
Twenty pulls arrive at once just after a weekly round's Monday 00:00 close time: the old round closes exactly once with the
right winner, exactly one new weekly round opens, and every new pull lands in it."""
import os, subprocess
from concurrent.futures import ThreadPoolExecutor
BASE = ["psql", "-h", os.environ.get("PGROUND_HOST", "/tmp/pgr/sock"), "-p", os.environ.get("PGROUND_PORT", "55433"), "-U", os.environ.get("PGROUND_USER", "postgres"), "-d", os.environ.get("PGROUND_DB", "t"), "-At", "-v", "ON_ERROR_STOP=1"]
def sql(q):
    r = subprocess.run(BASE + ["-c", q], capture_output=True, text=True)
    if r.returncode: raise RuntimeError(r.stderr)
    return r.stdout.strip()
m = sql("insert into matchups(slug,title,status,round_length) values('rlc-'||gen_random_uuid(),'C','active','weekly') returning id").splitlines()[0]
a = sql(f"insert into sides(matchup_id,position,name) values('{m}',0,'A') returning id").splitlines()[0]
b = sql(f"insert into sides(matchup_id,position,name) values('{m}',1,'B') returning id").splitlines()[0]
old = sql(f"select ensure_open_round('{m}')")
try:
    sql(f"select record_pull('rlc:{m}:old','{b}',900,'','','US','sandbox')")
    sql(f"update rounds set starts_at = now() - interval '7 days', ends_at = now() - interval '1 second' where id = '{old}'")
    jobs = [(f"rlc:{m}:{i}", a if i % 2 else b, 100) for i in range(20)]
    with ThreadPoolExecutor(max_workers=20) as pool:
        list(pool.map(lambda j: sql(f"select record_pull('{j[0]}','{j[1]}',{j[2]},'','','US','sandbox')"), jobs))
    closed = sql(f"select status||'|'||(winner_side_id = '{b}')::text from rounds where id = '{old}'")
    assert closed == "closed|true", closed
    events = sql(f"select count(*) from events where kind = 'round_closed' and detail->>'round' = '{old}'")
    assert events == "1", events
    opened = sql(f"select id||'|'||round_length||'|'||(ends_at = round_end_after('weekly', starts_at))::text from rounds where matchup_id = '{m}' and status = 'open'").splitlines()
    assert len(opened) == 1 and opened[0].endswith("|weekly|true"), opened
    new_id = opened[0].split("|")[0]
    placed = sql(f"select count(*) filter (where round_id = '{new_id}')||'|'||count(*) from pulls where matchup_id = '{m}' and stripe_session_id <> 'rlc:{m}:old'")
    assert placed == "20|20", placed
    totals = sql(f"select total_a_cents||'|'||total_b_cents from rounds where id = '{new_id}'")
    assert totals == "1000|1000", totals
    wins = sql(f"select wins from sides where id = '{b}'")
    assert wins == "1", wins
    print("ok: 20 concurrent pulls at a weekly close; one close, one new weekly round, every pull in it")
finally:
    sql(f"delete from events where detail->>'round' = '{old}'")
    sql(f"delete from matchups where id='{m}'")

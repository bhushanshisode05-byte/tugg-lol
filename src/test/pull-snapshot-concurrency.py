"""Disposable local database only; never runs against Tugg's hosted database.
Usage: PGSNAP_HOST=/tmp/pgt PGSNAP_PORT=55432 PGSNAP_DB=t python3 src/test/pull-snapshot-concurrency.py
Twenty concurrent pulls on one rope: every stored snapshot equals the running total in commit order."""
import os, subprocess
from concurrent.futures import ThreadPoolExecutor
BASE = ["psql", "-h", os.environ.get("PGSNAP_HOST", "/tmp/pgt"), "-p", os.environ.get("PGSNAP_PORT", "55432"), "-U", os.environ.get("PGSNAP_USER", "postgres"), "-d", os.environ.get("PGSNAP_DB", "t"), "-At", "-v", "ON_ERROR_STOP=1"]
def sql(q):
    r = subprocess.run(BASE + ["-c", q], capture_output=True, text=True)
    if r.returncode: raise RuntimeError(r.stderr)
    return r.stdout.strip()
m = sql("insert into matchups(slug,title) values('snapc-'||gen_random_uuid(),'C') returning id").splitlines()[0]
a = sql(f"insert into sides(matchup_id,position,name) values('{m}',0,'A') returning id").splitlines()[0]
b = sql(f"insert into sides(matchup_id,position,name) values('{m}',1,'B') returning id").splitlines()[0]
sql(f"select ensure_open_round('{m}')")  # live matchups already have an open round; avoid a fixture-only race
jobs = [(f"snapc:{m}:{i}", a if i % 3 else b, 100 * (i + 1)) for i in range(20)]
try:
    with ThreadPoolExecutor(max_workers=20) as pool:
        list(pool.map(lambda j: sql(f"select record_pull('{j[0]}','{j[1]}',{j[2]},'','','US','sandbox')"), jobs))
    rows = [r.split("|") for r in sql(f"select p.side_id, p.amount_cents, p.round_a_after_cents, p.round_b_after_cents from pulls p where p.matchup_id='{m}' order by p.round_a_after_cents + p.round_b_after_cents").splitlines()]
    assert len(rows) == 20, rows
    ta = tb = 0
    for side, amt, sa, sb in rows:
        if side == a: ta += int(amt)
        else: tb += int(amt)
        assert (int(sa), int(sb)) == (ta, tb), (rows, ta, tb)
    final = sql(f"select total_a_cents||'|'||total_b_cents from rounds where matchup_id='{m}'")
    assert final == f"{ta}|{tb}", (final, ta, tb)
    print(f"ok: 20 concurrent pulls, snapshots match running totals, final {ta}-{tb}")
finally:
    sql(f"delete from matchups where id='{m}'")

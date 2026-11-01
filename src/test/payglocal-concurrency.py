"""Disposable local PostgreSQL ONLY; no application database fixtures."""
import subprocess
from concurrent.futures import ThreadPoolExecutor
BASE = ["psql", "-h", "/tmp/payglocal-db", "-p", "5545", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"]
def sql(query):
    return subprocess.run(BASE + ["-c", query], capture_output=True, text=True)
def one(query):
    r=sql(query)
    assert r.returncode==0, "Local fixture failed"
    return r.stdout.splitlines()[0]
m=one("insert into matchups(slug,title,status) values('pg-concurrency-fixture','Fixture','active') returning id")
a=one(f"insert into sides(matchup_id,position,name) values('{m}',0,'A') returning id")
sql(f"insert into sides(matchup_id,position,name) values('{m}',1,'B')")
o=one(f"insert into payglocal_orders(environment,merchant_unique_id,kind,expected_cents,quantity,side_id,gid,return_path) values('sandbox','Sconcurrencyfixture001','pull_5',500,5,'{a}','concurrencygid','/') returning id")
try:
    with ThreadPoolExecutor(max_workers=10) as pool:
        results=list(pool.map(lambda _:sql(f"select apply_payglocal_payment('{o}','concurrencygid','sandbox',500,'USA')"),range(10)))
    assert all(r.returncode==0 for r in results), "Concurrent apply failed"
    assert sum('"duplicate": false' in r.stdout for r in results)==1, "Must apply exactly once"
    assert one(f"select count(*) from payglocal_ledger where order_id='{o}'")=="2"
    assert one(f"select all_time_cents from sides where id='{a}'")=="500"
    print("PASS: ten concurrent callbacks, one bundle, one credit/debit pair, zero carryover")
finally:
    sql(f"delete from payglocal_ledger where order_id='{o}'; delete from payglocal_orders where id='{o}'; delete from matchups where id='{m}'")
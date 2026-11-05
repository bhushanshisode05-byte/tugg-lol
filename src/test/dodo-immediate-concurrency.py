"""Disposable local database only; never runs against Tugg's hosted database."""
import subprocess
from concurrent.futures import ThreadPoolExecutor
BASE = ["psql", "-h", "/tmp/dodo-immediate-db", "-p", "5546", "-U", "lovable", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"]
def sql(q):
    result = subprocess.run(BASE + ["-c", q], capture_output=True, text=True)
    if result.returncode: raise RuntimeError(result.stderr)
    return result.stdout.splitlines()[0]
m = sql("insert into matchups(slug,title) values('concurrent-'||gen_random_uuid(),'Concurrent') returning id")
s = sql(f"insert into sides(matchup_id,position,name) values('{m}',0,'A') returning id")
sql(f"insert into sides(matchup_id,position,name) values('{m}',1,'B') returning id")
o = sql(f"insert into dodo_orders(environment,kind,product_id,expected_cents,side_id,quantity,payment_id) values('sandbox','pull_5','p',500,'{s}',5,'concurrent-'||gen_random_uuid()) returning id")
p = sql(f"select payment_id from dodo_orders where id='{o}'")
with ThreadPoolExecutor(max_workers=10) as pool:
    results = list(pool.map(lambda _: sql(f"select apply_dodo_bundle('{o}','{p}','sandbox',500,'US')"), range(10)))
assert sum('"duplicate": false' in r for r in results)==1
assert sql(f"select count(*) from pulls where stripe_session_id='dodo:{o}'")=='1'
assert sql(f"select amount_cents from pulls where stripe_session_id='dodo:{o}'")=='500'
assert sql(f"select count(*) from dodo_bundle_applications where order_id='{o}'")=='1'
assert sql("select count(*) from pull_wallets")=='0'
print('PASS: ten concurrent deliveries apply one five-pull bundle with no wallet')
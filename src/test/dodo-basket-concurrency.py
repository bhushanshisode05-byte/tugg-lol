"""Disposable local database only; never runs against Tugg's hosted database.
Usage: PGBASKET_HOST=/tmp/pgbasket PGBASKET_PORT=5547 python3 src/test/dodo-basket-concurrency.py"""
import json, os, subprocess
from concurrent.futures import ThreadPoolExecutor
BASE = ["psql", "-h", os.environ.get("PGBASKET_HOST", "/tmp/pgbasket"), "-p", os.environ.get("PGBASKET_PORT", "5547"), "-U", "lovable", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"]
def sql(q):
    result = subprocess.run(BASE + ["-c", q], capture_output=True, text=True)
    if result.returncode: raise RuntimeError(result.stderr)
    return result.stdout.splitlines()[0] if result.stdout else ""
lines = []
for i in range(3):
    m = sql(f"insert into matchups(slug,title) values('basket-conc-{i}-'||gen_random_uuid(),'C{i}') returning id")
    s = sql(f"insert into sides(matchup_id,position,name) values('{m}',0,'A') returning id")
    sql(f"insert into sides(matchup_id,position,name) values('{m}',1,'B') returning id")
    lines.append({"matchup_id": m, "side_id": s, "quantity": [7, 6, 4][i]})
o = sql("select gen_random_uuid()")
sql(f"select create_dodo_basket('{o}','sandbox','pdt-unit','{json.dumps(lines)}','','',null)")
sql(f"update dodo_orders set checkout_id='cs-{o}', payment_id='pay-{o}' where id='{o}'")
facts = json.dumps({"currency": "USD", "cents": 1700, "cart_lines": 1, "product_id": "pdt-unit", "cart_quantity": 17, "checkout_id": f"cs-{o}", "meta_pulls": 17, "lines": lines, "country": "US"})
with ThreadPoolExecutor(max_workers=10) as pool:
    results = list(pool.map(lambda _: sql(f"select apply_dodo_basket('{o}','pay-{o}','sandbox','{facts}')"), range(10)))
assert sum('"duplicate": false' in r for r in results) == 1, results
assert sql(f"select count(*) from pulls where stripe_session_id like 'dodo:{o}:%'") == "3"
assert sql(f"select sum(amount_cents) from pulls where stripe_session_id like 'dodo:{o}:%'") == "1700"
assert sql(f"select count(*) from dodo_basket_lines where order_id='{o}' and status='applied'") == "3"
assert sql("select count(*) from pull_wallets") == "0"
print("PASS: ten concurrent deliveries apply one 17-pull basket exactly once across three matchups, no wallet")

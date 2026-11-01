"""Disposable local PostgreSQL only; never points at the project's database.
Run after loading the core round functions and Dodo migrations into port 5544.
"""
import subprocess
from concurrent.futures import ThreadPoolExecutor

BASE = ["psql", "-h", "/tmp/dodo-db", "-p", "5544", "-U", "dodo_test", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"]
def sql(query):
    return subprocess.run(BASE + ["-c", query], capture_output=True, text=True)

w = sql("insert into pull_wallets(token_hash,environment,balance) values(repeat('b',64),'sandbox',5) returning id").stdout.splitlines()[0]
m = sql("insert into matchups(slug,title,source,status) values('concurrency-fixture','concurrency fixture','user','active') returning id").stdout.splitlines()[0]
a = sql(f"insert into sides(matchup_id,position,name) values('{m}',0,'A') returning id").stdout.splitlines()[0]
sql(f"insert into sides(matchup_id,position,name) values('{m}',1,'B')")
try:
    def spend(_):
        return sql(f"select spend_wallet_pull(repeat('b',64),'sandbox','{a}',1,gen_random_uuid(),'','')")
    with ThreadPoolExecutor(max_workers=10) as pool:
        results = list(pool.map(spend, range(10)))
    assert sum(r.returncode == 0 for r in results) == 5, "Exactly five concurrent spends must succeed"
    assert sql(f"select balance from pull_wallets where id='{w}'").stdout.strip() == "0"
    assert sql(f"select count(*) from pull_wallet_ledger where wallet_id='{w}' and kind='debit'").stdout.strip() == "5"
    print("PASS: 10 simultaneous spends against 5 pulls; exactly 5 recorded, balance 0, no overdraw")
finally:
    sql(f"delete from pull_wallet_ledger where wallet_id='{w}'; delete from matchups where id='{m}'; delete from pull_wallets where id='{w}'")
"""Disposable local database only; never runs against Tugg's hosted database.
Usage: PGROUND_HOST=/tmp/pgr/sock PGROUND_PORT=55433 PGROUND_DB=t python3 src/test/engagement-concurrency.py
Ten scans at once after a lead flip queue exactly one overtaken email per backer, and ten senders claiming at once
each get different rows, so no notification can be sent twice."""
import os, subprocess
from concurrent.futures import ThreadPoolExecutor
BASE = ["psql", "-h", os.environ.get("PGROUND_HOST", "/tmp/pgr/sock"), "-p", os.environ.get("PGROUND_PORT", "55433"), "-U", os.environ.get("PGROUND_USER", "postgres"), "-d", os.environ.get("PGROUND_DB", "t"), "-At", "-v", "ON_ERROR_STOP=1"]
def sql(q):
    r = subprocess.run(BASE + ["-c", q], capture_output=True, text=True)
    if r.returncode: raise RuntimeError(r.stderr)
    return r.stdout.strip()
def buy(side, email, cents):
    o = sql("select gen_random_uuid()")
    sql(f"insert into dodo_orders(id,environment,kind,expected_cents,product_id,status,buyer_email,side_id,quantity) values('{o}','sandbox','pull_{cents//100}',{cents},'p','paid','{email}','{side}',{cents//100})")
    sql(f"select record_pull('engc:{o}','{side}',{cents},'','','US','sandbox')")
    sql(f"insert into dodo_bundle_applications(order_id,payment_id,pull_id,quantity,amount_cents,environment) select '{o}','pay_{o}',id,{cents//100},{cents},'sandbox' from pulls where stripe_session_id='engc:{o}'")
saved = sql("select live_enabled||'|'||sandbox_enabled||'|'||coalesce(eligible_from::text,'') from engagement_settings")
m = sql("insert into matchups(slug,title,status,round_length) values('engc-'||gen_random_uuid(),'C','active','weekly') returning id").splitlines()[0]
a = sql(f"insert into sides(matchup_id,position,name) values('{m}',0,'A') returning id").splitlines()[0]
b = sql(f"insert into sides(matchup_id,position,name) values('{m}',1,'B') returning id").splitlines()[0]
r = sql(f"select ensure_open_round('{m}')")
try:
    sql("update engagement_settings set sandbox_enabled=true, eligible_from=now()-interval '1 minute'")
    for i in range(12): buy(b, f"b{i}@example.com", 500)
    sql("select engagement_scan(true)")
    buy(a, "a0@example.com", 2500); buy(a, "a1@example.com", 2500); buy(a, "a2@example.com", 2500)
    with ThreadPoolExecutor(max_workers=10) as pool: list(pool.map(lambda _: sql("select engagement_scan(true)"), range(10)))
    n = sql(f"select count(*)||'|'||count(distinct email_hash) from engagement_notifications where round_id='{r}' and kind='overtaken'")
    assert n == "12|12", n
    with ThreadPoolExecutor(max_workers=10) as pool:
        got = [x for out in pool.map(lambda _: sql("select id from engagement_claim(2)"), range(10)) for x in out.splitlines() if x]
    assert len(got) == len(set(got)) and len(got) >= 2, got
    sending = sql(f"select count(*) from engagement_notifications where round_id='{r}' and status='sending'")
    assert int(sending) == len(got), (sending, len(got))
    print(f"ok: 10 concurrent scans -> 12 overtaken rows for 12 backers; 10 concurrent claimers -> {len(got)} distinct rows, none twice")
finally:
    live, sand, frm = saved.split("|")
    sql(f"update engagement_settings set live_enabled={live}, sandbox_enabled={sand}, eligible_from={'null' if not frm else repr(frm)}")
    sql(f"delete from engagement_notifications where round_id in (select id from rounds where matchup_id='{m}')")
    sql(f"delete from dodo_bundle_applications where pull_id in (select id from pulls where matchup_id='{m}')")
    sql(f"delete from dodo_orders where side_id in ('{a}','{b}')")
    sql(f"delete from matchups where id='{m}'")

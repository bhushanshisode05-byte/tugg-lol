-- Run against managed PostgreSQL; all private fixtures and state roll back.
BEGIN;
DO $$
DECLARE lease uuid := gen_random_uuid(); ok boolean; i integer; pending integer;
BEGIN
 IF NOT public.claim_trend_scout('2099-12-31',lease) THEN RAISE EXCEPTION 'first lease denied'; END IF;
 IF public.claim_trend_scout('2099-12-31',gen_random_uuid()) THEN RAISE EXCEPTION 'parallel lease accepted'; END IF;
 FOR i IN 1..3 LOOP
   IF NOT public.reserve_trend_rope('2099-12-31',lease) THEN RAISE EXCEPTION 'slot % refused',i; END IF;
 END LOOP;
 IF public.reserve_trend_rope('2099-12-31',lease) THEN RAISE EXCEPTION 'fourth rope allowed'; END IF;
 SELECT count(*) INTO pending FROM public.post_drafts WHERE status='pending';
 FOR i IN pending+1..10 LOOP
   INSERT INTO public.post_drafts(kind,body,source_context) VALUES('reply','SQL private guard fixture','trend SQL guard fixture');
 END LOOP;
 IF public.save_trend_drafts('2099-12-31',lease,NULL,'https://x.com/guard/status/999','guard','quote','reply') THEN RAISE EXCEPTION 'ten-pending cap exceeded'; END IF;
 UPDATE public.post_drafts SET status='discarded' WHERE source_context='trend SQL guard fixture';
 INSERT INTO public.post_drafts(kind,body,source_context,expires_at) VALUES('reply','Expired SQL fixture','trend SQL guard fixture',now()-interval '1 hour');
 IF NOT public.save_trend_drafts('2099-12-31',lease,NULL,'https://x.com/guard/status/999','trend SQL guard fixture','quote','reply') THEN RAISE EXCEPTION 'pair not saved'; END IF;
 IF EXISTS(SELECT 1 FROM public.post_drafts WHERE source_context='trend SQL guard fixture' AND expires_at<now() AND status<>'discarded') THEN RAISE EXCEPTION 'expiry not discarded'; END IF;
 IF (SELECT count(*) FROM public.post_drafts WHERE source_url='https://x.com/guard/status/999')<>2 THEN RAISE EXCEPTION 'pair not atomic'; END IF;
 IF public.save_trend_drafts('2099-12-31',lease,NULL,'https://x.com/guard/status/999','guard','quote','reply') THEN RAISE EXCEPTION 'source replay accepted'; END IF;
 IF has_table_privilege('anon','public.post_drafts','SELECT') OR has_table_privilege('authenticated','public.post_drafts','SELECT') THEN RAISE EXCEPTION 'private drafts readable directly'; END IF;
END $$;
ROLLBACK;
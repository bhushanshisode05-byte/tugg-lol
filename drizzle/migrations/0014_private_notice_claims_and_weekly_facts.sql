CREATE INDEX tugg_notice_event_key ON public.events ((detail->>'key')) WHERE kind='app_notice_result';
CREATE OR REPLACE FUNCTION public.claim_tugg_notice(p_key text,p_recipient text,p_template text,p_owner boolean) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE previous jsonb; attempts integer; n integer;
BEGIN
 IF length(p_key)>200 OR p_recipient !~ '^[a-f0-9]{64}$' OR p_template NOT IN ('purchase-receipt','matchup-rejection','contact-reply','contact-owner','owner-alert','weekly-summary','owner-test') THEN RETURN 'invalid'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('notice-recipient:'||p_recipient));
 PERFORM pg_advisory_xact_lock(hashtext('notice-key:'||p_key));
 SELECT detail INTO previous FROM events WHERE kind='app_notice_result' AND detail->>'key'=p_key ORDER BY created_at DESC LIMIT 1;
 IF previous->>'status' IN ('sent','recipient_suppressed','claimed') THEN RETURN 'duplicate'; END IF;
 SELECT count(*) INTO attempts FROM events WHERE kind='app_notice_result' AND detail->>'key'=p_key AND detail->>'status'='claimed';
 IF attempts>=3 THEN RETURN 'retry_cap'; END IF;
 SELECT count(*) INTO n FROM events WHERE kind='app_notice_result' AND detail->>'recipient_hash'=p_recipient AND detail->>'status'='claimed' AND created_at>now()-interval '1 hour';
 IF n >= (CASE WHEN p_owner THEN 15 ELSE 6 END) THEN RETURN 'rate_limited'; END IF;
 IF p_template='owner-alert' AND (SELECT count(*) FROM events WHERE kind='app_notice_result' AND detail->>'template'='owner-alert' AND detail->>'status'='claimed' AND created_at>now()-interval '1 hour')>=3 THEN RETURN 'rate_limited'; END IF;
 INSERT INTO events(kind,detail) VALUES('app_notice_result',jsonb_build_object('key',p_key,'recipient_hash',p_recipient,'template',p_template,'status','claimed'));
 RETURN 'accepted';
END $$;
REVOKE ALL ON FUNCTION public.claim_tugg_notice(text,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_tugg_notice(text,text,text,boolean) TO service_role;
CREATE OR REPLACE FUNCTION public.tugg_weekly_notice_facts(p_from timestamptz,p_to timestamptz) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT jsonb_build_object('environments',(SELECT jsonb_agg(x) FROM (SELECT e.environment,
 coalesce((SELECT sum(expected_cents) FROM payglocal_orders WHERE environment=e.environment AND status='paid' AND paid_at>=p_from AND paid_at<p_to),0)+coalesce((SELECT sum(expected_cents) FROM dodo_orders WHERE environment=e.environment AND status='paid' AND created_at>=p_from AND created_at<p_to),0) revenue_cents,
 coalesce((SELECT sum(amount_cents)/100 FROM pulls WHERE environment=e.environment AND created_at>=p_from AND created_at<p_to),0) pulls,
 (SELECT count(*) FROM payglocal_orders WHERE environment=e.environment AND review_allowed=false AND created_at>=p_from AND created_at<p_to) rejections,
 (SELECT count(*) FROM payglocal_orders WHERE environment=e.environment AND refund_status IS NOT NULL AND created_at>=p_from AND created_at<p_to) refunds_requested,
 (SELECT count(*) FROM payglocal_orders WHERE environment=e.environment AND refund_status='needs_review') refund_reviews,
 (SELECT count(*) FROM payglocal_orders WHERE environment=e.environment AND status='pending') pending,
 (SELECT count(DISTINCT funnel_id) FROM payglocal_funnel_events WHERE environment=e.environment AND step='viewed' AND created_at>=p_from AND created_at<p_to) viewed,
 (SELECT count(DISTINCT funnel_id) FROM payglocal_funnel_events WHERE environment=e.environment AND step='opened' AND created_at>=p_from AND created_at<p_to) opened,
 (SELECT count(DISTINCT funnel_id) FROM payglocal_funnel_events WHERE environment=e.environment AND step='completed' AND created_at>=p_from AND created_at<p_to) completed
 FROM (VALUES('live'),('sandbox')) e(environment)) x),
 'new_matchups',(SELECT coalesce(jsonb_object_agg(source,n),'{}'::jsonb) FROM (SELECT source,count(*) n FROM matchups WHERE created_at>=p_from AND created_at<p_to GROUP BY source) x),
 'errors',(SELECT count(*) FROM events WHERE kind IN ('refund_error','payglocal_reconcile_error','payglocal_late_capture_review','support_payment_error_email_unavailable','payment_error','dodo_webhook_error') AND created_at>=p_from AND created_at<p_to),
 'failed_payments',(SELECT count(*) FROM payglocal_orders WHERE status='failed' AND created_at>=p_from AND created_at<p_to),
 'refunds_confirmed',(SELECT count(*) FROM payglocal_orders WHERE refund_status IN ('succeeded','refunded') AND created_at>=p_from AND created_at<p_to));
$$;
REVOKE ALL ON FUNCTION public.tugg_weekly_notice_facts(timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tugg_weekly_notice_facts(timestamptz,timestamptz) TO service_role;
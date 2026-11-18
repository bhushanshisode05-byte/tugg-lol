-- Creation income now sums what buyers actually paid on paid order records, per provider and environment,
-- instead of assuming published prices. Exclusions unchanged: refunds, inactive matchups, owner matchups.
CREATE OR REPLACE FUNCTION public.tugg_creation_revenue() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
SELECT jsonb_build_object(
 'dodo',(SELECT coalesce(jsonb_object_agg(environment,cents),'{}'::jsonb) FROM (
   SELECT o.environment,sum(o.expected_cents) AS cents FROM public.dodo_orders o JOIN public.matchups m ON m.id=o.matchup_id
   WHERE o.kind IN ('standard','featured') AND o.status='paid' AND o.wallet_id IS NULL
     AND o.refund_status IS DISTINCT FROM 'succeeded'
     AND NOT EXISTS (SELECT 1 FROM public.creators c WHERE c.dodo_order_id=o.id AND c.refunded)
     AND m.status IN ('active','retired') AND m.source <> 'owner'
   GROUP BY o.environment) d),
 'payglocal',(SELECT coalesce(jsonb_object_agg(environment,cents),'{}'::jsonb) FROM (
   SELECT o.environment,sum(o.expected_cents) AS cents FROM public.payglocal_orders o JOIN public.matchups m ON m.id=o.matchup_id
   WHERE o.kind IN ('standard','featured') AND o.status='paid'
     AND (o.refund_status IS NULL OR o.refund_status NOT IN ('succeeded','refunded'))
     AND NOT EXISTS (SELECT 1 FROM public.creators c WHERE c.payglocal_order_id=o.id AND c.refunded)
     AND m.status IN ('active','retired') AND m.source <> 'owner'
   GROUP BY o.environment) p));
$function$;
REVOKE ALL ON FUNCTION public.tugg_creation_revenue() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tugg_creation_revenue() TO service_role;

-- Weekly owner facts read both providers' order and funnel records (Dodo was missing from every count but revenue),
-- and revenue falls in the week the payment was confirmed.
CREATE OR REPLACE FUNCTION public.tugg_weekly_notice_facts(p_from timestamp with time zone, p_to timestamp with time zone) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
WITH o AS (
 SELECT environment,status,expected_cents,coalesce(paid_at,created_at) AS paid_at,created_at,review_allowed,refund_status FROM public.payglocal_orders
 UNION ALL
 SELECT environment,status,expected_cents,coalesce(paid_at,created_at),created_at,review_allowed,refund_status FROM public.dodo_orders WHERE wallet_id IS NULL
), f AS (
 SELECT environment,step,funnel_id,created_at FROM public.payglocal_funnel_events
 UNION ALL
 SELECT environment,step,funnel_id,created_at FROM public.dodo_funnel_events
)
SELECT jsonb_build_object('environments',(SELECT jsonb_agg(x) FROM (SELECT e.environment,
 coalesce((SELECT sum(expected_cents) FROM o WHERE environment=e.environment AND status='paid' AND paid_at>=p_from AND paid_at<p_to),0) revenue_cents,
 coalesce((SELECT sum(amount_cents)/100 FROM public.pulls WHERE environment=e.environment AND created_at>=p_from AND created_at<p_to),0) pulls,
 (SELECT count(*) FROM o WHERE environment=e.environment AND review_allowed=false AND created_at>=p_from AND created_at<p_to) rejections,
 (SELECT count(*) FROM o WHERE environment=e.environment AND refund_status IS NOT NULL AND created_at>=p_from AND created_at<p_to) refunds_requested,
 (SELECT count(*) FROM o WHERE environment=e.environment AND refund_status IN ('needs_review','failed','requesting')) refund_reviews,
 (SELECT count(*) FROM o WHERE environment=e.environment AND status='pending') pending,
 (SELECT count(DISTINCT funnel_id) FROM f WHERE environment=e.environment AND step='viewed' AND created_at>=p_from AND created_at<p_to) viewed,
 (SELECT count(DISTINCT funnel_id) FROM f WHERE environment=e.environment AND step='opened' AND created_at>=p_from AND created_at<p_to) opened,
 (SELECT count(DISTINCT funnel_id) FROM f WHERE environment=e.environment AND step='completed' AND created_at>=p_from AND created_at<p_to) completed
 FROM (VALUES('live'),('sandbox')) e(environment)) x),
 'new_matchups',(SELECT coalesce(jsonb_object_agg(source,n),'{}'::jsonb) FROM (SELECT source,count(*) n FROM public.matchups WHERE created_at>=p_from AND created_at<p_to GROUP BY source) x),
 'errors',(SELECT count(*) FROM public.events WHERE kind IN ('refund_error','payglocal_reconcile_error','payglocal_late_capture_review','support_payment_error_email_unavailable','payment_error','dodo_webhook_error','dodo_late_payment_review','dodo_dispute') AND created_at>=p_from AND created_at<p_to),
 'failed_payments',(SELECT count(*) FROM o WHERE status='failed' AND created_at>=p_from AND created_at<p_to),
 'refunds_confirmed',(SELECT count(*) FROM o WHERE refund_status IN ('succeeded','refunded') AND created_at>=p_from AND created_at<p_to));
$function$;
REVOKE ALL ON FUNCTION public.tugg_weekly_notice_facts(timestamp with time zone, timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tugg_weekly_notice_facts(timestamp with time zone, timestamp with time zone) TO service_role;
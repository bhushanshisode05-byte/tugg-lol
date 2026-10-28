CREATE FUNCTION public.tugg_creation_revenue() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT coalesce(jsonb_object_agg(environment,cents),'{}'::jsonb) FROM (SELECT c.environment,sum(CASE WHEN c.tier='featured' THEN 2900 ELSE 900 END) AS cents FROM public.creators c JOIN public.matchups m ON m.id=c.matchup_id WHERE NOT c.refunded AND m.status IN ('active','retired') GROUP BY c.environment) x;
$$;
REVOKE ALL ON FUNCTION public.tugg_creation_revenue() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tugg_creation_revenue() TO service_role;
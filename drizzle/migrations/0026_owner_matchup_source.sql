-- Owner-created matchups: the house adds a rope for free, so it gets its own source and never counts as creation income.
ALTER TABLE public.matchups DROP CONSTRAINT matchups_source_check;
ALTER TABLE public.matchups ADD CONSTRAINT matchups_source_check CHECK (source = ANY (ARRAY['seed'::text, 'user'::text, 'ai'::text, 'owner'::text]));
-- Creation income stays inferred from paid creator records at published prices; owner matchups are excluded even if a creator record ever pointed at one.
CREATE OR REPLACE FUNCTION public.tugg_creation_revenue() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
SELECT coalesce(jsonb_object_agg(environment,cents),'{}'::jsonb) FROM (SELECT c.environment,sum(CASE WHEN c.tier='featured' THEN 2900 ELSE 900 END) AS cents FROM public.creators c JOIN public.matchups m ON m.id=c.matchup_id WHERE NOT c.refunded AND m.status IN ('active','retired') AND m.source <> 'owner' GROUP BY c.environment) x;
$function$;

CREATE TABLE public.post_drafts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
 kind text NOT NULL CHECK(kind IN ('quote_tweet','reply','standalone')), body text NOT NULL,
 matchup_id uuid REFERENCES public.matchups(id) ON DELETE SET NULL,
 source_url text, source_context text,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','posted','discarded')),
 expires_at timestamptz NOT NULL DEFAULT (now()+interval '24 hours'),
 UNIQUE(kind,source_url)
);
GRANT ALL ON public.post_drafts TO service_role;
REVOKE ALL ON public.post_drafts FROM anon, authenticated;
ALTER TABLE public.post_drafts ENABLE ROW LEVEL SECURITY;
CREATE INDEX post_drafts_review ON public.post_drafts(status,created_at DESC);
CREATE TABLE public.trend_scout_runs (
 day date PRIMARY KEY, lease uuid NOT NULL, lease_until timestamptz NOT NULL,
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3), completed boolean NOT NULL DEFAULT false
);
GRANT ALL ON public.trend_scout_runs TO service_role;
ALTER TABLE public.trend_scout_runs ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.claim_trend_scout(p_day date,p_lease uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO public.trend_scout_runs(day,lease,lease_until) VALUES(p_day,p_lease,now()+interval '15 minutes')
 ON CONFLICT(day) DO UPDATE SET lease=p_lease,lease_until=now()+interval '15 minutes'
 WHERE trend_scout_runs.lease_until<now() AND NOT trend_scout_runs.completed;
 RETURN FOUND;
END $$;
CREATE FUNCTION public.reserve_trend_rope(p_day date,p_lease uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE public.trend_scout_runs SET attempts=attempts+1 WHERE day=p_day AND lease=p_lease AND lease_until>now() AND attempts<3 AND NOT completed;
 RETURN FOUND;
END $$;
CREATE FUNCTION public.save_trend_drafts(p_day date,p_lease uuid,p_matchup uuid,p_source text,p_context text,p_quote text,p_reply text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM 1 FROM public.trend_scout_runs WHERE day=p_day AND lease=p_lease AND lease_until>now() AND NOT completed FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 LOCK TABLE public.post_drafts IN SHARE ROW EXCLUSIVE MODE;
 UPDATE public.post_drafts SET status='discarded' WHERE status='pending' AND expires_at<=now();
 IF (SELECT count(*) FROM public.post_drafts WHERE status='pending')>8 THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM public.post_drafts WHERE source_url=p_source) THEN RETURN false; END IF;
 INSERT INTO public.post_drafts(kind,body,matchup_id,source_url,source_context) VALUES
 ('quote_tweet',p_quote,p_matchup,p_source,p_context),('reply',p_reply,p_matchup,p_source,p_context);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.claim_trend_scout(date,uuid),public.reserve_trend_rope(date,uuid),public.save_trend_drafts(date,uuid,uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_trend_scout(date,uuid),public.reserve_trend_rope(date,uuid),public.save_trend_drafts(date,uuid,uuid,text,text,text,text) TO service_role;
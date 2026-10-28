CREATE TABLE public.support_threads (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), channel text NOT NULL CHECK (channel IN ('contact','chat')), email text CHECK (char_length(email)<=255), name text CHECK (char_length(name)<=100), message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 3000), ai_reply text, status text NOT NULL DEFAULT 'received', payment_error boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.support_threads TO service_role;
REVOKE ALL ON public.support_threads FROM anon, authenticated;
ALTER TABLE public.support_threads ENABLE ROW LEVEL SECURITY;
CREATE INDEX support_threads_recent ON public.support_threads(created_at DESC);
CREATE TABLE public.user_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, role text NOT NULL CHECK (role='owner'), UNIQUE(role), UNIQUE(user_id,role));
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_own_role ON public.user_roles FOR SELECT TO authenticated USING (user_id=auth.uid());
CREATE FUNCTION public.claim_tugg_owner(p_user uuid,p_email text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id=p_user AND lower(email)=lower(p_email) AND email_confirmed_at IS NOT NULL) THEN RETURN false; END IF;
 INSERT INTO public.user_roles(user_id,role) VALUES(p_user,'owner') ON CONFLICT DO NOTHING;
 RETURN EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_user AND role='owner');
END $$;
REVOKE ALL ON FUNCTION public.claim_tugg_owner(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_tugg_owner(uuid,text) TO service_role;
CREATE TABLE public.support_ai_state (id text PRIMARY KEY CHECK(id='support'), paused boolean NOT NULL DEFAULT false, status integer, reason text, updated_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.support_ai_state TO service_role;
ALTER TABLE public.support_ai_state ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.tugg_admin_summary() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT jsonb_build_object('pullRevenue',coalesce((SELECT jsonb_agg(x) FROM (SELECT environment,sum(amount_cents)::text AS cents,count(*) AS pulls FROM public.pulls GROUP BY environment)x),'[]'::jsonb),'sources',coalesce((SELECT jsonb_agg(x) FROM (SELECT source,count(*) AS count FROM public.matchups GROUP BY source)x),'[]'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.tugg_admin_summary() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tugg_admin_summary() TO service_role;
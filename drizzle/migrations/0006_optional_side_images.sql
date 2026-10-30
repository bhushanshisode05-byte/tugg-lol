ALTER TABLE public.sides ADD COLUMN image_id uuid, ADD COLUMN image_status text, ADD COLUMN image_report_count integer;
CREATE TABLE public.side_image_uploads (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), webp_path text NOT NULL, png_path text NOT NULL,
 ip_hash text NOT NULL, rights_confirmed boolean NOT NULL DEFAULT false,
 matchup_id uuid, created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz,
 status text NOT NULL DEFAULT 'pending', reason text, renderer_failed boolean NOT NULL DEFAULT false
);
GRANT ALL ON public.side_image_uploads TO service_role;
ALTER TABLE public.side_image_uploads ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.side_image_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), image_id uuid NOT NULL REFERENCES public.side_image_uploads(id),
 ip_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(image_id,ip_hash)
);
GRANT ALL ON public.side_image_reports TO service_role;
ALTER TABLE public.side_image_reports ENABLE ROW LEVEL SECURITY;
CREATE INDEX side_image_orphans ON public.side_image_uploads(created_at) WHERE deleted_at IS NULL;
CREATE INDEX side_images_lookup ON public.sides(image_id) WHERE image_id IS NOT NULL;
CREATE POLICY side_image_server_write ON storage.objects FOR ALL TO service_role USING(bucket_id = 'side-images') WITH CHECK(bucket_id = 'side-images');
CREATE FUNCTION public.attach_side_images(p_matchup uuid, p_a uuid, p_b uuid, p_ip text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE expected integer; claimed integer;
BEGIN
 expected := (CASE WHEN p_a IS NULL THEN 0 ELSE 1 END) + (CASE WHEN p_b IS NULL THEN 0 ELSE 1 END);
 IF expected = 0 THEN RETURN true; END IF;
 IF p_a IS NOT NULL AND p_a = p_b THEN RETURN false; END IF;
 PERFORM id FROM side_image_uploads WHERE id IN(p_a,p_b) ORDER BY id FOR UPDATE;
 SELECT count(*) INTO claimed FROM side_image_uploads WHERE id IN(p_a,p_b) AND ip_hash=p_ip AND rights_confirmed AND matchup_id IS NULL AND deleted_at IS NULL AND status='pending' AND created_at > now()-interval '24 hours';
 IF claimed <> expected THEN RETURN false; END IF;
 UPDATE side_image_uploads SET matchup_id=p_matchup WHERE id IN(p_a,p_b);
 UPDATE sides SET image_id=p_a,image_status='pending',image_report_count=0 WHERE matchup_id=p_matchup AND position=0 AND p_a IS NOT NULL;
 UPDATE sides SET image_id=p_b,image_status='pending',image_report_count=0 WHERE matchup_id=p_matchup AND position=1 AND p_b IS NOT NULL;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.attach_side_images(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.attach_side_images(uuid,uuid,uuid,text) TO service_role;
CREATE FUNCTION public.report_side_image(p_image uuid,p_ip text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer; added integer;
BEGIN
 PERFORM id FROM side_image_uploads WHERE id=p_image FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM sides s JOIN matchups m ON m.id=s.matchup_id WHERE s.image_id=p_image AND s.image_status='ok' AND m.status IN('active','retired')) THEN RETURN jsonb_build_object('accepted',false); END IF;
 INSERT INTO side_image_reports(image_id,ip_hash) VALUES(p_image,p_ip) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS added=ROW_COUNT;
 SELECT count(*) INTO n FROM side_image_reports WHERE image_id=p_image;
 UPDATE sides SET image_report_count=n, image_status=CASE WHEN n>=3 THEN 'hidden' ELSE image_status END WHERE image_id=p_image;
 IF n>=3 THEN
 UPDATE side_image_uploads SET status='hidden',reason='Three distinct network reports' WHERE id=p_image;
 IF added=1 THEN INSERT INTO moderation_log(subject_type,subject_id,verdict,reason) VALUES('side_image',p_image::text,'hidden','Three distinct network reports'); END IF;
 END IF;
 RETURN jsonb_build_object('accepted',true,'new',added=1,'count',n,'hidden',n>=3);
END $$;
REVOKE ALL ON FUNCTION public.report_side_image(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.report_side_image(uuid,text) TO service_role;
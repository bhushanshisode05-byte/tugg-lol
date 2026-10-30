CREATE OR REPLACE FUNCTION public.attach_side_images(p_matchup uuid,p_a uuid,p_b uuid,p_ip text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE expected integer; claimed integer;
BEGIN
 p_a:=nullif(p_a,'00000000-0000-0000-0000-000000000000'::uuid);
 p_b:=nullif(p_b,'00000000-0000-0000-0000-000000000000'::uuid);
 expected := (CASE WHEN p_a IS NULL THEN 0 ELSE 1 END) + (CASE WHEN p_b IS NULL THEN 0 ELSE 1 END);
 IF expected=0 THEN RETURN true; END IF;
 IF p_a IS NOT NULL AND p_a=p_b THEN RETURN false; END IF;
 PERFORM id FROM side_image_uploads WHERE id IN(p_a,p_b) ORDER BY id FOR UPDATE;
 SELECT count(*) INTO claimed FROM side_image_uploads WHERE id IN(p_a,p_b) AND ip_hash=p_ip AND rights_confirmed AND matchup_id IS NULL AND deleted_at IS NULL AND status='pending' AND created_at>now()-interval '24 hours';
 IF claimed<>expected THEN RETURN false; END IF;
 UPDATE side_image_uploads SET matchup_id=p_matchup WHERE id IN(p_a,p_b);
 UPDATE sides SET image_id=p_a,image_status='pending',image_report_count=0 WHERE matchup_id=p_matchup AND position=0 AND p_a IS NOT NULL;
 UPDATE sides SET image_id=p_b,image_status='pending',image_report_count=0 WHERE matchup_id=p_matchup AND position=1 AND p_b IS NOT NULL;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.attach_side_images(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.attach_side_images(uuid,uuid,uuid,text) TO service_role;
import {validateSideImage} from './side-image-codec.server';
import {moderateSideImage} from './side-image-moderation.server';
import {imageVisible,orphanExpired} from './side-image';
async function admin(){return (await import('@/integrations/supabase/client.server')).supabaseAdmin;}
export async function imageIpHash(request: Request) {
 // Hosting supplies the trusted request IP; do not accept arbitrary client headers.
 const {getRequestIP}=await import('@tanstack/react-start/server');
 const ip=getRequestIP({xForwardedFor:true}) || 'unknown';
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`side-images:${ip}`));
 return Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');
}
async function slot(ip:string,ns:string,max:number){const db=await admin();const r=await db.rpc('take_checkout_slot',{p_ip:`${ns}:${ip}`,p_max:max,p_window_minutes:60});return !r.error && r.data;}
export async function uploadSideImage(request: Request) {
 if(Number(request.headers.get('content-length'))>560000) return Response.json({error:'Picture upload too large.'},{status:413});
 const hash=await imageIpHash(request);
 if(!(await slot(hash,'image-upload',10))) return Response.json({error:'Too many picture uploads. Try again in an hour.'},{status:429});
 try {
  // Bound the raw body even for chunked requests, before parsing multipart.
  const reader=request.body?.getReader(); if(!reader) throw new Error('Missing picture.');
  const parts:Uint8Array[]=[];let size=0;
  while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>560000){await reader.cancel();return Response.json({error:'Picture upload too large.'},{status:413});}parts.push(next.value);}
  const raw=new Uint8Array(size);let off=0;for(const part of parts){raw.set(part,off);off+=part.length;}
  const form=await new Response(raw,{headers:{'content-type':request.headers.get('content-type')||''}}).formData();
  if(form.get('rights')!=='true') throw new Error('Confirm that you have the right to use this picture.');
  const file=form.get('image');if(!(file instanceof File)) throw new Error('Missing picture.');
  const bytes=new Uint8Array(await file.arrayBuffer()); const {png}=await validateSideImage(bytes);
  const db=await admin();const id=crypto.randomUUID();const webpPath=`${id}.webp`,pngPath=`${id}.png`;
  // Insert tracking before storage writes so partial failures remain eligible for cleanup.
  const row=await db.from('side_image_uploads').insert({id,webp_path:webpPath,png_path:pngPath,ip_hash:hash,rights_confirmed:true});
  if(row.error) throw new Error('Could not save picture.');
  for(const [path,data,type] of [[webpPath,bytes,'image/webp'],[pngPath,png,'image/png']] as const){
   const out=await db.storage.from('side-images').upload(path,data,{contentType:type,upsert:false});if(out.error) throw new Error('Could not save picture.');
  }
  return Response.json({id},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Picture upload failed.'},{status:400});}
}
export async function getPublicSideImage(id:string,png:boolean) {
 const db=await admin();const {data:side}=await db.from('sides').select('image_id,image_status,matchups!inner(status)').eq('image_id',id).in('matchups.status',['active','retired']).eq('image_status','ok').limit(1).maybeSingle();
 if(!side || !imageVisible(side)) return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});
 const {data:upload}=await db.from('side_image_uploads').select('webp_path,png_path,status,deleted_at').eq('id',id).maybeSingle();
 if(!upload || upload.deleted_at || upload.status!=='ok') return new Response('Not found',{status:404});
 const {data:file,error}=await db.storage.from('side-images').download(png?upload.png_path:upload.webp_path);
 if(error || !file) return new Response('Not found',{status:404});
 return new Response(file,{headers:{'Content-Type':png?'image/png':'image/webp','Cache-Control':'public, max-age=60, s-maxage=60','X-Content-Type-Options':'nosniff'}});
}
export async function reviewMatchupImages(matchupId:string) {
 const db=await admin();const {data:uploads,error}=await db.from('side_image_uploads').select('id,png_path').eq('matchup_id',matchupId).is('deleted_at',null);
 if(error) return {allowed:false,reason:'Picture moderation unavailable'};
 let failure='';
 for(const u of uploads??[]){
  const {data:file}=await db.storage.from('side-images').download(u.png_path);
  const v=file?await moderateSideImage(new Uint8Array(await file.arrayBuffer())):{allowed:false,reason:'Picture could not be loaded for moderation'};
  const status=v.allowed?'ok':'rejected';
  await db.from('side_image_uploads').update({status,reason:v.reason}).eq('id',u.id);
  await db.from('sides').update({image_status:status}).eq('image_id',u.id);
  await db.from('moderation_log').insert({subject_type:'side_image',subject_id:u.id,verdict:status,reason:v.reason});
  if(!v.allowed){failure=v.reason;break;}
 }
 return {allowed:!failure,reason:failure};
}
export async function reportSideImage(request:Request,id:string){
 const ip=await imageIpHash(request);if(!(await slot(ip,'image-report',5)))return Response.json({error:'Too many reports. Try again in an hour.'},{status:429});
 const db=await admin();const {data,error}=await db.rpc('report_side_image',{p_image:id,p_ip:ip});
 const out=data as {accepted?:boolean;new?:boolean;hidden?:boolean;count?:number}|null;
 if(error || !out?.accepted)return Response.json({error:'This picture is no longer available.'},{status:404});
 if(out.new && !out.hidden){
  const {data:u}=await db.from('side_image_uploads').select('png_path').eq('id',id).maybeSingle();
  const file=u?(await db.storage.from('side-images').download(u.png_path)).data:null;
  const v=file?await moderateSideImage(new Uint8Array(await file.arrayBuffer())):{allowed:false,reason:'Picture re-check unavailable'};
  if(!v.allowed){await db.from('side_image_uploads').update({status:'hidden',reason:v.reason}).eq('id',id);await db.from('sides').update({image_status:'hidden'}).eq('image_id',id);}
  // Never restore 'ok' here: another concurrent report may already have hidden it.
  await db.from('moderation_log').insert({subject_type:'side_image_report',subject_id:id,verdict:v.allowed?'allowed':'hidden',reason:v.reason});
 }
 return Response.json({ok:true,message:'Picture reported. Thank you.'},{headers:{'Cache-Control':'no-store'}});
}
export async function cleanupSideImages(){
 const db=await admin();const {data:rows,error}=await db.from('side_image_uploads').select('id,matchup_id,created_at,webp_path,png_path').is('deleted_at',null).lt('created_at',new Date(Date.now()-86400000).toISOString()).limit(500);
 if(error)throw new Error('Picture cleanup unavailable');let deleted=0;
 for(const u of rows??[]){
  const m=u.matchup_id?(await db.from('matchups').select('status').eq('id',u.matchup_id).maybeSingle()).data:null;
  // Keep all paid submissions (including rejected ones) for private audit; orphan and unpaid only.
  const c=u.matchup_id?(await db.from('creators').select('payment_intent').eq('matchup_id',u.matchup_id).limit(1).maybeSingle()).data:null;
  if(!orphanExpired(u.created_at,!!c?.payment_intent || !!m && m.status!=='pending_payment'))continue;
  const r=await db.storage.from('side-images').remove([u.webp_path,u.png_path]);if(r.error)continue;
  await db.from('side_image_uploads').update({deleted_at:new Date().toISOString(),status:'expired'}).eq('id',u.id);deleted++;
 }
 return {imagesDeleted:deleted};
}

import {sourceImageCheck,UPLOAD_IMAGE_MAX} from './side-image';
export async function cropSideImage(file: File, zoom=1, x=50, y=50): Promise<Blob> {
 sourceImageCheck(new Uint8Array(await file.arrayBuffer()));
 const image=await createImageBitmap(file);
 try {
  const canvas=document.createElement('canvas'); canvas.width=512; canvas.height=512;
  const ctx=canvas.getContext('2d'); if(!ctx) throw new Error('Picture editing is not available in this browser.');
  const edge=Math.min(image.width,image.height)/Math.max(1,Math.min(3,zoom));
  ctx.drawImage(image,(image.width-edge)*x/100,(image.height-edge)*y/100,edge,edge,0,0,512,512);
  for(const quality of [0.85,0.7,0.5]) {
   const blob=await new Promise<Blob|null>(r=>canvas.toBlob(r,'image/webp',quality));
   if(blob?.type==='image/webp' && blob.size<=UPLOAD_IMAGE_MAX) return blob;
  }
  throw new Error('Could not make a WebP picture below 400 KB.');
 } finally {image.close();}
}

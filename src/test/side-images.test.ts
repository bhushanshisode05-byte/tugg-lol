// @vitest-environment node
import {describe,it,expect} from 'vitest';
import {Image} from 'imagescript';
import {validateSideImage} from '@/lib/side-image-codec.server';
import {imageType,sourceImageCheck,SOURCE_IMAGE_MAX,UPLOAD_IMAGE_MAX,imageVisible,shouldHideImage,orphanExpired} from '@/lib/side-image';
import {readFileSync} from 'node:fs';
describe('optional side pictures',()=>{
 it.each(['jpg','png','webp'])('accepts real %s source bytes',ext=>{const types={jpg:'image/jpeg',png:'image/png',webp:'image/webp'};const bytes=new Uint8Array(readFileSync(`/tmp/browser/side-images/pizza.${ext}`));expect(imageType(bytes)).toBe(types[ext as keyof typeof types]);expect(()=>sourceImageCheck(bytes)).not.toThrow();});
 it('rejects SVG renamed PNG',()=>expect(()=>sourceImageCheck(new TextEncoder().encode('<svg/>'))).toThrow());
 it('enforces 5 MB source limit',()=>expect(()=>sourceImageCheck(new Uint8Array(SOURCE_IMAGE_MAX+1))).toThrow());
 it('enforces 400 KB processed limit',async()=>{await expect(validateSideImage(new Uint8Array(UPLOAD_IMAGE_MAX+1))).rejects.toThrow('400 KB');});
 it('fully decodes 512 WebP and produces 256 PNG',async()=>{const out=await validateSideImage(new Uint8Array(readFileSync('/tmp/browser/side-images/pizza-512.webp')));const png=await Image.decode(out.png);expect([png.width,png.height]).toEqual([256,256]);});
 it('rejects corrupted WebP',async()=>{await expect(validateSideImage(new Uint8Array(readFileSync('/tmp/browser/side-images/corrupt.webp')))).rejects.toThrow();});
 it('rejects wrong decoded dimensions',async()=>{await expect(validateSideImage(new Uint8Array(readFileSync('/tmp/browser/side-images/pizza.webp')))).rejects.toThrow();});
 it('emoji-only sides remain emoji',()=>expect(imageVisible({})).toBe(false));
 it('pending or hidden images are never visible',()=>{expect(imageVisible({image_id:'x',image_status:'hidden'})).toBe(false);expect(imageVisible({image_id:'x',image_status:'pending'})).toBe(false);expect(imageVisible({image_id:'x',image_status:'ok'})).toBe(true);});
 it('three distinct reports hide a passing image',()=>{expect(shouldHideImage(2,true)).toBe(false);expect(shouldHideImage(3,true)).toBe(true);});
 it('failed moderation hides on first report',()=>expect(shouldHideImage(1,false)).toBe(true));
 it('unpaid orphan expires after 24 hours, paid does not',()=>{const now=Date.parse('2026-10-30T12:00:00Z');expect(orphanExpired('2026-10-29T11:59:59Z',false,now)).toBe(true);expect(orphanExpired('2026-10-29T12:00:01Z',false,now)).toBe(false);expect(orphanExpired('2026-10-29T11:59:59Z',true,now)).toBe(false);});
});

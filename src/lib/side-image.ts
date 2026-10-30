export const SOURCE_IMAGE_MAX = 5 * 1024 * 1024;
export const UPLOAD_IMAGE_MAX = 400 * 1024;
export const IMAGE_EDGE = 512;
export const RIGHTS_NOTICE =
  "I have the right to use this image. No photos of identifiable people, no sexual or violent content.";
export const IMAGE_POLICY =
  "Optional side pictures must be yours to use. No identifiable real people (including minors), nudity or sexual content, violence or gore, hate symbols, or scams. Pictures are checked after payment; a rejected picture rejects the matchup and triggers the usual full creation-fee refund. Use Report image to request a re-check. A failed re-check or three reports from different networks hides the picture and restores its emoji. Later picture takedowns do not change pulls, results, or the existing refund policy.";
export function imageType(b: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return "image/jpeg";
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v)) return "image/png";
  if (
    String.fromCharCode(...b.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...b.subarray(8, 12)) === "WEBP"
  )
    return "image/webp";
  return null;
}
export function sourceImageCheck(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > SOURCE_IMAGE_MAX)
    throw new Error("Choose a picture no larger than 5 MB.");
  if (!imageType(bytes))
    throw new Error("Choose a JPG, PNG or WebP picture. SVG and GIF are not accepted.");
}
export const sideImagePath = (id: string, png = false) =>
  `/api/public/side-images/${encodeURIComponent(id)}?format=${png ? "png" : "webp"}`;
export function imageVisible(side: { image_id?: string | null; image_status?: string | null }) {
  return !!side.image_id && side.image_status === "ok";
}
export function shouldHideImage(reports: number, allowed: boolean) {
  return reports >= 3 || !allowed;
}
export function orphanExpired(created: string, paid: boolean, now = Date.now()) {
  return !paid && new Date(created).getTime() < now - 24 * 60 * 60 * 1000;
}

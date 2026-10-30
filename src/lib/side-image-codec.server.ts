import { Image } from "imagescript";
import { imageType, UPLOAD_IMAGE_MAX, IMAGE_EDGE } from "./side-image";
export async function validateSideImage(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > UPLOAD_IMAGE_MAX)
    throw new Error("The resized picture must be no larger than 400 KB.");
  if (imageType(bytes) !== "image/webp")
    throw new Error("Upload a browser-processed WebP picture.");
  // Reject animation and metadata chunks; browser canvas output is a single, metadata-free frame.
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 20 || view.getUint32(4, true) + 8 !== bytes.length)
    throw new Error("Invalid WebP picture.");
  for (let p = 12; p < bytes.length;) {
    if (p + 8 > bytes.length) throw new Error("Invalid WebP picture.");
    const tag = String.fromCharCode(...bytes.subarray(p, p + 4));
    const n = view.getUint32(p + 4, true);
    if (["ANIM", "ANMF", "EXIF", "XMP ", "ICCP"].includes(tag) || p + 8 + n > bytes.length)
      throw new Error("Animated pictures or hidden metadata are not accepted.");
    p += 8 + n + (n % 2);
  }
  let image: Image;
  try {
    image = await Image.decode(bytes, {
      maxPixels: IMAGE_EDGE * IMAGE_EDGE,
      applyOrientation: false,
    });
  } catch {
    throw new Error("This picture could not be decoded.");
  }
  if (image.width !== IMAGE_EDGE || image.height !== IMAGE_EDGE)
    throw new Error("The picture must be exactly 512×512.");
  const png = await image.resize(256, 256).encode();
  return { png };
}

import { Image } from "imagescript";
export async function loadRendererSideImage(id: string) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: u } = await db
    .from("side_image_uploads")
    .select("png_path,status,renderer_failed")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!u || u.status !== "ok") return null;
  try {
    const { data: file } = await db.storage.from("side-images").download(u.png_path);
    if (!file || file.size > 400 * 1024) throw new Error("Image unavailable");
    const image = await Image.decode(new Uint8Array(await file.arrayBuffer()), {
      maxPixels: 256 * 256,
    });
    if (image.width !== 256 || image.height !== 256) throw new Error("Image dimensions invalid");
    // Circular alpha mask only changes the avatar, never the rope artwork.
    const rgba = new Uint8Array(image.bitmap);
    const center = 128;
    for (let y = 0; y < 256; y++)
      for (let x = 0; x < 256; x++)
        if (Math.hypot(x + 0.5 - center, y + 0.5 - center) > center)
          rgba[(y * 256 + x) * 4 + 3] = 0;
    return { w: 256, h: 256, rgba };
  } catch {
    if (!u.renderer_failed) {
      await db.from("side_image_uploads").update({ renderer_failed: true }).eq("id", id);
      await db
        .from("events")
        .insert({
          kind: "side_image_renderer_fallback",
          detail: { imageId: id, errorName: "DecodeError" },
        });
    }
    return null;
  }
}

import { z } from "zod";
import { requireOwner } from "../owner-auth.server";

export async function ownerDrafts(request: Request): Promise<Response> {
  const owner = await requireOwner(request);
  if (!owner.ok) return owner.response;
  const db = owner.admin;
  if (request.method === "PATCH") {
    const parsed = z.object({ id: z.string().uuid(), status: z.enum(["posted", "discarded"]) }).safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Invalid draft update" }, { status: 400 });
    const { data, error } = await db.from("post_drafts").update({ status: parsed.data.status }).eq("id", parsed.data.id).eq("status", "pending").gt("expires_at", new Date().toISOString()).select("id");
    if (error) return Response.json({ error: "Could not update draft" }, { status: 503 });
    if (!data?.length) return Response.json({ error: "Draft expired or already reviewed" }, { status: 409 });
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  }
  const { data, error } = await db.from("post_drafts").select("id,body,kind,source_url,source_context,expires_at,matchups(slug,title)").eq("status", "pending").gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(10);
  const { data: job, error: jobError } = await db.from("job_state").select("paused,reason").eq("job", "trend_scout").maybeSingle();
  if (error || jobError) return Response.json({ error: "Could not load drafts" }, { status: 503 });
  return Response.json({ drafts: data ?? [], paused: job?.paused ?? false, reason: job?.reason ?? null }, { headers: { "Cache-Control": "no-store" } });
}
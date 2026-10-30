import { publicDb, config } from "./server-utils.server";
import { ownerMatches } from "./support-schema";
export async function getAdminData(request: Request) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer "))
    return Response.json({ error: "Owner login required." }, { status: 401 });
  const db = publicDb();
  const { data: identity, error } = await db.auth.getUser(header.slice(7));
  if (error || !identity.user)
    return Response.json({ error: "Owner login required." }, { status: 401 });
  if (!ownerMatches(identity.user.email, config().ownerEmail) || !identity.user.email_confirmed_at)
    return Response.json({ error: "Owner access only." }, { status: 403 });
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: owner, error: roleError } = await supabaseAdmin.rpc("claim_tugg_owner", {
    p_user: identity.user.id,
    p_email: config().ownerEmail,
  });
  if (roleError || !owner) return Response.json({ error: "Owner access only." }, { status: 403 });
  const [summary, pulls, matchups, moderation, events, support, creators] = await Promise.all([
    supabaseAdmin.rpc("tugg_admin_summary"),
    supabaseAdmin
      .from("pulls")
      .select("id,amount_cents,environment,display_name,created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    supabaseAdmin
      .from("matchups")
      .select(
        "id,title,source,status,created_at,sides(name,image_id,image_status,image_report_count)",
      )
      .order("created_at", { ascending: false })
      .limit(200),
    supabaseAdmin
      .from("moderation_log")
      .select("id,subject_type,verdict,reason,content,created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    supabaseAdmin
      .from("events")
      .select("id,kind,detail,created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    supabaseAdmin
      .from("support_threads")
      .select("id,channel,email,name,message,ai_reply,payment_error,status,created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    supabaseAdmin.rpc("tugg_creation_revenue"),
  ]);
  if ([summary, pulls, matchups, moderation, events, support, creators].some((r) => r.error))
    return Response.json({ error: "Could not load owner records." }, { status: 503 });
  // Creator amounts are inferred from published prices; unpaid/rejected records are never revenue.
  const fees = creators.data as { live?: number; sandbox?: number } | null;
  const creationRevenue = { live: Number(fees?.live ?? 0), sandbox: Number(fees?.sandbox ?? 0) };
  return Response.json(
    {
      summary: summary.data,
      creationRevenue,
      pulls: pulls.data,
      matchups: (matchups.data ?? []).map((m) => {
        const { sides, ...row } = m;
        return {
          ...row,
          images: sides
            .map(
              (s) =>
                `${s.name}: ${s.image_id ? (s.image_status === "ok" ? "ok" : s.image_status === "hidden" ? "hidden" : s.image_status === "rejected" ? "rejected" : "pending") : "none"} (${s.image_report_count ?? 0} reports)`,
            )
            .join("; "),
        };
      }),
      moderation: moderation.data,
      events: events.data,
      support: support.data,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

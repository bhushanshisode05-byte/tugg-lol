import { config } from "./server-utils.server";
import { requireOwner } from "./owner-auth.server";
export async function getAdminData(request: Request) {
  const owner = await requireOwner(request);
  if (!owner.ok) return owner.response;
  const supabaseAdmin = owner.admin;
  const [summary, pulls, matchups, moderation, events, support, creators, dodo, payglocal, payglocalOrders, funnel, flaggedWallets, dodoOrders, dodoFunnel] =
    await Promise.all([
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
      supabaseAdmin.rpc("tugg_dodo_summary"),
      supabaseAdmin.rpc("tugg_payglocal_summary"),
      supabaseAdmin.from("payglocal_orders").select("id,environment,kind,quantity,expected_cents,status,provider_status,refund_status,reconcile_count,reconciled_at,reconcile_result,created_at").order("created_at",{ascending:false}).limit(200),
      supabaseAdmin.rpc("tugg_payglocal_funnel"),
      supabaseAdmin
        .from("pull_wallets")
        .select("id,environment,balance,flagged,created_at")
        .eq("flagged", true)
        .order("created_at", { ascending: false })
        .limit(200),
      supabaseAdmin.from("dodo_orders").select("id,environment,kind,quantity,expected_cents,status,provider_status,refund_status,reconcile_count,reconciled_at,reconcile_result,created_at").is("wallet_id",null).order("created_at",{ascending:false}).limit(200),
      supabaseAdmin.rpc("tugg_dodo_funnel"),
    ]);
  if (
    [summary, pulls, matchups, moderation, events, support, creators, dodo, payglocal, payglocalOrders, funnel, flaggedWallets, dodoOrders, dodoFunnel].some(
      (r) => r.error,
    )
  )
    return Response.json({ error: "Could not load owner records." }, { status: 503 });
  // Creation income is the actual amount paid on the active provider's paid creation orders; refunds, inactive and owner-created matchups never count.
  const byProvider = creators.data as Record<string, { live?: number; sandbox?: number } | undefined> | null;
  const fees = byProvider?.[config().paymentProvider];
  const creationRevenue = { live: Number(fees?.live ?? 0), sandbox: Number(fees?.sandbox ?? 0) };
  return Response.json(
    {
      provider: config().paymentProvider,
      dodoOrders: dodoOrders.data,
      summary: summary.data,
      dodo: dodo.data,
      payglocal: payglocal.data,
      payglocalOrders: payglocalOrders.data,
      funnel: config().paymentProvider === "dodo" ? dodoFunnel.data : funnel.data,
      flaggedWallets: flaggedWallets.data,
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

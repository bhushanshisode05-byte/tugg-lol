import { createFileRoute } from "@tanstack/react-router";
import { type StripeEnv, verifyWebhook, createStripeClient } from "@/lib/stripe.server";
import { moderate } from "@/lib/server-utils.server";

const SHOUT_PLACEHOLDER = "📣 (shout-out removed)";

async function fulfill(session: any, env: StripeEnv) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const md = session.metadata ?? {};
  if (md.kind === "pull") {
    // Duplicate check before spending an AI call.
    const { data: dup } = await supabaseAdmin.from("pulls").select("id").eq("stripe_session_id", session.id).maybeSingle();
    if (dup) return;
    let shout: string = (md.shout || "").slice(0, 80);
    let name: string = (md.name || "").slice(0, 40);
    if (shout || name) {
      const v = await moderate("shout_out", `Name: ${name}\nShout-out: ${shout}`);
      await supabaseAdmin.from("moderation_log").insert({
        subject_type: "shout_out",
        subject_id: session.id,
        content: `${name} | ${shout}`,
        verdict: v.allowed ? "allowed" : "rejected",
        reason: v.reason,
      });
      if (!v.allowed) {
        if (shout) shout = SHOUT_PLACEHOLDER;
        name = "";
      }
    }
    const { error } = await supabaseAdmin.rpc("record_pull", {
      p_session: session.id,
      p_side: md.side_id,
      p_amount: session.amount_subtotal, // net of tax, server-verified by Stripe
      p_name: name,
      p_shout: shout,
      p_country: session.customer_details?.address?.country ?? "",
      p_env: env,
    });
    if (error) throw new Error(error.message);
    return;
  }
  if (md.kind === "matchup") {
    // Idempotent: only the first event moves it out of pending_payment.
    const { data: m } = await supabaseAdmin
      .from("matchups")
      .update({ status: "pending_review" })
      .eq("id", md.matchup_id)
      .eq("status", "pending_payment")
      .select("id,title,description,sides(name,position)")
      .maybeSingle();
    if (!m) return;
    await supabaseAdmin
      .from("creators")
      .update({ email: session.customer_details?.email ?? null, payment_intent: session.payment_intent })
      .eq("stripe_session_id", session.id);
    const sides = (m as any).sides.sort((a: any, b: any) => a.position - b.position);
    const text = `Title: ${m.title}\nSide A: ${sides[0]?.name}\nSide B: ${sides[1]?.name}\nDescription: ${m.description}`;
    const v = await moderate("matchup", text);
    await supabaseAdmin.from("moderation_log").insert({
      subject_type: "matchup",
      subject_id: session.id,
      content: text,
      verdict: v.allowed ? "allowed" : "rejected",
      reason: v.reason,
    });
    if (v.allowed) {
      await supabaseAdmin
        .from("matchups")
        .update({
          status: "active",
          featured_until: md.tier === "featured" ? new Date(Date.now() + 7 * 864e5).toISOString() : null,
        })
        .eq("id", m.id);
      await supabaseAdmin.rpc("ensure_open_round", { p_matchup: m.id });
    } else {
      await supabaseAdmin.from("matchups").update({ status: "rejected" }).eq("id", m.id);
      try {
        const stripe = createStripeClient(env);
        await stripe.refunds.create({ payment_intent: session.payment_intent, reason: "requested_by_customer" });
        await supabaseAdmin.from("creators").update({ refunded: true }).eq("stripe_session_id", session.id);
      } catch (e) {
        await supabaseAdmin.from("events").insert({ kind: "refund_error", detail: { session: session.id, error: String(e) } });
      }
    }
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") return Response.json({ received: true, ignored: "invalid env" });
        const env: StripeEnv = rawEnv;
        const { config } = await import("@/lib/server-utils.server");
        // In live mode, test-mode events never touch the rope or matchups.
        if (config().paymentsEnv === "live" && env === "sandbox") return Response.json({ received: true, ignored: "sandbox event in live mode" });
        let event;
        try {
          event = await verifyWebhook(request, env);
        } catch (e) {
          console.error("Webhook verify error:", e);
          return new Response("Invalid signature", { status: 400 });
        }
        try {
          const obj = event.data.object;
          if (
            (event.type === "checkout.session.completed" && obj.payment_status !== "unpaid") ||
            event.type === "checkout.session.async_payment_succeeded"
          ) {
            await fulfill(obj, env);
          }
          return Response.json({ received: true });
        } catch (e) {
          console.error("Webhook handling error:", e);
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            await supabaseAdmin.from("events").insert({ kind: "webhook_error", detail: { type: event.type, error: String(e) } });
          } catch {}
          return new Response("Webhook error", { status: 500 });
        }
      },
    },
  },
});

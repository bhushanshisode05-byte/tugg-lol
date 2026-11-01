import { createFileRoute } from "@tanstack/react-router";
import { config } from "@/lib/server-utils.server";
import { createDodoProvider, dodoSettings } from "@/lib/payments/dodo.server";
import { verifyDodoSignature } from "@/lib/payments/signature";
import { webhookPayload, processDodoEvent } from "@/lib/payments/fulfillment.server";
export const Route = createFileRoute("/api/public/payments/dodo/webhook")({
  staticData: { sitemap: false }, server: { handlers: {
    POST: async ({ request }) => {
      const env = config().paymentsEnv;
      if (new URL(request.url).searchParams.get("env") !== env) return new Response("Wrong payment environment", { status: 403 });
      let settings;
      try { settings = dodoSettings(); } catch { return new Response("Dodo webhook is not configured", { status: 503 }); }
      if (Number(request.headers.get("content-length") || 0) > 262144) return new Response("Too large", { status: 413 });
      const raw = await request.text();
      if (new TextEncoder().encode(raw).length > 262144) return new Response("Too large", { status: 413 });
      let id: string;
      try { id = `${env}:${await verifyDodoSignature(raw, request.headers, settings.secret)}`; } catch { return new Response("Invalid signature", { status: 400 }); }
      let event;
      try { event = webhookPayload.parse(JSON.parse(raw)); } catch { return new Response("Invalid event", { status: 400 }); }
      const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
      // Persist only fields needed for processing, never customer details or credentials.
      const stored = await db.from("dodo_webhook_events").upsert({ id, environment: env, event_type: event.type, payload: { type: event.type, data: { payment_id: event.data.payment_id, ...(event.data.refund_id ? { refund_id: event.data.refund_id } : {}), ...(event.data.amount != null ? { amount: event.data.amount } : {}), ...(event.data.currency ? { currency: event.data.currency } : {}) } } }, { onConflict: "id", ignoreDuplicates: true });
      if (stored.error) return new Response("Try again", { status: 503 });
      const row = await db.from("dodo_webhook_events").select("status,environment,payload").eq("id", id).single();
      if (row.error || row.data.environment !== env) return new Response("Try again", { status: 503 });
      if (row.data.status === "done") return Response.json({ received: true, duplicate: true });
      const claim = await db.rpc("claim_dodo_event", { p_id: id });
      if (claim.error || !claim.data) return new Response("Processing; retry later", { status: 503 });
      try {
        await processDodoEvent(webhookPayload.parse(row.data.payload), createDodoProvider());
        const done = await db.from("dodo_webhook_events").update({ status: "done", lease_until: null }).eq("id", id);
        if (done.error) throw new Error("Unavailable");
        return Response.json({ received: true });
      } catch {
        await db.from("dodo_webhook_events").update({ status: "pending", lease_until: null }).eq("id", id);
        await db.from("events").insert({ kind: "dodo_webhook_error", detail: { webhookId: id, type: event.type } });
        return new Response("Payment processing unavailable; retry", { status: 503 });
      }
    },
  } },
});
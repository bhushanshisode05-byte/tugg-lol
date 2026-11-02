import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { config, moderate } from "./server-utils.server";
import { billingSchema } from "./payments/billing";
import { paymentReadiness, selectedProvider } from "./payments/selection.server";
import { verifyTurnstileForRequest } from "./turnstile.server";
import { TURNSTILE_ACTIONS, turnstileTokenSchema } from "./turnstile";
import { hashWalletToken } from "./payments/wallet";
export const buyImmediateBundle = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ funnelId: z.string().uuid().optional(), sideId: z.string().uuid(), pack: z.union([z.literal(5),z.literal(10),z.literal(25)]), name: z.string().trim().max(40).default(""), shout: z.string().trim().max(80).default(""), billing: billingSchema, returnUrl: z.string().url().max(500), turnstileToken: turnstileTokenSchema }).parse(d))
  .handler(async ({ data }) => {
    if (config().pausePulls) return { error: "Pulls are paused right now. Please try again later." };
    if (config().paymentProvider !== "payglocal" || config().pullMode !== "immediate") return { error: "Immediate checkout is unavailable." };
    try {
      paymentReadiness(); const provider = selectedProvider();
      await verifyTurnstileForRequest(data.turnstileToken, TURNSTILE_ACTIONS.pull);
      const { getRequest, getRequestIP } = await import("@tanstack/react-start/server");
      if (new URL(data.returnUrl).origin !== new URL(getRequest().url).origin) return { error: "Invalid return address." };
      const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
      const limit = await db.rpc("take_checkout_slot", { p_ip: `immediate:${await hashWalletToken(getRequestIP({ xForwardedFor: true }) || "unknown")}`, p_max: 10, p_window_minutes: 60 });
      if (limit.error || !limit.data) return { error: "Too many checkout attempts. Please try again later." };
      const side = await db.from("sides").select("id,matchups(status)").eq("id", data.sideId).single();
      if (side.error || side.data?.matchups?.status !== "active") return { error: "This matchup is not accepting pulls." };
      let name=data.name, shout=data.shout;
      if (name || shout) {
        const verdict = await moderate("shout_out", `Name: ${name}\nShout-out: ${shout}`);
        if (!verdict.allowed) { name=""; shout=""; }
      }
      const id=crypto.randomUUID(), returnUrl=new URL(data.returnUrl); returnUrl.searchParams.set("payment", id);
      const order = await db.from("payglocal_orders").insert({ id, funnel_id: data.funnelId ?? null, environment: provider.environment, merchant_unique_id: `${provider.environment === "live" ? "L" : "S"}${id.replaceAll("-", "")}`, kind: `pull_${data.pack}`, expected_cents: data.pack*100, quantity: data.pack, side_id: data.sideId, display_name: name, shout_out: shout, billing_country: data.billing.addressCountry, return_path: returnUrl.pathname+returnUrl.search }).select("id").single();
      if (order.error) throw new Error("Could not start checkout.");
      const session=await provider.checkout({ productId: `pull_${data.pack}`, orderId: id, returnUrl: returnUrl.toString(), cents: data.pack*100, billing: data.billing });
      const saved=await db.from("payglocal_orders").update({ gid: session.sessionId, status_url: session.statusUrl || null }).eq("id", id).is("gid", null);
      if (saved.error) throw new Error("Checkout confirmation pending. Please do not pay again.");
      return { url: session.url, orderId: id, environment: provider.environment, codedropId: config().payglocal.codedropId };
    } catch(e) { return { error: e instanceof Error ? e.message : "Checkout could not open. No unverified pulls applied." }; }
  });
export const getImmediatePayment = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const r=await db.from("payglocal_orders").select("status,quantity").eq("id",data.orderId).eq("environment",config().paymentsEnv).single();
    return r.data ? { status:r.data.status, quantity:r.data.quantity } : null;
  });
export const getCodeDropConfig = createServerFn({ method: "GET" }).handler(async () => ({
  environment: config().paymentsEnv, codedropId: config().paymentProvider === "payglocal" ? config().payglocal.codedropId : "",
}));
export const recordPaymentFunnel = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ funnelId: z.string().uuid(), step: z.enum(["viewed","bundle_selected","turnstile_passed","opened","cancelled","abandoned","failed"]), bundle: z.union([z.literal(5),z.literal(10),z.literal(25)]), mode: z.enum(["none","drawer","redirect"]).default("none") }).strict().parse(d))
  .handler(async ({ data }) => {
    const { getRequestIP } = await import("@tanstack/react-start/server");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const slot = await db.rpc("take_checkout_slot", { p_ip: `funnel:${await hashWalletToken(getRequestIP({xForwardedFor:true}) || "unknown")}`, p_max: 120, p_window_minutes: 60 });
    if (slot.error || !slot.data) return;
    await db.from("payglocal_funnel_events").upsert({ funnel_id: data.funnelId ?? null, environment: config().paymentsEnv, step: data.step, bundle: data.bundle, mode: data.mode }, { onConflict: "funnel_id,environment,step,bundle,mode", ignoreDuplicates: true });
  });

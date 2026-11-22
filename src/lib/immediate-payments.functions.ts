import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { config, moderate, SHOUT_OUT_UNAVAILABLE } from "./server-utils.server";
import { billingSchema } from "./payments/billing";
import { basketActive, paymentReadiness, selectedProvider, selectedProduct } from "./payments/selection.server";
import { verifyTurnstileForRequest } from "./turnstile.server";
import { TURNSTILE_ACTIONS, turnstileTokenSchema } from "./turnstile";
import { hashWalletToken } from "./payments/wallet";
import { immediateAmountSchema, immediatePurchase } from "./payments/custom-pull";
import { CUSTOM_AMOUNT_ERROR } from "./payments/catalog";
export const buyImmediateBundle = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ funnelId: z.string().uuid().optional(), sideId: z.string().uuid(), pack: z.union([z.literal(5),z.literal(10),z.literal(25),z.literal("custom")]), customCents: z.number().optional(), name: z.string().trim().max(40).default(""), shout: z.string().trim().max(80).default(""), billing: billingSchema.optional(), returnUrl: z.string().url().max(500), turnstileToken: turnstileTokenSchema }).parse(d))
  .handler(async ({ data }) => {
    if (config().pausePulls) return { error: "Pulls are paused right now. Please try again later." };
    if (!["dodo","payglocal"].includes(config().paymentProvider) || config().pullMode !== "immediate") return { error: "Immediate checkout is unavailable." };
    try {
      paymentReadiness(); const provider = selectedProvider();
      await verifyTurnstileForRequest(data.turnstileToken, TURNSTILE_ACTIONS.pull);
      const amount = immediateAmountSchema.safeParse({ pack: data.pack, ...(data.customCents === undefined ? {} : { customCents: data.customCents }) });
      if (!amount.success) return { error: CUSTOM_AMOUNT_ERROR };
      const purchase = immediatePurchase(amount.data);
      if (purchase.kind === "pull_custom" && config().paymentProvider !== "dodo") return { error: "Custom pulls are available through Dodo only." };
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
        // An outage is not a rejection: ask the buyer before payment instead of silently dropping their words.
        if (verdict.outcome === "unavailable") return { error: SHOUT_OUT_UNAVAILABLE };
        if (verdict.outcome !== "allowed") { name=""; shout=""; }
      }
      const kind = purchase.kind;
      const product = selectedProduct(kind);
      if (kind === "pull_custom") {
        if (!provider.validateCustomProduct) return { error: "Custom checkout is unavailable. No payment has been taken." };
        await provider.validateCustomProduct(product);
      } else await provider.validateProduct(product, purchase.cents);
      if (config().paymentProvider === "payglocal" && !data.billing) return { error: "Billing details are required for digital purchases." };
      const id=crypto.randomUUID(), returnUrl=new URL(data.returnUrl); returnUrl.searchParams.set("payment", id);
      if (config().paymentProvider === "dodo") {
        const order = await db.from("dodo_orders").insert({ id, environment: provider.environment, kind, product_id: product, expected_cents: purchase.cents, quantity: purchase.pulls, side_id: data.sideId, display_name: name, shout_out: shout, funnel_id: data.funnelId ?? null }).select("id").single();
        if (order.error) throw new Error("Could not start checkout.");
        const session = await provider.checkout({ productId: product, orderId: id, returnUrl: returnUrl.toString(), ...(kind === "pull_custom" ? { customAmountCents: purchase.cents } : {}) });
        const saved = await db.from("dodo_orders").update({ checkout_id: session.sessionId }).eq("id",id).is("checkout_id",null);
        if (saved.error) throw new Error("Checkout confirmation pending. Please do not pay again.");
        return { url: session.url, orderId: id, environment: provider.environment, provider: "dodo", codedropId: "" };
      }
      if (!data.billing) return { error: "Billing details are required." };
      const order = await db.from("payglocal_orders").insert({ id, buyer_email: data.billing.emailId, funnel_id: data.funnelId ?? null, environment: provider.environment, merchant_unique_id: `${provider.environment === "live" ? "L" : "S"}${id.replaceAll("-", "")}`, kind: `pull_${data.pack}`, expected_cents: purchase.cents, quantity: purchase.pulls, side_id: data.sideId, display_name: name, shout_out: shout, billing_country: data.billing.addressCountry, return_path: returnUrl.pathname+returnUrl.search }).select("id").single();
      if (order.error) throw new Error("Could not start checkout.");
      const session=await provider.checkout({ productId: `pull_${data.pack}`, orderId: id, returnUrl: returnUrl.toString(), cents: purchase.cents, billing: data.billing });
      const saved=await db.from("payglocal_orders").update({ gid: session.sessionId, status_url: session.statusUrl || null }).eq("id", id).is("gid", null);
      if (saved.error) throw new Error("Checkout confirmation pending. Please do not pay again.");
      return { url: session.url, orderId: id, environment: provider.environment, provider: "payglocal", codedropId: config().payglocal.codedropId };
    } catch(e) { return { error: e instanceof Error ? e.message : "Checkout could not open. No unverified pulls applied." }; }
  });
export const getImmediatePayment = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    if (config().paymentProvider === "dodo") {
      // Public-safe columns only: the private buyer email is never selected here.
      const d=await db.from("dodo_orders").select("id,status,quantity,basket_refund_cents,kind,expected_cents,side_id").eq("id",data.orderId).eq("environment",config().paymentsEnv).single();
      if (!d.data) return null;
      const result = { status:d.data.status, quantity:d.data.quantity, refundedPulls: Math.floor(d.data.basket_refund_cents/100) };
      if (d.data.status !== "paid" || !d.data.side_id && d.data.kind !== "basket") return result;
      // A receipt that cannot be built never hides the confirmed payment.
      const receipt = await (await import("./payments/receipt.server")).dodoReceipt(db, d.data).catch(() => null);
      return { ...result, receipt };
    }
    const r=await db.from("payglocal_orders").select("status,quantity").eq("id",data.orderId).eq("environment",config().paymentsEnv).single();
    return r.data ? { status:r.data.status, quantity:r.data.quantity, refundedPulls: 0 } : null;
  });
export const getCodeDropConfig = createServerFn({ method: "GET" }).handler(async () => ({
  environment: config().paymentsEnv, provider: config().paymentProvider, codedropId: config().paymentProvider === "payglocal" ? config().payglocal.codedropId : "",
}));
export const recordPaymentFunnel = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ funnelId: z.string().uuid(), step: z.enum(["viewed","bundle_selected","turnstile_passed","opened","cancelled","abandoned","failed"]), bundle: z.number().int().min(5).max(1000), mode: z.enum(["none","drawer","redirect"]).default("none") }).strict().parse(d))
  .handler(async ({ data }) => {
    // Custom basket amounts are only recorded while the Dodo basket is on; fixed bundles otherwise.
    if (![5,10,25].includes(data.bundle) && config().paymentProvider !== "dodo" && !basketActive()) return;
    const { getRequestIP } = await import("@tanstack/react-start/server");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const slot = await db.rpc("take_checkout_slot", { p_ip: `funnel:${await hashWalletToken(getRequestIP({xForwardedFor:true}) || "unknown")}`, p_max: 120, p_window_minutes: 60 });
    if (slot.error || !slot.data) return;
    await db.from(config().paymentProvider === "dodo" ? "dodo_funnel_events" : "payglocal_funnel_events").upsert({ funnel_id: data.funnelId ?? null, environment: config().paymentsEnv, step: data.step, bundle: data.bundle, mode: data.mode }, { onConflict: "funnel_id,environment,step,bundle,mode", ignoreDuplicates: true });
  });

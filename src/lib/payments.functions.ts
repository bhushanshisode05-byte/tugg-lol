import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { config, moderate } from "./server-utils.server";
import { createDodoProvider, productId, dodoSettings } from "./payments/dodo.server";
import { PRODUCTS } from "./payments/catalog";
import { hashWalletToken, newWalletToken, walletTokenPattern } from "./payments/wallet";
import { TURNSTILE_ACTIONS, turnstileTokenSchema } from "./turnstile";
import { verifyTurnstileForRequest } from "./turnstile.server";
import { paymentReadiness } from "./payments/selection.server";
const tokenSchema = z.string().regex(walletTokenPattern);
export const getPaymentStatus = createServerFn({ method: "GET" }).handler(async () => {
  let ready = false;
  let message = "";
  try {
    paymentReadiness();
    ready = true;
  } catch (e) {
    message = e instanceof Error ? e.message : "Checkout is unavailable. No payment has been taken.";
  }
  return { environment: config().paymentsEnv, provider: config().paymentProvider, pullMode: config().pullMode, ready, message, paused: config().pausePulls };
});
export const getWallet = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ token: tokenSchema, orderId: z.string().uuid().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    if (config().paymentProvider !== "dodo" || config().pullMode !== "wallet") return { error: "Wallets are dormant in immediate-bundle mode." };
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const result = await db
      .from("pull_wallets")
      .select("id,balance,flagged")
      .eq("token_hash", await hashWalletToken(data.token))
      .eq("environment", config().paymentsEnv)
      .maybeSingle();
    if (result.error || !result.data)
      return { error: "This recovery link has no wallet in the current payment environment." };
    let paid = false;
    if (data.orderId) {
      const order = await db
        .from("dodo_orders")
        .select("status")
        .eq("id", data.orderId)
        .eq("wallet_id", result.data.id)
        .eq("environment", config().paymentsEnv)
        .maybeSingle();
      paid = order.data?.status === "paid";
    }
    return { balance: result.data.balance, flagged: result.data.flagged, paid };
  });
export const buyPullPack = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        pack: z.union([z.literal(5), z.literal(10), z.literal(25)]),
        token: tokenSchema.optional(),
        returnUrl: z.string().url().max(500),
        turnstileToken: turnstileTokenSchema,
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    if (config().paymentProvider !== "dodo" || config().pullMode !== "wallet") return { error: "Wallet purchases are dormant in immediate-bundle mode." };
    if (config().pausePulls)
      return { error: "Pulls are paused right now. Please try again later." };
    try {
      const provider = createDodoProvider();
      const kind = data.pack === 5 ? "pull_5" : data.pack === 10 ? "pull_10" : "pull_25";
      const product = productId(kind);
      await provider.validateProduct(product, PRODUCTS[kind].cents);
      await verifyTurnstileForRequest(data.turnstileToken, TURNSTILE_ACTIONS.pull);
      const { getRequest, getRequestIP } = await import("@tanstack/react-start/server");
      const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
      const requestOrigin = new URL(getRequest().url).origin;
      if (new URL(data.returnUrl).origin !== requestOrigin)
        return { error: "Invalid return address." };
      const limit = await db.rpc("take_checkout_slot", {
        p_ip: `pack:${await hashWalletToken(getRequestIP({ xForwardedFor: true }) || "unknown")}`,
        p_max: 10,
        p_window_minutes: 60,
      });
      if (limit.error || !limit.data)
        return { error: "Too many checkout attempts. Please try again later." };
      const token = data.token || newWalletToken();
      const hash = await hashWalletToken(token);
      const wallet = await db
        .from("pull_wallets")
        .select("id,flagged,environment")
        .eq("token_hash", hash)
        .maybeSingle();
      let walletId = wallet.data?.id;
      if (
        wallet.error ||
        wallet.data?.flagged ||
        (wallet.data && wallet.data.environment !== provider.environment)
      )
        return { error: "This wallet is unavailable for purchases in this payment environment." };
      if (!walletId) {
        const created = await db
          .from("pull_wallets")
          .insert({ token_hash: hash, environment: provider.environment })
          .select("id")
          .single();
        if (created.error || !created.data) {
          const retry = await db
            .from("pull_wallets")
            .select("id,flagged")
            .eq("token_hash", hash)
            .eq("environment", provider.environment)
            .single();
          if (retry.error || !retry.data || retry.data.flagged)
            throw new Error("Could not create wallet.");
          walletId = retry.data.id;
        } else walletId = created.data.id;
      }
      const order = await db
        .from("dodo_orders")
        .insert({
          kind,
          environment: provider.environment,
          expected_cents: PRODUCTS[kind].cents,
          product_id: product,
          wallet_id: walletId,
        })
        .select("id")
        .single();
      if (order.error || !order.data) throw new Error("Could not start checkout.");
      const returnUrl = new URL(data.returnUrl);
      returnUrl.searchParams.set("order", order.data.id);
      const checkout = await provider.checkout({
        productId: product,
        orderId: order.data.id,
        returnUrl: returnUrl.toString(),
      });
      const saved = await db
        .from("dodo_orders")
        .update({ checkout_id: checkout.sessionId })
        .eq("id", order.data.id);
      if (saved.error) throw new Error("Could not start checkout.");
      return { url: checkout.url, token, orderId: order.data.id };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Could not start Dodo checkout." };
    }
  });
export const spendPulls = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: tokenSchema,
        sideId: z.string().uuid(),
        quantity: z.union([z.literal(1), z.literal(5), z.literal(10)]),
        requestId: z.string().uuid(),
        name: z.string().trim().max(40).default(""),
        shout: z.string().trim().max(80).default(""),
        turnstileToken: turnstileTokenSchema,
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    if (config().paymentProvider !== "dodo" || config().pullMode !== "wallet") return { error: "Wallet spending is dormant in immediate-bundle mode." };
    if (config().pausePulls)
      return { error: "Pulls are paused right now. Please try again later." };
    try {
      await verifyTurnstileForRequest(data.turnstileToken, TURNSTILE_ACTIONS.pull);
      const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
      let name = data.name,
        shout = data.shout;
      if (name || shout) {
        const verdict = await moderate("shout_out", `Name: ${name}\nShout-out: ${shout}`);
        const logged = await db
          .from("moderation_log")
          .insert({
            subject_type: "shout_out",
            subject_id: data.requestId,
            content: `${name} | ${shout}`,
            verdict: verdict.allowed ? "allowed" : "rejected",
            reason: verdict.reason,
          });
        if (logged.error) throw new Error("Moderation unavailable.");
        if (!verdict.allowed) {
          name = "";
          if (shout) shout = "📣 (shout-out removed)";
        }
      }
      const result = await db.rpc("spend_wallet_pull", {
        p_hash: await hashWalletToken(data.token),
        p_env: config().paymentsEnv,
        p_side: data.sideId,
        p_quantity: data.quantity,
        p_request: data.requestId,
        p_name: name,
        p_shout: shout,
      });
      if (result.error) {
        const known = [
          "Not enough pulls",
          "Wallet not found",
          "This wallet is under payment review",
          "Matchup not active",
        ];
        return {
          error:
            known.find((s) => result.error.message.includes(s)) ||
            "Pull could not be recorded. Please try again.",
        };
      }
      const output = result.data as { balance: number; duplicate?: boolean };
      return { balance: output.balance, duplicate: output.duplicate ?? false };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Pull could not be recorded." };
    }
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { config, moderate, publicDb, SHOUT_OUT_UNAVAILABLE } from "./server-utils.server";
import { basketActive, paymentReadiness, selectedProvider } from "./payments/selection.server";
import { productId } from "./payments/dodo.server";
import { verifyTurnstileForRequest } from "./turnstile.server";
import { TURNSTILE_ACTIONS, turnstileTokenSchema } from "./turnstile";
import { hashWalletToken } from "./payments/wallet";
import { PULL_UNIT_CENTS, basketLinesSchema, basketTotal, encodeBasketMetadata } from "./payments/basket";

const BASKET_ERRORS: Record<string, string> = {
  "basket:duplicate_matchup": "Each matchup can appear only once, with one side.",
  "basket:too_many_matchups": "A basket can include at most 10 matchups.",
  "basket:side_mismatch": "One of the chosen sides is not part of its matchup. Please refresh and try again.",
  "basket:matchup_unavailable": "One of these matchups is no longer accepting pulls. Remove it and try again.",
  "basket:amount": "Choose between $5 and $500.",
};

export const buyPullBasket = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    funnelId: z.string().uuid().optional(),
    lines: z.unknown(),
    name: z.string().trim().max(40).default(""),
    shout: z.string().trim().max(80).default(""),
    returnUrl: z.string().url().max(500),
    turnstileToken: turnstileTokenSchema,
  }).parse(d))
  .handler(async ({ data }) => {
    if (config().pausePulls) return { error: "Pulls are paused right now. Please try again later." };
    if (!basketActive()) return { error: "This checkout option is unavailable." };
    // The browser is untrusted: rules are re-checked here and again inside the database.
    const parsed = basketLinesSchema.safeParse(data.lines);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid basket." };
    const lines = parsed.data;
    try {
      paymentReadiness(); const provider = selectedProvider();
      await verifyTurnstileForRequest(data.turnstileToken, TURNSTILE_ACTIONS.pull);
      const { getRequest, getRequestIP } = await import("@tanstack/react-start/server");
      if (new URL(data.returnUrl).origin !== new URL(getRequest().url).origin) return { error: "Invalid return address." };
      const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
      const limit = await db.rpc("take_checkout_slot", { p_ip: `immediate:${await hashWalletToken(getRequestIP({ xForwardedFor: true }) || "unknown")}`, p_max: 10, p_window_minutes: 60 });
      if (limit.error || !limit.data) return { error: "Too many checkout attempts. Please try again later." };
      let name = data.name, shout = data.shout;
      if (name || shout) {
        const verdict = await moderate("shout_out", `Name: ${name}\nShout-out: ${shout}`);
        // An outage is not a rejection: ask the buyer before payment instead of silently dropping their words.
        if (verdict.outcome === "unavailable") return { error: SHOUT_OUT_UNAVAILABLE };
        if (verdict.outcome !== "allowed") { name = ""; shout = ""; }
      }
      const product = productId("pull_1");
      await provider.validateProduct(product, PULL_UNIT_CENTS);
      const id = crypto.randomUUID(), returnUrl = new URL(data.returnUrl); returnUrl.searchParams.set("payment", id);
      const created = await db.rpc("create_dodo_basket", {
        p_order: id, p_env: provider.environment, p_product: product,
        p_lines: lines.map((l) => ({ matchup_id: l.matchupId, side_id: l.sideId, quantity: l.pulls })),
        p_name: name, p_shout: shout, p_funnel: (data.funnelId ?? null) as string,
      });
      if (created.error) {
        const key = Object.keys(BASKET_ERRORS).find((k) => created.error!.message.includes(k));
        return { error: key ? BASKET_ERRORS[key]! : "Could not start checkout. No payment has been taken." };
      }
      const total = basketTotal(lines);
      if (created.data !== total) throw new Error("Could not start checkout.");
      // One session, one $1 product, quantity = total pulls: 17 pulls is a single $17 charge.
      const session = await provider.checkout({ productId: product, orderId: id, returnUrl: returnUrl.toString(), quantity: total, metadata: encodeBasketMetadata(id, provider.environment, lines) });
      const saved = await db.from("dodo_orders").update({ checkout_id: session.sessionId }).eq("id", id).is("checkout_id", null);
      if (saved.error) throw new Error("Checkout confirmation pending. Please do not pay again.");
      return { url: session.url, orderId: id, environment: provider.environment, provider: "dodo" as const, total };
    } catch (e) { return { error: e instanceof Error ? e.message : "Checkout could not open. No unverified pulls applied." }; }
  });

/** Active matchups a buyer can add to a basket (public fields only). */
export const listBasketMatchups = createServerFn({ method: "GET" }).handler(async () => {
  const r = await publicDb().from("matchups").select("id,slug,title,sides(id,name,emoji,position)").eq("status", "active").order("created_at", { ascending: false }).limit(200);
  return (r.data ?? []).map((m) => ({ id: m.id, slug: m.slug, title: m.title, sides: [...(m.sides ?? [])].sort((a, b) => a.position - b.position).map((s) => ({ id: s.id, name: s.name, emoji: s.emoji })) }));
});

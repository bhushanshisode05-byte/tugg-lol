import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { publicDb, config } from "./server-utils.server";
import { SHARE_CHANNELS } from "./share";
import { shareEventSchema } from "./phone-share";
import { TURNSTILE_ACTIONS, turnstileTokenSchema } from "./turnstile";
export { SHARE_CHANNELS } from "./share";

export type Recap = {
  day: string;
  summary: string;
  body: { headline?: string; paragraphs?: string[] };
  facts: import("./jobs.server").RecapFacts;
  /** Closed round id per matchup slug, for result card images. */
  resultIds?: Record<string, string>;
};

export const getRecap = createServerFn({ method: "GET" })
  .inputValidator((d: { day?: string }) => z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).parse(d))
  .handler(async ({ data }) => {
    const db = publicDb();
    let q = db.from("recaps").select("day,summary,body,facts");
    q = data.day ? q.eq("day", data.day) : q.order("day", { ascending: false }).limit(1);
    const [{ data: rows }, { data: archive }] = await Promise.all([
      q,
      db.from("recaps").select("day,summary").order("day", { ascending: false }).limit(90),
    ]);
    const recap = ((rows ?? [])[0] ?? null) as Recap | null;
    if (recap) {
      const to = new Date(new Date(`${recap.day}T00:00:00Z`).getTime() + 86400000);
      const { data: closed } = await db
        .from("rounds")
        .select("id,matchups!inner(slug)")
        .eq("status", "closed")
        .not("winner_side_id", "is", null)
        .gte("ends_at", to.toISOString())
        .lt("ends_at", new Date(to.getTime() + 3600000).toISOString());
      recap.resultIds = Object.fromEntries((closed ?? []).map((r: any) => [r.matchups.slug as string, r.id as string]));
    }
    return { recap, archive: (archive ?? []) as { day: string; summary: string }[], siteUrl: config().siteUrl };
  });

async function ipHash(ns: string) {
  const { getRequestIP } = await import("@tanstack/react-start/server");
  const ip = getRequestIP({ xForwardedFor: true }) || "unknown";
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${ns}:${ip}`));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const subscribeDigest = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ email: z.string().trim().toLowerCase().email().max(254), turnstileToken: turnstileTokenSchema }).parse(d))
  .handler(async ({ data }) => {
    const { verifyTurnstileForRequest, TurnstileError } = await import("./turnstile.server");
    try {
      await verifyTurnstileForRequest(data.turnstileToken, TURNSTILE_ACTIONS.digest);
    } catch (e) {
      return { ok: false, message: e instanceof TurnstileError ? e.message : "The security check failed. Please try again." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ok } = await supabaseAdmin.rpc("take_checkout_slot", { p_ip: await ipHash("digest"), p_max: 5, p_window_minutes: 60 });
    if (!ok) return { ok: false, message: "Too many signups from your network. Try again later." };
    const { error } = await supabaseAdmin.from("digest_subscribers").upsert({ email: data.email }, { onConflict: "email", ignoreDuplicates: true });
    if (error) return { ok: false, message: "Could not save your email. Please try again." };
    return { ok: true, message: "You're on the list for the daily Tugg digest." };
  });

/** Anonymous share counter; failures store only channel and a standard error name. */
export const trackShare = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => shareEventSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ok } = await supabaseAdmin.rpc("take_checkout_slot", { p_ip: await ipHash("share"), p_max: 60, p_window_minutes: 60 });
    if (!ok) return { ok: false };
    await supabaseAdmin.from("events").insert({ kind: "share_click", detail: data.channel === "share_error" ? { channel: data.channel, errorName: data.errorName } : { slug: data.slug, channel: data.channel } });
    return { ok: true };
  });

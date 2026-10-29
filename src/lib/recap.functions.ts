import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { publicDb, config } from "./server-utils.server";
import { SHARE_CHANNELS } from "./share";
export { SHARE_CHANNELS } from "./share";

export type Recap = {
  day: string;
  summary: string;
  body: { headline?: string; paragraphs?: string[] };
  facts: import("./jobs.server").RecapFacts;
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
    return { recap: ((rows ?? [])[0] ?? null) as Recap | null, archive: (archive ?? []) as { day: string; summary: string }[], siteUrl: config().siteUrl };
  });

async function ipHash(ns: string) {
  const { getRequestIP } = await import("@tanstack/react-start/server");
  const ip = getRequestIP({ xForwardedFor: true }) || "unknown";
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${ns}:${ip}`));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const subscribeDigest = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ email: z.string().trim().toLowerCase().email().max(254) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ok } = await supabaseAdmin.rpc("take_checkout_slot", { p_ip: await ipHash("digest"), p_max: 5, p_window_minutes: 60 });
    if (!ok) return { ok: false, message: "Too many signups from your network. Try again later." };
    const { error } = await supabaseAdmin.from("digest_subscribers").upsert({ email: data.email }, { onConflict: "email", ignoreDuplicates: true });
    if (error) return { ok: false, message: "Could not save your email. Please try again." };
    return { ok: true, message: "You're on the list for the daily Tugg digest." };
  });

/** Anonymous share counter: stores only matchup slug + channel. */
export const trackShare = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/), channel: z.enum(SHARE_CHANNELS) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ok } = await supabaseAdmin.rpc("take_checkout_slot", { p_ip: await ipHash("share"), p_max: 60, p_window_minutes: 60 });
    if (!ok) return { ok: false };
    await supabaseAdmin.from("events").insert({ kind: "share_click", detail: { slug: data.slug, channel: data.channel } });
    return { ok: true };
  });

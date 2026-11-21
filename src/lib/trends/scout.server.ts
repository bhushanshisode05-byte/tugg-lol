import { config, slugify } from "../server-utils.server";
import { createModeratedOwnerMatchup } from "../owner-matchups.server";
import { ownerMatchupSchema } from "../owner-matchup-schema";
import { scoutTrends, draftWinner, ScoutError, trendSchema } from "./xai.server";
import { z } from "zod";

export const TREND_ROPE_CAP = 3;
export const PENDING_DRAFT_CAP = 10;
export const trendSlots = (pending: number) => Math.max(0, Math.min(TREND_ROPE_CAP, Math.floor((PENDING_DRAFT_CAP - pending) / 2)));

/** Once daily, bounded, durable lease; failed/unknown provider requests are never automatically replayed. */
export async function runScout() {
  const c = config();
  if (!c.trendScout || !c.xaiKey) return { skipped: "disabled or no key" };
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: state, error: stateError } = await db.from("job_state").select("paused").eq("job", "trend_scout").maybeSingle();
  if (stateError) throw new Error("Could not read scout state");
  if (state?.paused) return { skipped: "paused" };
  const day = new Date().toISOString().slice(0, 10), lease = crypto.randomUUID();
  const { data: locked, error: lockError } = await db.rpc("claim_trend_scout", { p_day: day, p_lease: lease });
  if (lockError) throw new Error("Could not claim scout run");
  if (!locked) return { skipped: "already running or completed" };
  await db.from("job_runs").upsert({ job: "trend_scout", day, status: "running" });
  let created = 0, drafts = 0;
  try {
    const expired = await db.from("post_drafts").update({ status: "discarded" }).eq("status", "pending").lte("expires_at", new Date().toISOString());
    if (expired.error) throw new Error("Could not expire drafts");
    const pending = await db.from("post_drafts").select("id", { count: "exact", head: true }).eq("status", "pending");
    if (pending.error || pending.count === null) throw new Error("Could not count drafts");
    const slots = trendSlots(pending.count);
    if (slots) {
      const trends = await scoutTrends();
      for (const raw of trends.slice(0, 6)) {
        if (created >= slots) break;
        if (!config().trendScout) break;
        const parsed = trendSchema.safeParse(raw);
        if (!parsed.success) continue;
        const trend = parsed.data;
        const old = await db.from("post_drafts").select("id").eq("source_url", trend.sourceUrl).limit(1);
        if (old.error) throw new Error("Could not deduplicate source");
        if (old.data?.length) continue;
        // Reserve before creating: a crash cannot create more than three ropes on a later attempt.
        const reserved = await db.rpc("reserve_trend_rope", { p_day: day, p_lease: lease });
        if (reserved.error) throw new Error("Could not reserve scout slot");
        if (!reserved.data) break;
        const provisionalLink = `${c.siteUrl || "https://tugg.lol"}/m/${slugify(trend.title) || "matchup"}`;
        // Finish both independent voice passes before a rope is created. Failed copy creates no empty rope.
        const quote = await draftWinner(trend, "quote_tweet", provisionalLink);
        const reply = await draftWinner(trend, "reply", provisionalLink);
        if (!quote || !reply || !config().trendScout) continue;
        const input = ownerMatchupSchema.parse({ title: trend.title, a: trend.a, b: trend.b, category: trend.category,
          aEmoji: "🔴", bEmoji: "🔵", description: "" });
        const response = await createModeratedOwnerMatchup(db, input);
        if (!response.ok) continue;
        created++;
        const result = z.object({ created: z.literal(true), slug: z.string(), title: z.string() }).parse(await response.json());
        const matchup = await db.from("matchups").select("id").eq("slug", result.slug).single();
        if (matchup.error || !matchup.data) throw new Error("Could not read created rope");
        const link = `${c.siteUrl || "https://tugg.lol"}/m/${result.slug}`;
        // The shared creator may suffix a clashing slug. Only replace the final, already-validated link.
        const finalQuote = quote.endsWith(provisionalLink) ? quote.slice(0, -provisionalLink.length) + link : quote;
        if (!config().trendScout) break;
        const saved = await db.rpc("save_trend_drafts", { p_day: day, p_lease: lease, p_matchup: matchup.data.id,
          p_source: trend.sourceUrl, p_context: trend.why, p_quote: finalQuote, p_reply: reply });
        if (saved.error) throw new Error("Could not save draft pair");
        if (saved.data) drafts += 2;
      }
    }
    await db.from("trend_scout_runs").update({ completed: true }).eq("day", day).eq("lease", lease);
    await db.from("job_runs").update({ status: "done", detail: { created, drafts }, finished_at: new Date().toISOString() }).eq("job", "trend_scout").eq("day", day);
    return { created, drafts };
  } catch (error) {
    const status = error instanceof ScoutError ? error.status : 0;
    // Auth, billing and rate limits pause all scheduled entry points until owner recovery. No probes on denial.
    if ([401, 402, 403, 429].includes(status)) {
      await db.from("job_state").upsert({ job: "trend_scout", paused: true, status, reason: `Trend provider unavailable (${status})`, updated_at: new Date().toISOString() });
    }
    // Complete even on unknown outcome: never replay billed inference because the result is missing.
    await db.from("trend_scout_runs").update({ completed: true }).eq("day", day).eq("lease", lease);
    await db.from("job_runs").update({ status: status ? "paused" : "failed", detail: { created, drafts, error: "Scout incomplete", provider_status: status }, finished_at: new Date().toISOString() }).eq("job", "trend_scout").eq("day", day);
    throw new Error("Trend scout incomplete; review owner job records");
  }
}
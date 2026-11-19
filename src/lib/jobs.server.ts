import { Output } from "ai";
import { z } from "zod";
import { createLovableAiGatewayRunIdFetch } from "./ai/run-id.ts";
import { config, liveOnly, moderate, slugify } from "./server-utils.server";
import { roundLengthOf, type RoundLength } from "./rounds";
import { AI_CATEGORIES } from "./owner-matchup-schema";
import { GENERATOR_INSTRUCTIONS } from "./content-policy";
export { AI_CATEGORIES };

export const AI_DAILY = 3;
export const AI_ACTIVE_CAP = 30;
export const PALETTE = ["#ff3b30", "#0a84ff", "#ffd60a", "#30d158", "#bf5af2", "#ff9f0a", "#64d2ff", "#ff375f"];

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Number of new AI matchups allowed right now. */
export const aiSlots = (activeAi: number) => Math.max(0, Math.min(AI_DAILY, AI_ACTIVE_CAP - activeAi));

/** Same pair in either order counts as a duplicate. */
export const pairKey = (a: string, b: string) =>
  [a, b].map((s) => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "")).sort().join("|");

class JobPaused extends Error {}

/** One streamed structured call through Lovable AI. 402/403 pause the job until the owner resumes. */
async function aiObject<T>(job: string, schema: z.ZodType<T>, instructions: string, input: string): Promise<T> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("LOVABLE_API_KEY missing");
  const db = await admin();
  const { createOpenAI } = await import("@ai-sdk/openai");
  const { streamText } = await import("ai");
  const gateway = createLovableAiGatewayRunIdFetch();
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey: key,
    headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: async (i, init) => {
      const res = await gateway.fetch(i, init);
      if (res.status === 402 || res.status === 403) {
        const raw = await res.clone().json().catch(() => null);
        await db.from("job_state").upsert({ job, paused: true, status: res.status, reason: raw?.message ?? `AI ${res.status}`, updated_at: new Date().toISOString() });
        throw new JobPaused(`AI unavailable (${res.status})`);
      }
      return res;
    },
  });
  const result = streamText({
    model: provider.responses("openai/gpt-6-astra"),
    maxRetries: 0,
    instructions,
    messages: [{ role: "user", content: input }],
    output: Output.object({ schema }),
    providerOptions: {
      openai: { forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] },
    },
  });
  return (await result.output) as T;
}

async function paused(job: string) {
  const { data } = await (await admin()).from("job_state").select("paused").eq("job", job).maybeSingle();
  return !!data?.paused;
}

/** Single-flight + idempotent per UTC day. Returns false if this job already ran today. */
async function lock(job: string, day: string) {
  const db = await admin();
  await db.from("job_runs").delete().eq("job", job).eq("day", day).eq("status", "failed");
  const { error } = await db.from("job_runs").insert({ job, day });
  return !error;
}
async function finish(job: string, day: string, status: string, detail: object) {
  await (await admin()).from("job_runs").update({ status, detail: detail as any, finished_at: new Date().toISOString() }).eq("job", job).eq("day", day);
}

const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);

// ---------------- Daily AI matchup generator ----------------

const candidateSchema = z.object({
  candidates: z.array(
    z.object({
      category: z.enum(AI_CATEGORIES),
      a: z.string(),
      a_emoji: z.string(),
      b: z.string(),
      b_emoji: z.string(),
      description: z.string(),
    }),
  ),
});

export async function runGenerator(opts: { force?: boolean } = {}) {
  if (!config().aiGenerator) return { skipped: "AI_GENERATOR_ENABLED is false" };
  if (await paused("generator")) return { skipped: "paused after AI credit/access error" };
  const day = utcDay();
  if (!opts.force && !(await lock("generator", day))) return { skipped: "already ran today" };
  if (opts.force) await (await admin()).from("job_runs").upsert({ job: "generator", day, status: "running" });
  const db = await admin();
  try {
    const { data: retired } = await db.rpc("retire_idle_ai_matchups", { p_live: liveOnly() });
    const { count } = await db.from("matchups").select("id", { count: "exact", head: true }).eq("source", "ai").eq("status", "active");
    const slots = aiSlots(count ?? 0);
    if (!slots) {
      await finish("generator", day, "done", { retired, created: 0, reason: "cap reached" });
      return { retired, created: [] };
    }
    const { data: existing } = await db.from("sides").select("matchup_id,position,name");
    const byM = new Map<string, string[]>();
    for (const s of existing ?? []) {
      const arr = byM.get(s.matchup_id) ?? [];
      arr[s.position] = s.name;
      byM.set(s.matchup_id, arr);
    }
    const pairs = new Set([...byM.values()].filter((p) => p[0] && p[1]).map((p) => pairKey(p[0]!, p[1]!)));
    const taken = [...byM.values()].map((p) => `${p[0]} vs ${p[1]}`).slice(0, 400);

    const { candidates } = await aiObject(
      "generator",
      candidateSchema,
      GENERATOR_INSTRUCTIONS,
      `Existing matchups:\n${taken.join("\n")}`,
    );

    const created: string[] = [];
    let moderationUnavailable = 0;
    for (const c of candidates) {
      if (created.length >= slots) break;
      const a = c.a.trim().slice(0, 40), b = c.b.trim().slice(0, 40);
      if (!a || !b) continue;
      const key = pairKey(a, b);
      const title = `${a} vs ${b}`;
      const text = `Title: ${title}\nSide A: ${a}\nSide B: ${b}\nDescription: ${c.description.slice(0, 280)}`;
      if (pairs.has(key) || key.split("|")[0] === key.split("|")[1]) {
        await db.from("moderation_log").insert({ subject_type: "ai_matchup", subject_id: null, content: text, verdict: "duplicate", reason: "Matches an existing matchup" });
        continue;
      }
      const v = await moderate("matchup", text);
      // An outage is not a verdict: skip the candidate without writing a "rejected" row to moderation_log.
      if (v.outcome === "unavailable") { moderationUnavailable++; continue; }
      let slug = slugify(title) || "matchup";
      const { data: clash } = await db.from("matchups").select("id").eq("slug", slug).maybeSingle();
      if (clash) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
      await db.from("moderation_log").insert({ subject_type: "ai_matchup", subject_id: slug, content: text, verdict: v.outcome, reason: v.reason });
      if (v.outcome !== "allowed") continue;
      const { data: m, error } = await db
        .from("matchups")
        .insert({ slug, title, description: c.description.slice(0, 280), category: c.category, source: "ai", status: "active" })
        .select("id")
        .single();
      if (error || !m) continue;
      const i = created.length * 2;
      await db.from("sides").insert([
        { matchup_id: m.id, position: 0, name: a, emoji: c.a_emoji.slice(0, 8), color: PALETTE[i % PALETTE.length]! },
        { matchup_id: m.id, position: 1, name: b, emoji: c.b_emoji.slice(0, 8), color: PALETTE[(i + 1) % PALETTE.length]! },
      ]);
      await db.rpc("ensure_open_round", { p_matchup: m.id });
      pairs.add(key);
      created.push(slug);
    }
    await finish("generator", day, "done", { retired, created, ...(moderationUnavailable ? { moderation_unavailable: moderationUnavailable } : {}) });
    return { retired, created, ...(moderationUnavailable ? { moderationUnavailable } : {}) };
  } catch (e) {
    await finish("generator", day, e instanceof JobPaused ? "paused" : "failed", { error: String((e as Error).message) });
    await db.from("events").insert({ kind: "ai_generator_error", detail: { error: String((e as Error).message) } });
    throw e;
  }
}

// ---------------- Daily recap ----------------

export type RecapFacts = {
  day: string;
  total_cents: number;
  pulls: number;
  countries: { country: string; pulls: number; cents: number }[];
  /** Rounds that closed at the end of this day (00:00 UTC), with their final totals. */
  rounds: { title: string; slug: string; a: string; b: string; a_cents: number; b_cents: number; pullers: number; winner: string | null; note: string | null; length?: RoundLength }[];
  /** This day's pulls per matchup, whatever round they belong to (rounds may still be running). Absent on older recaps. */
  activity?: { title: string; slug: string; a: string; b: string; a_cents: number; b_cents: number; pulls: number }[];
};

const usd = (c: number) => `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

/** Deterministic, quotable summary built only from stored facts. */
/** Rounds that closed with a winner and real money, biggest first. */
export const recapChampions = (f: RecapFacts) =>
  f.rounds.filter((r) => r.winner && r.a_cents + r.b_cents > 0).sort((x, y) => y.a_cents + y.b_cents - (x.a_cents + x.b_cents));

/** That day's most-pulled ropes: per-day activity when stored, otherwise (older recaps) the closed rounds. */
export const recapActivity = (f: RecapFacts) =>
  (f.activity ?? f.rounds.map((r) => ({ title: r.title, slug: r.slug, a: r.a, b: r.b, a_cents: r.a_cents, b_cents: r.b_cents, pulls: 0 })))
    .filter((r) => r.a_cents + r.b_cents > 0)
    .sort((x, y) => y.a_cents + y.b_cents - (x.a_cents + x.b_cents));

/**
 * Deterministic, quotable summary built only from stored facts. Published for every day with news (see recapHasNews), whatever the round length:
 * the day's pulls across the site, plus any rounds (weekly or daily) that closed at the end of that day.
 */
export function recapSummary(f: RecapFacts) {
  const date = new Date(`${f.day}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  const active = recapActivity(f);
  const champs = recapChampions(f);
  const parts: string[] = [];
  if (!f.pulls) parts.push(`On ${date} (UTC), there was no activity on Tugg: no pulls were made.`);
  else {
    parts.push(`On ${date} (UTC), Tugg players made ${f.pulls} pull${f.pulls === 1 ? "" : "s"} totalling ${usd(f.total_cents)} across ${active.length} matchup${active.length === 1 ? "" : "s"}.`);
    const big = active[0];
    if (big) parts.push(`The most pulled rope was ${big.title} at ${usd(big.a_cents + big.b_cents)}.`);
  }
  if (f.rounds.length) {
    const kind = f.rounds.every((r) => r.length === "weekly") ? "weekly round" : f.rounds.some((r) => r.length === "weekly") ? "round (weekly and daily)" : "round";
    const n = f.rounds.length;
    const noun = n === 1 ? kind : kind === "round (weekly and daily)" ? "rounds (weekly and daily)" : `${kind}s`;
    if (champs.length) {
      const named = champs.slice(0, 3).map((r) => `${r.winner} won ${r.title} ${usd(Math.max(r.a_cents, r.b_cents))} to ${usd(Math.min(r.a_cents, r.b_cents))}`);
      parts.push(`${n} ${noun} closed at 00:00 UTC: ${named.join("; ")}${champs.length > 3 ? `; and ${champs.length - 3} more` : ""}.`);
    } else parts.push(`${n} ${noun} closed at 00:00 UTC without pulls.`);
  }
  if (f.pulls && f.countries.length) parts.push(`Pulls came from ${f.countries.length} countr${f.countries.length === 1 ? "y" : "ies"}.`);
  return parts.join(" ");
}

/** Recaps are a public, citable record: only live-money pulls count, whatever mode the site is in right now. */
export const RECAP_LIVE_ONLY = true;

export async function collectFacts(day: string): Promise<RecapFacts> {
  const db = await admin();
  const live = RECAP_LIVE_ONLY;
  const from = new Date(`${day}T00:00:00Z`);
  const to = new Date(from.getTime() + 86400000);
  const [{ data: dayAgg }, { data: rounds }, { data: dayM }] = await Promise.all([
    db.rpc("tugg_day_facts", { p_live: live, p_from: from.toISOString(), p_to: to.toISOString() }),
    db
      .from("rounds")
      .select("id,winner_side_id,result_note,round_length,matchups!inner(slug,title,status,sides(id,position,name))")
      .eq("status", "closed")
      .gte("ends_at", to.toISOString())
      .lt("ends_at", new Date(to.getTime() + 3600000).toISOString())
      .in("matchups.status", ["active", "retired"]),
    db.rpc("tugg_day_matchups", { p_live: live, p_from: from.toISOString(), p_to: to.toISOString() }),
  ]);
  const mids = (dayM ?? []).map((d: any) => d.matchup_id as string);
  const { data: dayMeta } = mids.length
    ? await db.from("matchups").select("id,slug,title,sides(position,name)").in("id", mids)
    : { data: [] as any[] };
  const meta = new Map((dayMeta ?? []).map((m: any) => [m.id, m]));
  const ids = (rounds ?? []).map((r) => r.id);
  const { data: tot } = ids.length ? await db.rpc("tugg_round_totals", { p_live: live, p_rounds: ids }) : { data: [] as any[] };
  const tm = new Map((tot ?? []).map((t: any) => [t.round_id, t]));
  const agg: any = dayAgg ?? {};
  return {
    day,
    total_cents: Number(agg.total_cents ?? 0),
    pulls: Number(agg.pulls ?? 0),
    countries: (agg.countries ?? []).map((c: any) => ({ country: c.country, pulls: Number(c.pulls), cents: Number(c.cents) })),
    rounds: (rounds ?? []).map((r: any) => {
      const sides = [...r.matchups.sides].sort((x: any, y: any) => x.position - y.position);
      const t: any = tm.get(r.id);
      const a_cents = Number(t?.total_a_cents ?? 0), b_cents = Number(t?.total_b_cents ?? 0);
      return {
        title: r.matchups.title, slug: r.matchups.slug, a: sides[0]?.name, b: sides[1]?.name, a_cents, b_cents,
        pullers: t?.pullers ?? 0,
        // Name the stored winner only when live money agrees, so a round decided by test pulls is never credited.
        winner: liveWinner(sides, r.winner_side_id, a_cents, b_cents),
        note: r.result_note,
        length: roundLengthOf(r.round_length),
      };
    }),
    activity: (dayM ?? []).flatMap((d: any) => {
      const m: any = meta.get(d.matchup_id);
      if (!m) return [];
      const sides = [...(m.sides ?? [])].sort((x: any, y: any) => x.position - y.position);
      return [{ title: m.title, slug: m.slug, a: sides[0]?.name, b: sides[1]?.name, a_cents: Number(d.a_cents), b_cents: Number(d.b_cents), pulls: Number(d.pulls) }];
    }),
  };
}

function liveWinner(sides: { id: string; position: number; name: string }[], winnerId: string | null, a: number, b: number) {
  if (a + b <= 0 || !winnerId) return null;
  const w = sides.find((s) => s.id === winnerId);
  if (!w) return null;
  const mine = w.position === 0 ? a : b, theirs = w.position === 0 ? b : a;
  return mine >= theirs ? w.name : null;
}

/** A recap is written only when the day has something true to say: a pull, or a round that closed with pulls. */
export const recapHasNews = (f: RecapFacts) => f.pulls > 0 || f.rounds.some((r) => r.a_cents + r.b_cents > 0);

const recapSchema = z.object({ headline: z.string(), paragraphs: z.array(z.string()) });

export async function runRecap(opts: { day?: string; force?: boolean } = {}) {
  const day = opts.day ?? utcDay(new Date(Date.now() - 86400000));
  const db = await admin();
  const end = new Date(new Date(`${day}T00:00:00Z`).getTime() + 86400000);
  if (end > new Date()) return { skipped: "day not finished" };
  const { count: stillOpen } = await db.from("rounds").select("id", { count: "exact", head: true }).eq("status", "open").lt("ends_at", new Date().toISOString());
  if (stillOpen) return { skipped: "rounds still closing" };
  const { data: existing } = await db.from("recaps").select("day").eq("day", day).maybeSingle();
  if (existing && !opts.force) return { skipped: "recap exists" };
  if (!opts.force && !(await lock("recap", day))) return { skipped: "already running" };

  const facts = await collectFacts(day);
  if (!recapHasNews(facts)) {
    // Quiet day: no page, no search-engine ping, but the run is accounted for rather than looking like a failure.
    const detail = { reason: "no_activity", pulls: facts.pulls, closed_rounds: facts.rounds.length, closed_rounds_with_pulls: 0, live_only: true, note: "No live pulls and no round closed with live pulls (test pulls never count); no recap written and no IndexNow ping." };
    await db.from("job_runs").upsert({ job: "recap", day, status: "skipped", detail, finished_at: new Date().toISOString() });
    return { day, skipped: "no activity", detail };
  }
  const summary = recapSummary(facts);
  const champs = recapChampions(facts);
  let body: z.infer<typeof recapSchema> = { headline: facts.pulls ? `Yesterday on Tugg` : `Round winners crowned`, paragraphs: [] };
  if ((facts.pulls || champs.length) && !(await paused("recap"))) {
    const compact = { ...facts, rounds: facts.rounds.filter((r) => r.a_cents + r.b_cents > 0), activity: recapActivity(facts) };
    try {
      body = await aiObject(
        "recap",
        recapSchema,
        "Write a short, lively 'Yesterday on Tugg' recap (2–4 short paragraphs, plain English, a punchy headline). Amounts are in US cents: convert to dollars. 'activity' is that day's pulls per matchup; those rounds may still be running, so never call them won. 'rounds' are rounds that closed at the end of that day ('length' is weekly or daily) with their final totals and winners. Use ONLY names and numbers present in the JSON. Never invent numbers, people, quotes or matchups. Do not mention money being won or paid out — it's bragging rights only.",
        JSON.stringify(compact),
      );
    } catch (e) {
      await db.from("events").insert({ kind: "recap_ai_error", detail: { day, error: String((e as Error).message) } });
    }
  }
  await db.from("recaps").upsert({ day, summary, body: body as any, facts: facts as any });
  await finish("recap", day, "done", { pulls: facts.pulls });
  // Every recap day, whatever the round length: tell search engines about the new dated recap and the pages that changed
  // (only on the public domain with a key).
  const { pingIndexNow } = await import("./indexnow.server");
  const slugs = [...new Set([...facts.rounds, ...(facts.activity ?? [])].map((r) => r.slug))];
  const changed = ["/", "/recap", `/recap/${day}`, "/leaderboards", "/hall-of-fame", "/stats", ...slugs.flatMap((s) => [`/m/${s}`, `/rivalries/${s}`])];
  const indexnow = await pingIndexNow(changed);
  await db.from("events").insert({ kind: "indexnow_ping", detail: { day, ...indexnow } });
  return { day, summary, indexnow };
}

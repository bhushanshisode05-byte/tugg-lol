import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { publicDb, config, slugify } from "./server-utils.server";
import { createStripeClient, getStripeErrorMessage, type StripeEnv } from "./stripe.server";

export type Side = {
  id: string;
  position: number;
  name: string;
  emoji: string;
  color: string;
  all_time_cents: number;
  wins: number;
  current_streak: number;
  best_streak: number;
};
export type Round = {
  id: string;
  ends_at: string;
  starts_at: string;
  total_a_cents: number;
  total_b_cents: number;
  pullers: number;
  extensions: number;
};
export type Matchup = {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  source: string;
  status: string;
  featured_until: string | null;
  created_at: string;
  sides: Side[];
  round: Round | null;
};
export type PullRow = {
  id: string;
  side_id: string;
  matchup_id: string;
  amount_cents: number;
  display_name: string | null;
  shout_out: string | null;
  country: string | null;
  created_at: string;
};

async function loadMatchups(filter?: { slug?: string }) {
  const db = publicDb();
  let q = db
    .from("matchups")
    .select("id,slug,title,description,category,source,status,featured_until,created_at,sides(*)")
    .order("created_at", { ascending: true });
  if (filter?.slug) q = q.eq("slug", filter.slug);
  else q = q.eq("status", "active");
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const ids = (data ?? []).map((m) => m.id);
  const { data: rounds } = ids.length
    ? await db.from("rounds").select("id,matchup_id,ends_at,starts_at,total_a_cents,total_b_cents,pullers,extensions").eq("status", "open").in("matchup_id", ids)
    : { data: [] as any[] };
  const byM = new Map((rounds ?? []).map((r: any) => [r.matchup_id, r]));
  return (data ?? []).map((m: any) => ({
    ...m,
    sides: [...m.sides].sort((a: Side, b: Side) => a.position - b.position),
    round: byM.get(m.id) ?? null,
  })) as Matchup[];
}

const startOfUtcDay = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
};

export const getHome = createServerFn({ method: "GET" }).handler(async () => {
  const db = publicDb();
  const matchups = await loadMatchups();
  const { data: today } = await db.from("pulls").select("amount_cents").gte("created_at", startOfUtcDay()).limit(10000);
  const { data: recent } = await db
    .from("pulls")
    .select("id,side_id,matchup_id,amount_cents,display_name,shout_out,country,created_at")
    .order("created_at", { ascending: false })
    .limit(20);
  return {
    matchups,
    pulledTodayCents: (today ?? []).reduce((s, p) => s + p.amount_cents, 0),
    recent: (recent ?? []) as PullRow[],
    paused: config().pausePulls,
  };
});

export const getMatchup = createServerFn({ method: "GET" })
  .inputValidator((d: { slug: string }) => z.object({ slug: z.string().min(1).max(100) }).parse(d))
  .handler(async ({ data }) => {
    const [m] = await loadMatchups({ slug: data.slug });
    if (!m) return null;
    const db = publicDb();
    const [roundPulls, recent, allPulls, history] = await Promise.all([
      m.round
        ? db.from("pulls").select("side_id,amount_cents,display_name").eq("round_id", m.round.id).limit(5000)
        : Promise.resolve({ data: [] as any[] }),
      db.from("pulls").select("id,side_id,matchup_id,amount_cents,display_name,shout_out,country,created_at").eq("matchup_id", m.id).order("created_at", { ascending: false }).limit(25),
      db.from("pulls").select("country,amount_cents").eq("matchup_id", m.id).limit(10000),
      db.from("rounds").select("id,starts_at,ends_at,total_a_cents,total_b_cents,winner_side_id,result_note").eq("matchup_id", m.id).eq("status", "closed").order("ends_at", { ascending: false }).limit(30),
    ]);
    const top: Record<string, { name: string; cents: number }[]> = {};
    for (const s of m.sides) {
      const agg = new Map<string, number>();
      for (const p of roundPulls.data ?? []) if (p.side_id === s.id) {
        const n = p.display_name || "Anonymous";
        agg.set(n, (agg.get(n) ?? 0) + p.amount_cents);
      }
      top[s.id] = [...agg].map(([name, cents]) => ({ name, cents })).sort((a, b) => b.cents - a.cents).slice(0, 5);
    }
    const cmap = new Map<string, number>();
    for (const p of allPulls.data ?? []) if (p.country) cmap.set(p.country, (cmap.get(p.country) ?? 0) + p.amount_cents);
    return {
      matchup: m,
      top,
      recent: (recent.data ?? []) as PullRow[],
      countries: [...cmap].map(([country, cents]) => ({ country, cents })).sort((a, b) => b.cents - a.cents).slice(0, 10),
      history: history.data ?? [],
      paused: config().pausePulls,
    };
  });

export const getStats = createServerFn({ method: "GET" }).handler(async () => {
  const db = publicDb();
  const [all, today, active, rounds] = await Promise.all([
    db.from("pulls").select("amount_cents,country").limit(100000),
    db.from("pulls").select("id", { count: "exact", head: true }).gte("created_at", startOfUtcDay()),
    db.from("matchups").select("id", { count: "exact", head: true }).eq("status", "active"),
    db.from("rounds").select("id", { count: "exact", head: true }).eq("status", "closed"),
  ]);
  const rows = all.data ?? [];
  return {
    totalCents: rows.reduce((s, r) => s + r.amount_cents, 0),
    totalPulls: rows.length,
    pullsToday: today.count ?? 0,
    activeMatchups: active.count ?? 0,
    countries: new Set(rows.map((r) => r.country).filter(Boolean)).size,
    roundsCompleted: rounds.count ?? 0,
  };
});

type CheckoutResult = { clientSecret: string } | { error: string };
const envSchema = z.enum(["sandbox", "live"]);

export const createPullCheckout = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        sideId: z.string().uuid(),
        amount: z.number().int().min(1).max(1000),
        name: z.string().trim().max(40).optional(),
        shout: z.string().trim().max(80).optional(),
        returnUrl: z.string().url().max(500),
        environment: envSchema,
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<CheckoutResult> => {
    if (config().pausePulls) return { error: "Pulls are paused right now. Please try again later." };
    const db = publicDb();
    const { data: side } = await db.from("sides").select("id,name,matchup_id,matchups(title,status)").eq("id", data.sideId).maybeSingle();
    if (!side || (side as any).matchups?.status !== "active") return { error: "This matchup is not open for pulls." };
    try {
      const stripe = createStripeClient(data.environment as StripeEnv);
      const prices = await stripe.prices.list({ lookup_keys: ["rope_pull_1usd"] });
      const price = prices.data[0];
      if (!price) return { error: "Pull price not found" };
      const session = await stripe.checkout.sessions.create({
        line_items: [{ price: price.id, quantity: data.amount }],
        mode: "payment",
        ui_mode: "embedded_page",
        return_url: data.returnUrl,
        billing_address_collection: "required",
        payment_intent_data: { description: `Tugg pull: ${side.name} in ${(side as any).matchups.title}` },
        metadata: {
          kind: "pull",
          side_id: side.id,
          name: data.name ?? "",
          shout: data.shout ?? "",
          managed_payments: "false",
        },
      });
      return { clientSecret: session.client_secret ?? "" };
    } catch (e) {
      return { error: getStripeErrorMessage(e) };
    }
  });

const sideSchema = z.object({
  name: z.string().trim().min(1).max(40),
  emoji: z.string().trim().max(8).default(""),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export const createMatchupCheckout = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        title: z.string().trim().min(3).max(80),
        description: z.string().trim().max(280).default(""),
        category: z.enum(["Tech", "Brands", "Cities", "Countries", "Sports", "Food", "Entertainment", "Other"]),
        a: sideSchema,
        b: sideSchema,
        tier: z.enum(["standard", "featured"]),
        returnUrl: z.string().url().max(500),
        environment: envSchema,
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<CheckoutResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let slug = slugify(`${data.a.name} vs ${data.b.name}`) || "matchup";
    const { data: existing } = await supabaseAdmin.from("matchups").select("slug,status").eq("slug", slug).maybeSingle();
    if (existing && existing.status !== "pending_payment" && existing.status !== "rejected")
      return { error: "That matchup already exists on Tugg. Go pull on it instead!" };
    if (existing) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    const { data: m, error } = await supabaseAdmin
      .from("matchups")
      .insert({ slug, title: data.title, description: data.description, category: data.category, source: "user", status: "pending_payment" })
      .select("id")
      .single();
    if (error || !m) return { error: "Could not create matchup" };
    await supabaseAdmin.from("sides").insert([
      { matchup_id: m.id, position: 0, ...data.a },
      { matchup_id: m.id, position: 1, ...data.b },
    ]);
    try {
      const stripe = createStripeClient(data.environment as StripeEnv);
      const lookup = data.tier === "featured" ? "matchup_featured_once" : "matchup_standard_once";
      const prices = await stripe.prices.list({ lookup_keys: [lookup] });
      const price = prices.data[0];
      if (!price) return { error: "Price not found" };
      const session = await stripe.checkout.sessions.create({
        line_items: [{ price: price.id, quantity: 1 }],
        mode: "payment",
        ui_mode: "embedded_page",
        return_url: data.returnUrl,
        billing_address_collection: "required",
        payment_intent_data: { description: `Tugg matchup (${data.tier}): ${data.title}` },
        metadata: { kind: "matchup", matchup_id: m.id, tier: data.tier, managed_payments: "false" },
      });
      await supabaseAdmin.from("creators").insert({
        matchup_id: m.id,
        tier: data.tier,
        stripe_session_id: session.id,
        environment: data.environment,
      });
      return { clientSecret: session.client_secret ?? "" };
    } catch (e) {
      return { error: getStripeErrorMessage(e) };
    }
  });

export const getCreationStatus = createServerFn({ method: "GET" })
  .inputValidator((d: { sessionId: string }) => z.object({ sessionId: z.string().min(5).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: c } = await supabaseAdmin.from("creators").select("refunded,matchups(slug,status,title)").eq("stripe_session_id", data.sessionId).maybeSingle();
    if (!c) return null;
    const m = (c as any).matchups;
    const { data: log } = await supabaseAdmin.from("moderation_log").select("reason,verdict").eq("subject_type", "matchup").eq("subject_id", data.sessionId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    return { slug: m?.slug as string, status: m?.status as string, title: m?.title as string, refunded: c.refunded, reason: log?.reason ?? null };
  });

// ---------- Leaderboards / Hall of Fame / Results ----------

type Lite = { slug: string; title: string; status: string; sides: Side[] };
async function matchupMap() {
  const { data } = await publicDb()
    .from("matchups")
    .select("id,slug,title,status,sides(*)")
    .in("status", ["active", "retired"]);
  return new Map(
    (data ?? []).map((m: any) => [m.id, { slug: m.slug, title: m.title, status: m.status, sides: [...m.sides].sort((a: Side, b: Side) => a.position - b.position) } as Lite]),
  );
}

export const getLeaderboards = createServerFn({ method: "GET" }).handler(async () => {
  const db = publicDb();
  const mm = await matchupMap();
  const ids = [...mm.keys()];
  const [rounds, sides, pulls] = await Promise.all([
    ids.length
      ? db.from("rounds").select("id,matchup_id,status,ends_at,total_a_cents,total_b_cents,pullers").in("matchup_id", ids).or("total_a_cents.gt.0,total_b_cents.gt.0").limit(5000)
      : Promise.resolve({ data: [] as any[] }),
    ids.length
      ? db.from("sides").select("id,matchup_id,name,emoji,best_streak,current_streak,wins").in("matchup_id", ids).gt("best_streak", 0).order("best_streak", { ascending: false }).limit(20)
      : Promise.resolve({ data: [] as any[] }),
    db.from("pulls").select("country,amount_cents").not("country", "is", null).limit(100000),
  ]);
  const withM = (r: any) => {
    const m = mm.get(r.matchup_id)!;
    return { id: r.id as string, slug: m.slug, title: m.title, a: m.sides[0]!, b: m.sides[1]!, total_a: Number(r.total_a_cents), total_b: Number(r.total_b_cents), pullers: r.pullers as number, ends_at: r.ends_at as string, open: r.status === "open" };
  };
  const all = (rounds.data ?? []).filter((r: any) => mm.has(r.matchup_id)).map(withM);
  const sum = (r: { total_a: number; total_b: number }) => r.total_a + r.total_b;
  const cmap = new Map<string, { cents: number; pulls: number }>();
  for (const p of pulls.data ?? []) {
    const c = cmap.get(p.country!) ?? { cents: 0, pulls: 0 };
    c.cents += p.amount_cents; c.pulls += 1; cmap.set(p.country!, c);
  }
  return {
    biggest: [...all].sort((x, y) => sum(y) - sum(x)).slice(0, 15),
    today: all.filter((r) => r.open).sort((x, y) => sum(y) - sum(x)).slice(0, 15),
    streaks: (sides.data ?? []).filter((s: any) => mm.has(s.matchup_id)).map((s: any) => {
      const m = mm.get(s.matchup_id)!;
      return { id: s.id as string, name: s.name as string, emoji: s.emoji as string, best: s.best_streak as number, current: s.current_streak as number, wins: s.wins as number, slug: m.slug, title: m.title };
    }),
    countries: [...cmap].map(([country, v]) => ({ country, ...v })).sort((a, b) => b.cents - a.cents).slice(0, 20),
  };
});

export type ResultCard = {
  id: string; slug: string; title: string; ends_at: string; note: string | null;
  winner: Side; loser: Side; winner_cents: number; loser_cents: number; pullers: number;
};

function toCard(r: any, mm: Map<string, Lite>): ResultCard | null {
  const m = mm.get(r.matchup_id);
  if (!m || !r.winner_side_id) return null;
  const [a, b] = m.sides;
  if (!a || !b) return null;
  const aWon = r.winner_side_id === a.id;
  return {
    id: r.id, slug: m.slug, title: m.title, ends_at: r.ends_at, note: r.result_note,
    winner: aWon ? a : b, loser: aWon ? b : a,
    winner_cents: Number(aWon ? r.total_a_cents : r.total_b_cents),
    loser_cents: Number(aWon ? r.total_b_cents : r.total_a_cents),
    pullers: r.pullers,
  };
}

export const getHallOfFame = createServerFn({ method: "GET" }).handler(async () => {
  const mm = await matchupMap();
  const ids = [...mm.keys()];
  if (!ids.length) return { cards: [] as ResultCard[] };
  const { data } = await publicDb()
    .from("rounds")
    .select("id,matchup_id,ends_at,total_a_cents,total_b_cents,pullers,winner_side_id,result_note")
    .eq("status", "closed").not("winner_side_id", "is", null).in("matchup_id", ids)
    .order("ends_at", { ascending: false }).limit(60);
  return { cards: (data ?? []).map((r) => toCard(r, mm)).filter((c): c is ResultCard => !!c) };
});

export const getResult = createServerFn({ method: "GET" })
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: r } = await publicDb()
      .from("rounds")
      .select("id,matchup_id,ends_at,total_a_cents,total_b_cents,pullers,winner_side_id,result_note")
      .eq("id", data.id).eq("status", "closed").maybeSingle();
    if (!r) return null;
    return toCard(r, await matchupMap());
  });

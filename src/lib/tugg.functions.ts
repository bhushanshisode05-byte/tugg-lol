import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { publicDb, config, slugify, liveOnly, resolvePaymentsEnv } from "./server-utils.server";
import { selectedProvider, selectedProduct, paymentReadiness } from "./payments/selection.server";
import { billingSchema } from "./payments/billing";
import { PRODUCTS } from "./payments/catalog";
import { TURNSTILE_ACTIONS, turnstileTokenSchema } from "./turnstile";
import { SIDE_IMAGES_ENABLED } from "./feature-flags";

/** Verifies Turnstile server-side before any side effect; returns a user-facing error or null. */
async function turnstileGate(
  token: string | undefined,
  action: (typeof TURNSTILE_ACTIONS)[keyof typeof TURNSTILE_ACTIONS],
) {
  const { verifyTurnstileForRequest, TurnstileError } = await import("./turnstile.server");
  try {
    await verifyTurnstileForRequest(token, action);
    return null;
  } catch (e) {
    return {
      error:
        e instanceof TurnstileError ? e.message : "The security check failed. Please try again.",
    };
  }
}

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
  image_id?: string | null;
  image_status?: string | null;
  image_report_count?: number | null;
  image_preview?: string | undefined;
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
    ? await db
        .from("rounds")
        .select("id,matchup_id,ends_at,starts_at,total_a_cents,total_b_cents,pullers,extensions")
        .eq("status", "open")
        .in("matchup_id", ids)
    : { data: [] as any[] };
  const live = liveOnly();
  const [rt, st] = await Promise.all([
    rounds?.length
      ? db.rpc("tugg_round_totals", { p_live: live, p_rounds: rounds.map((r: any) => r.id) })
      : Promise.resolve({ data: [] as any[] }),
    ids.length
      ? db.rpc("tugg_side_totals", { p_live: live, p_matchups: ids })
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const rtot = new Map((rt.data ?? []).map((t: any) => [t.round_id, t]));
  const stot = new Map((st.data ?? []).map((t: any) => [t.side_id, Number(t.cents)]));
  const byM = new Map(
    (rounds ?? []).map((r: any) => {
      const t: any = rtot.get(r.id);
      return [
        r.matchup_id,
        {
          ...r,
          total_a_cents: Number(t?.total_a_cents ?? 0),
          total_b_cents: Number(t?.total_b_cents ?? 0),
          pullers: t?.pullers ?? 0,
        },
      ];
    }),
  );
  return (data ?? []).map((m: any) => ({
    ...m,
    sides: [...m.sides]
      .map((s: Side) => ({ ...s, all_time_cents: stot.get(s.id) ?? 0 }))
      .sort((a: Side, b: Side) => a.position - b.position),
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
  const live = liveOnly();
  const [matchups, stats, recent] = await Promise.all([
    loadMatchups(),
    db.rpc("tugg_stats", { p_live: live }),
    db.rpc("tugg_recent_pulls", { p_live: live, p_limit: 20 }),
  ]);
  return {
    matchups,
    pulledTodayCents: Number(stats.data?.[0]?.today_cents ?? 0),
    recent: (recent.data ?? []) as PullRow[],
    paused: config().pausePulls,
    siteUrl: config().siteUrl,
  };
});

export const getMatchup = createServerFn({ method: "GET" })
  .inputValidator((d: { slug: string }) => z.object({ slug: z.string().min(1).max(100) }).parse(d))
  .handler(async ({ data }) => {
    const [m] = await loadMatchups({ slug: data.slug });
    if (!m) return null;
    const db = publicDb();
    const live = liveOnly();
    const [topRows, recent, countries, history] = await Promise.all([
      m.round
        ? db.rpc("tugg_top_pullers", { p_live: live, p_round: m.round.id, p_limit: 5 })
        : Promise.resolve({ data: [] as any[] }),
      db.rpc("tugg_recent_pulls", { p_live: live, p_matchup: m.id, p_limit: 25 }),
      db.rpc("tugg_countries", { p_live: live, p_matchup: m.id, p_limit: 10 }),
      db
        .from("rounds")
        .select("id,starts_at,ends_at,total_a_cents,total_b_cents,winner_side_id,result_note")
        .eq("matchup_id", m.id)
        .eq("status", "closed")
        .order("ends_at", { ascending: false })
        .limit(30),
    ]);
    const top: Record<string, { name: string; cents: number }[]> = {};
    for (const s of m.sides) top[s.id] = [];
    for (const r of topRows.data ?? [])
      top[r.side_id]?.push({ name: r.name, cents: Number(r.cents) });
    const hist = history.data ?? [];
    const ht = hist.length
      ? ((await db.rpc("tugg_round_totals", { p_live: live, p_rounds: hist.map((h) => h.id) }))
          .data ?? [])
      : [];
    const hmap = new Map(ht.map((t: any) => [t.round_id, t]));
    const historyOut = hist.map((h) => {
      const t: any = hmap.get(h.id);
      return {
        ...h,
        total_a_cents: Number(t?.total_a_cents ?? 0),
        total_b_cents: Number(t?.total_b_cents ?? 0),
      };
    });
    return {
      matchup: m,
      top,
      recent: (recent.data ?? []) as PullRow[],
      countries: (countries.data ?? []).map((c: any) => ({
        country: c.country as string,
        cents: Number(c.cents),
      })),
      history: historyOut,
      paused: config().pausePulls,
      siteUrl: config().siteUrl,
    };
  });

export const getStats = createServerFn({ method: "GET" }).handler(async () => {
  const db = publicDb();
  const [st, active, rounds] = await Promise.all([
    db.rpc("tugg_stats", { p_live: liveOnly() }),
    db.from("matchups").select("id", { count: "exact", head: true }).eq("status", "active"),
    db.from("rounds").select("id", { count: "exact", head: true }).eq("status", "closed"),
  ]);
  const r = st.data?.[0];
  return {
    totalCents: Number(r?.total_cents ?? 0),
    totalPulls: Number(r?.total_pulls ?? 0),
    pullsToday: Number(r?.pulls_today ?? 0),
    activeMatchups: active.count ?? 0,
    countries: Number(r?.countries ?? 0),
    roundsCompleted: rounds.count ?? 0,
  };
});

type CheckoutResult = { url: string; orderId?: string; environment?: "sandbox" | "live" } | { error: string };
const envSchema = z.enum(["sandbox", "live"]).optional();
const serverEnv = (hint?: "sandbox" | "live") => resolvePaymentsEnv(config().paymentsEnv, hint);

const sideSchema = z.object({
  name: z.string().trim().min(1).max(40),
  emoji: z.string().trim().max(8).default(""),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  imageId: z.string().uuid().optional(),
});

export const MATCHUP_CHECKOUTS_PER_HOUR = 5;

export const createMatchupCheckout = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        title: z.string().trim().min(3).max(80),
        description: z.string().trim().max(280).default(""),
        category: z.enum([
          "Tech",
          "Brands",
          "Cities",
          "Countries",
          "Sports",
          "Food",
          "Entertainment",
          "Other",
        ]),
        a: sideSchema,
        b: sideSchema,
        tier: z.enum(["standard", "featured"]),
        billing: billingSchema.optional(),
        returnUrl: z.string().url().max(500),
        environment: envSchema,
        turnstileToken: turnstileTokenSchema,
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<CheckoutResult> => {
    const se = serverEnv(data.environment);
    if ("error" in se) return se;
    if (config().pausePulls) return { error: "Pulls are paused right now. Please try again later." };
    let provider: ReturnType<typeof selectedProvider>;
    let product: string;
    try {
      paymentReadiness();
      if (config().paymentProvider === "payglocal" && !data.billing) return { error: "Billing details are required for digital purchases." };
      provider = selectedProvider(); product = selectedProduct(data.tier);
      await provider.validateProduct(product, PRODUCTS[data.tier].cents);
    } catch (e) { return { error: e instanceof Error ? e.message : "Checkout is unavailable." }; }
    const { getRequest } = await import("@tanstack/react-start/server");
    if (new URL(data.returnUrl).origin !== new URL(getRequest().url).origin) return { error: "Invalid return address." };
    const ts = await turnstileGate(data.turnstileToken, TURNSTILE_ACTIONS.matchup);
    if (ts) return ts;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getRequestIP } = await import("@tanstack/react-start/server");
    const ip = getRequestIP({ xForwardedFor: true }) || "unknown";
    const ipHash = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip))),
    )
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const { data: allowed, error: rlErr } = await supabaseAdmin.rpc("take_checkout_slot", {
      p_ip: ipHash,
      p_max: MATCHUP_CHECKOUTS_PER_HOUR,
      p_window_minutes: 60,
    });
    if (rlErr) return { error: "Could not start checkout. Please try again." };
    if (!allowed)
      return {
        error: "Too many matchup checkouts from your network. Please try again in an hour.",
      };
    let slug = slugify(`${data.a.name} vs ${data.b.name}`) || "matchup";
    const { data: existing } = await supabaseAdmin
      .from("matchups")
      .select("slug,status")
      .eq("slug", slug)
      .maybeSingle();
    if (existing && existing.status !== "pending_payment" && existing.status !== "rejected")
      return { error: "That matchup already exists on Tugg. Go pull on it instead!" };
    if (existing) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    const { data: m, error } = await supabaseAdmin
      .from("matchups")
      .insert({
        slug,
        title: data.title,
        description: data.description,
        category: data.category,
        source: "user",
        status: "pending_payment",
      })
      .select("id")
      .single();
    if (error || !m) return { error: "Could not create matchup" };
    await supabaseAdmin.from("sides").insert([
      {
        matchup_id: m.id,
        position: 0,
        name: data.a.name,
        emoji: data.a.emoji,
        color: data.a.color,
      },
      {
        matchup_id: m.id,
        position: 1,
        name: data.b.name,
        emoji: data.b.emoji,
        color: data.b.color,
      },
    ]);
    if (SIDE_IMAGES_ENABLED && (data.a.imageId || data.b.imageId)) {
      const { imageIpHash } = await import("./side-images.server");
      const { getRequest } = await import("@tanstack/react-start/server");
      const attached = await supabaseAdmin.rpc("attach_side_images", {
        p_matchup: m.id,
        p_a: data.a.imageId ?? "00000000-0000-0000-0000-000000000000",
        p_b: data.b.imageId ?? "00000000-0000-0000-0000-000000000000",
        p_ip: await imageIpHash(getRequest()),
      });
      if (attached.error || !attached.data)
        return { error: "Picture expired or already used. Add it again before checkout." };
    }
    try {
      if (config().paymentProvider === "payglocal") {
        const id = crypto.randomUUID(), returnUrl = new URL(data.returnUrl);
        returnUrl.searchParams.set("session_id", id);
        const order = await supabaseAdmin.from("payglocal_orders").insert({
          id, environment: se.env, kind: data.tier, expected_cents: PRODUCTS[data.tier].cents,
          merchant_unique_id: `${se.env === "live" ? "L" : "S"}${id.replaceAll("-", "")}`,
          matchup_id: m.id, buyer_email: data.billing?.emailId || null, billing_country: data.billing?.addressCountry || "", return_path: returnUrl.pathname + returnUrl.search,
        }).select("id").single();
        if (order.error) throw new Error("Could not start checkout.");
        const creator = await supabaseAdmin.from("creators").insert({ matchup_id: m.id, tier: data.tier, payglocal_order_id: id, environment: se.env });
        if (creator.error) throw new Error("Could not start checkout.");
        const session = await provider.checkout({ productId: product, orderId: id, returnUrl: returnUrl.toString(), cents: PRODUCTS[data.tier].cents, ...(data.billing ? { billing: data.billing } : {}) });
        const saved = await supabaseAdmin.from("payglocal_orders").update({ gid: session.sessionId, status_url: session.statusUrl || null }).eq("id", id).is("gid", null);
        if (saved.error) throw new Error("Payment confirmation pending. Please do not pay again.");
        return { url: session.url };
      }
      const order = await supabaseAdmin.from("dodo_orders").insert({
        environment: se.env, kind: data.tier, product_id: product,
        expected_cents: PRODUCTS[data.tier].cents, matchup_id: m.id,
      }).select("id").single();
      if (order.error || !order.data) throw new Error("Could not start checkout.");
      const returnUrl = new URL(data.returnUrl);
      returnUrl.searchParams.set("session_id", order.data.id);
      const session = await provider.checkout({ productId: product, orderId: order.data.id, returnUrl: returnUrl.toString() });
      const saved = await supabaseAdmin.from("dodo_orders").update({ checkout_id: session.sessionId }).eq("id", order.data.id);
      if (saved.error) throw new Error("Could not start checkout.");
      const creator = await supabaseAdmin.from("creators").insert({ matchup_id: m.id, tier: data.tier, dodo_order_id: order.data.id, environment: se.env });
      if (creator.error) throw new Error("Could not start checkout.");
      return { url: session.url, orderId: order.data.id, environment: se.env };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Checkout is unavailable." };
    }
  });

export const getCreationStatus = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ sessionId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (config().paymentProvider === "payglocal") {
      const result = await supabaseAdmin.from("payglocal_orders").select("status,refund_status,review_reason,matchups(slug,status,title)").eq("id", data.sessionId).eq("environment", config().paymentsEnv).maybeSingle();
      const o=result.data; if (!o?.matchups) return null;
      return { slug:o.matchups.slug,status:o.matchups.status,title:o.matchups.title,refunded:o.refund_status === "succeeded",reason:o.review_reason,paymentStatus:o.status };
    }
    const result = await supabaseAdmin.from("dodo_orders").select("status,refund_status,review_reason,matchups(slug,status,title)").eq("id", data.sessionId).eq("environment", config().paymentsEnv).maybeSingle();
    const o = result.data; if (!o || !o.matchups) return null;
    return { slug: o.matchups.slug, status: o.matchups.status, title: o.matchups.title, refunded: o.refund_status === "succeeded", reason: o.review_reason, paymentStatus: o.status };
  });

// ---------- Leaderboards / Hall of Fame / Results ----------

type Lite = { slug: string; title: string; status: string; sides: Side[] };
async function matchupMap() {
  const { data } = await publicDb()
    .from("matchups")
    .select("id,slug,title,status,sides(*)")
    .in("status", ["active", "retired"]);
  return new Map(
    (data ?? []).map((m: any) => [
      m.id,
      {
        slug: m.slug,
        title: m.title,
        status: m.status,
        sides: [...m.sides].sort((a: Side, b: Side) => a.position - b.position),
      } as Lite,
    ]),
  );
}

export const getLeaderboards = createServerFn({ method: "GET" }).handler(async () => {
  const db = publicDb();
  const mm = await matchupMap();
  const ids = [...mm.keys()];
  const live = liveOnly();
  const [biggest, today, sides, countries] = await Promise.all([
    db.rpc("tugg_round_leaders", { p_live: live, p_open_only: false, p_limit: 15 }),
    db.rpc("tugg_round_leaders", { p_live: live, p_open_only: true, p_limit: 15 }),
    ids.length
      ? db
          .from("sides")
          .select(
            "id,matchup_id,name,emoji,color,image_id,image_status,image_report_count,best_streak,current_streak,wins",
          )
          .in("matchup_id", ids)
          .gt("best_streak", 0)
          .order("best_streak", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] as any[] }),
    db.rpc("tugg_countries", { p_live: live, p_limit: 20 }),
  ]);
  const withM = (r: any) => {
    const m = mm.get(r.matchup_id)!;
    return {
      id: r.round_id as string,
      slug: m.slug,
      title: m.title,
      a: m.sides[0]!,
      b: m.sides[1]!,
      total_a: Number(r.total_a_cents),
      total_b: Number(r.total_b_cents),
      pullers: r.pullers as number,
      ends_at: r.ends_at as string,
      open: r.status === "open",
    };
  };
  const list = (d: any[] | null) => (d ?? []).filter((r: any) => mm.has(r.matchup_id)).map(withM);
  return {
    biggest: list(biggest.data),
    today: list(today.data),
    streaks: (sides.data ?? [])
      .filter((s: any) => mm.has(s.matchup_id))
      .map((s: any) => {
        const m = mm.get(s.matchup_id)!;
        return {
          id: s.id as string,
          name: s.name as string,
          emoji: s.emoji as string,
          color: s.color as string,
          image_id: s.image_id as string | null,
          image_status: s.image_status as string | null,
          best: s.best_streak as number,
          current: s.current_streak as number,
          wins: s.wins as number,
          slug: m.slug,
          title: m.title,
        };
      }),
    countries: (countries.data ?? []).map((c: any) => ({
      country: c.country as string,
      cents: Number(c.cents),
      pulls: Number(c.pulls),
    })),
  };
});

export type ResultCard = {
  id: string;
  slug: string;
  title: string;
  ends_at: string;
  note: string | null;
  winner: Side;
  loser: Side;
  winner_cents: number;
  loser_cents: number;
  pullers: number;
};

function toCard(r: any, mm: Map<string, Lite>): ResultCard | null {
  const m = mm.get(r.matchup_id);
  if (!m || !r.winner_side_id) return null;
  const [a, b] = m.sides;
  if (!a || !b) return null;
  const aWon = r.winner_side_id === a.id;
  return {
    id: r.id,
    slug: m.slug,
    title: m.title,
    ends_at: r.ends_at,
    note: r.result_note,
    winner: aWon ? a : b,
    loser: aWon ? b : a,
    winner_cents: Number(aWon ? r.total_a_cents : r.total_b_cents),
    loser_cents: Number(aWon ? r.total_b_cents : r.total_a_cents),
    pullers: r.pullers,
  };
}

async function withLiveTotals<T extends { id: string }>(rows: T[]) {
  if (!rows.length) return rows;
  const { data } = await publicDb().rpc("tugg_round_totals", {
    p_live: liveOnly(),
    p_rounds: rows.map((r) => r.id),
  });
  const m = new Map((data ?? []).map((t: any) => [t.round_id, t]));
  return rows.map((r) => {
    const t: any = m.get(r.id);
    return {
      ...r,
      total_a_cents: Number(t?.total_a_cents ?? 0),
      total_b_cents: Number(t?.total_b_cents ?? 0),
      pullers: t?.pullers ?? 0,
    };
  });
}

export const getHallOfFame = createServerFn({ method: "GET" }).handler(async () => {
  const mm = await matchupMap();
  const ids = [...mm.keys()];
  if (!ids.length) return { cards: [] as ResultCard[] };
  const { data } = await publicDb()
    .from("rounds")
    .select("id,matchup_id,ends_at,total_a_cents,total_b_cents,pullers,winner_side_id,result_note")
    .eq("status", "closed")
    .not("winner_side_id", "is", null)
    .in("matchup_id", ids)
    .order("ends_at", { ascending: false })
    .limit(60);
  return {
    cards: (await withLiveTotals(data ?? []))
      .map((r) => toCard(r, mm))
      .filter((c): c is ResultCard => !!c),
  };
});

export const getResult = createServerFn({ method: "GET" })
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: r } = await publicDb()
      .from("rounds")
      .select(
        "id,matchup_id,ends_at,total_a_cents,total_b_cents,pullers,winner_side_id,result_note",
      )
      .eq("id", data.id)
      .eq("status", "closed")
      .maybeSingle();
    if (!r) return null;
    const [rr] = await withLiveTotals([r]);
    return toCard(rr, await matchupMap());
  });

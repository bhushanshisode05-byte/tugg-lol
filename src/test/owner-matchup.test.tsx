// Owner matchup creation: owner-only, moderation binding, no duplicates, no order and no revenue.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";

type Row = Record<string, any>;
const state = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  writes: [] as { table: string; op: string }[],
  touched: new Set<string>(),
  fail: {} as Record<string, boolean>,
  user: null as null | { id: string; email: string; email_confirmed_at: string | null },
  role: true,
  verdict: { allowed: true, reason: "Fun food rivalry" },
  moderate: vi.fn(),
  rpc: [] as { name: string; args: any }[],
  seq: 0,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, className }: { children: React.ReactNode; className?: string }) => <a className={className}>{children}</a>,
}));
vi.mock("@/components/tugg/SideAvatar", () => ({ SideAvatar: () => null }));
vi.mock("@/lib/server-utils.server", async () => {
  const slugify = (s: string) =>
    s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 70);
  return {
    slugify,
    config: () => ({ ownerEmail: "owner@example.com", aiGenerator: false }),
    liveOnly: () => false,
    moderate: (...args: any[]) => { state.moderate(...args); return Promise.resolve(state.verdict); },
    publicDb: () => ({
      auth: { getUser: async () => (state.user ? { data: { user: state.user }, error: null } : { data: { user: null }, error: new Error("bad token") }) },
    }),
  };
});

const cascade = (matchupId: string) => {
  for (const t of ["sides", "rounds", "creators"]) state.tables[t] = (state.tables[t] ?? []).filter((r) => r["matchup_id"] !== matchupId);
};
function from(table: string) {
  state.touched.add(table);
  let op = "select";
  let payload: Row[] = [];
  const filters: [string, unknown][] = [];
  let range: [number, number] | null = null;
  const run = async (): Promise<{ data: Row[] | null; error: any }> => {
    const rows = (state.tables[table] ??= []);
    if (op === "insert") {
      state.writes.push({ table, op });
      if (state.fail[table]) return { data: null, error: { message: "fail" } };
      if (table === "matchups" && payload.some((p) => rows.some((r) => r["slug"] === p["slug"]))) return { data: null, error: { code: "23505" } };
      const made = payload.map((p) => ({ id: `${table}-${++state.seq}`, ...p }));
      rows.push(...made);
      return { data: made, error: null };
    }
    const match = rows.filter((r) => filters.every(([c, v]) => r[c] === v));
    if (op === "delete") {
      state.writes.push({ table, op });
      state.tables[table] = rows.filter((r) => !match.includes(r));
      if (table === "matchups") match.forEach((r) => cascade(r["id"]));
      return { data: null, error: null };
    }
    return { data: range ? match.slice(range[0], range[1] + 1) : match, error: null };
  };
  const b: any = {
    select: () => b,
    order: () => b,
    eq: (c: string, v: unknown) => (filters.push([c, v]), b),
    range: (f: number, t: number) => ((range = [f, t]), b),
    insert: (rows: Row | Row[]) => ((op = "insert"), (payload = Array.isArray(rows) ? rows : [rows]), b),
    delete: () => ((op = "delete"), b),
    maybeSingle: () => run().then((r) => ({ data: r.data?.[0] ?? null, error: r.error })),
    single: () => run().then((r) => ({ data: r.data?.[0] ?? null, error: r.error })),
    then: (res: any, rej: any) => run().then(res, rej),
  };
  return b;
}
// Mirrors tugg_creation_revenue: paid creator records on public matchups, at published prices, never owner matchups.
// The real function is checked against a disposable database in src/test/owner-matchup.sql.
function creationRevenue() {
  const out: Record<string, number> = {};
  for (const c of state.tables["creators"] ?? []) {
    const m = (state.tables["matchups"] ?? []).find((x) => x["id"] === c["matchup_id"]);
    if (c["refunded"] || !m || !["active", "retired"].includes(m["status"]) || m["source"] === "owner") continue;
    out[c["environment"]] = (out[c["environment"]] ?? 0) + (c["tier"] === "featured" ? 2900 : 900);
  }
  return out;
}
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (t: string) => from(t),
    rpc: async (name: string, args: any) => {
      state.rpc.push({ name, args });
      if (name === "claim_tugg_owner") return { data: state.role, error: null };
      if (name === "tugg_creation_revenue") return { data: creationRevenue(), error: null };
      if (name === "ensure_open_round") {
        if (state.fail["rounds"]) return { data: null, error: { message: "fail" } };
        state.writes.push({ table: "rounds", op: "insert" });
        (state.tables["rounds"] ??= []).push({ id: `round-${++state.seq}`, matchup_id: args.p_matchup, status: "open" });
        return { data: `round-${state.seq}`, error: null };
      }
      return { data: null, error: { message: `unexpected rpc ${name}` } };
    },
  },
}));

import { createOwnerMatchup } from "@/lib/owner-matchups.server";
import { PALETTE } from "@/lib/jobs.server";
import { MatchupKicker } from "@/components/tugg/MatchupKicker";
import { TrendingRopeCard } from "@/components/tugg/HomeRopes";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const OWNER = { id: "owner-id", email: "owner@example.com", email_confirmed_at: "2026-11-03T00:00:00Z" };
const valid = { title: "Tacos vs Sushi", a: "Tacos", aEmoji: "🌮", b: "Sushi", bEmoji: "🍣", category: "Food", description: "Which one wins dinner?" };
const post = (body: unknown, token: string | null = "owner-token") =>
  createOwnerMatchup(new Request("https://tugg.lol/api/public/admin/matchups", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  }));
const rows = (t: string) => state.tables[t] ?? [];
const ORDER_TABLES = ["dodo_orders", "payglocal_orders", "dodo_basket_lines", "dodo_bundle_applications", "payglocal_ledger", "creators", "pulls", "pull_wallets", "pull_wallet_ledger"];

beforeEach(() => {
  state.seq = 0;
  state.writes = [];
  state.touched = new Set();
  state.fail = {};
  state.rpc = [];
  state.user = OWNER;
  state.role = true;
  state.verdict = { allowed: true, reason: "Fun food rivalry" };
  state.moderate.mockReset();
  state.tables = {
    matchups: [
      { id: "m-paid", slug: "pizza-vs-burgers", title: "Pizza vs Burgers", description: "", category: "Food", source: "user", status: "active" },
    ],
    sides: [
      { id: "s1", matchup_id: "m-paid", position: 0, name: "Pizza", emoji: "🍕", color: "#ff3b30" },
      { id: "s2", matchup_id: "m-paid", position: 1, name: "Burgers", emoji: "🍔", color: "#0a84ff" },
    ],
    rounds: [{ id: "r-paid", matchup_id: "m-paid", status: "open" }],
    creators: [{ id: "c1", matchup_id: "m-paid", tier: "standard", environment: "sandbox", refunded: false }],
    moderation_log: [],
    dodo_orders: [],
    payglocal_orders: [],
  };
});
afterEach(() => cleanup());

describe("only the owner can create", () => {
  it.each([
    ["no token", null, null, true, 401],
    ["invalid token", null, "bad", true, 401],
    ["another account", { ...OWNER, email: "visitor@example.com" }, "t", true, 403],
    ["unconfirmed owner address", { ...OWNER, email_confirmed_at: null }, "t", true, 403],
    ["owner address without the unique owner role", OWNER, "t", false, 403],
  ] as const)("%s is refused and nothing is created", async (_, user, token, role, status) => {
    state.user = user as any;
    state.role = role;
    const res = await post(valid, token);
    expect(res.status).toBe(status);
    expect(state.writes).toEqual([]);
    expect(state.moderate).not.toHaveBeenCalled();
    expect(rows("matchups")).toHaveLength(1);
    expect([...state.touched]).toEqual([]);
  });
});

describe("a valid owner submission", () => {
  it("creates the matchup, both sides and an open round, with source owner", async () => {
    const res = await post(valid);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ created: true, slug: "tacos-vs-sushi", title: "Tacos vs Sushi" });
    const m = rows("matchups").find((r) => r["slug"] === "tacos-vs-sushi")!;
    expect(m).toMatchObject({ title: "Tacos vs Sushi", description: "Which one wins dinner?", category: "Food", source: "owner", status: "active" });
    const sides = rows("sides").filter((s) => s["matchup_id"] === m["id"]).sort((x, y) => x["position"] - y["position"]);
    expect(sides.map((s) => [s["position"], s["name"], s["emoji"]])).toEqual([[0, "Tacos", "🌮"], [1, "Sushi", "🍣"]]);
    expect(PALETTE).toContain(sides[0]!["color"]);
    expect(PALETTE).toContain(sides[1]!["color"]);
    expect(sides[0]!["color"]).not.toBe(sides[1]!["color"]);
    expect(rows("rounds").filter((r) => r["matchup_id"] === m["id"])).toEqual([expect.objectContaining({ status: "open" })]);
    expect(state.rpc).toContainEqual({ name: "ensure_open_round", args: { p_matchup: m["id"] } });
  });
  it("runs binding moderation on the generator's composed text and logs the verdict", async () => {
    await post(valid);
    expect(state.moderate).toHaveBeenCalledWith("matchup", "Title: Tacos vs Sushi\nSide A: Tacos\nSide B: Sushi\nDescription: Which one wins dinner?");
    expect(rows("moderation_log")).toEqual([
      expect.objectContaining({ subject_type: "owner_matchup", subject_id: "tacos-vs-sushi", verdict: "allowed", reason: "Fun food rivalry" }),
    ]);
  });
  it("writes no order, payment or fee record in either provider's tables", async () => {
    expect((await post(valid)).status).toBe(201);
    expect(new Set(state.writes.map((w) => w.table))).toEqual(new Set(["moderation_log", "matchups", "sides", "rounds"]));
    for (const t of ORDER_TABLES) expect(state.touched.has(t)).toBe(false);
    expect(rows("dodo_orders")).toEqual([]);
    expect(rows("payglocal_orders")).toEqual([]);
    expect(rows("creators")).toHaveLength(1);
  });
  it("leaves the creation revenue figure unchanged", async () => {
    const before = (await supabaseAdmin.rpc("tugg_creation_revenue")).data;
    expect(before).toEqual({ sandbox: 900 });
    expect((await post(valid)).status).toBe(201);
    expect((await supabaseAdmin.rpc("tugg_creation_revenue")).data).toEqual(before);
  });
});

describe("moderation is binding for the owner", () => {
  it("a rejection creates nothing, returns the reason and logs the verdict", async () => {
    state.verdict = { allowed: false, reason: "Politicians are not allowed" };
    const res = await post({ ...valid, title: "Senator X vs Senator Y", a: "Senator X", b: "Senator Y" });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ created: false, reason: "Politicians are not allowed" });
    expect(rows("matchups")).toHaveLength(1);
    expect(rows("sides")).toHaveLength(2);
    expect(rows("rounds")).toHaveLength(1);
    expect(rows("moderation_log")).toEqual([
      expect.objectContaining({ subject_type: "owner_matchup", verdict: "rejected", reason: "Politicians are not allowed" }),
    ]);
  });
  it("there is no override: extra force/bypass fields are ignored", async () => {
    state.verdict = { allowed: false, reason: "Private individual" };
    const res = await post({ ...valid, force: true, bypass: true, override: true, skipModeration: true });
    expect(res.status).toBe(422);
    expect(rows("matchups")).toHaveLength(1);
  });
  it("unavailable moderation fails closed", async () => {
    state.verdict = { allowed: false, reason: "Moderation unavailable" };
    expect((await post(valid)).status).toBe(422);
    expect(rows("matchups")).toHaveLength(1);
  });
});

describe("duplicates and identical sides", () => {
  it.each([
    ["same order", "Pizza", "Burgers"],
    ["reversed order, different case", "BURGERS", "pizza"],
  ])("an existing pair (%s) is rejected", async (_, a, b) => {
    const res = await post({ ...valid, title: `${a} vs ${b}`, a, b });
    expect(res.status).toBe(409);
    expect(rows("matchups")).toHaveLength(1);
    expect(state.moderate).not.toHaveBeenCalled();
    expect(rows("moderation_log")).toEqual([expect.objectContaining({ subject_type: "owner_matchup", verdict: "duplicate" })]);
  });
  it("a pair whose two sides are the same is rejected", async () => {
    const res = await post({ ...valid, title: "Tacos vs Tacos!", a: "Tacos", b: "tacos!" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Both sides are the same.");
    expect(rows("matchups")).toHaveLength(1);
    expect(state.moderate).not.toHaveBeenCalled();
  });
  it("the duplicate check reads past the first 1,000 sides", async () => {
    for (let i = 0; i < 600; i++)
      state.tables["sides"]!.unshift({ id: `x${i}a`, matchup_id: `x${i}`, position: 0, name: `A${i}`, emoji: "🅰️", color: "#000" }, { id: `x${i}b`, matchup_id: `x${i}`, position: 1, name: `B${i}`, emoji: "🅱️", color: "#000" });
    expect((await post({ ...valid, title: "Pizza vs Burgers", a: "Burgers", b: "Pizza" })).status).toBe(409);
  });
});

describe("slug clash", () => {
  it("gets a short suffix instead of failing or overwriting", async () => {
    const res = await post({ ...valid, title: "Pizza vs Burgers", a: "Pizza Slice", b: "Smash Burger" });
    expect(res.status).toBe(201);
    const { slug } = await res.json();
    expect(slug).toMatch(/^pizza-vs-burgers-[a-z0-9]{1,4}$/);
    expect(rows("matchups").find((m) => m["id"] === "m-paid")).toMatchObject({ slug: "pizza-vs-burgers", source: "user", title: "Pizza vs Burgers" });
    expect(rows("matchups").filter((m) => m["slug"].startsWith("pizza-vs-burgers"))).toHaveLength(2);
  });
});

describe("input limits and half-made matchups", () => {
  it.each([
    ["side name over 40", { a: "x".repeat(41) }],
    ["description over 280", { description: "x".repeat(281) }],
    ["emoji over 8", { aEmoji: "🌮🌮🌮🌮🌮" }],
    ["emoji that is text", { bEmoji: "Trump" }],
    ["category outside the list", { category: "Politics" }],
    ["empty title", { title: "  " }],
  ])("%s is refused before anything runs", async (_, patch) => {
    expect((await post({ ...valid, ...patch })).status).toBe(400);
    expect(state.writes).toEqual([]);
    expect(state.moderate).not.toHaveBeenCalled();
  });
  it.each(["sides", "rounds"])("a failure saving %s removes the new matchup", async (t) => {
    state.fail[t] = true;
    expect((await post(valid)).status).toBe(503);
    expect(rows("matchups").map((m) => m["id"])).toEqual(["m-paid"]);
    expect(rows("sides")).toHaveLength(2);
  });
});

describe("the house is credited on the page", () => {
  it("the matchup page line says Added by Tugg for owner and AI matchups only", () => {
    expect(render(<MatchupKicker category="Food" source="owner" />).container.textContent).toBe("Food · Added by Tugg");
    cleanup();
    expect(render(<MatchupKicker category="Food" source="ai" />).container.textContent).toBe("Food · Added by Tugg");
    cleanup();
    expect(render(<MatchupKicker category="Food" source="user" />).container.textContent).toBe("Food");
  });
  it("the matchup page renders that line from the matchup's source", () => {
    const page = readFileSync("src/routes/m.$slug.tsx", "utf8");
    expect(page).toContain("<MatchupKicker category={m.category} source={m.source} />");
    for (const f of ["src/routes/m.$slug.tsx", "src/components/tugg/HomeRopes.tsx", "src/lib/feeds.ts"])
      expect(readFileSync(f, "utf8")).not.toMatch(/source === "ai"/);
  });
  it("home rope cards credit owner matchups too", () => {
    const m: any = {
      id: "m", slug: "tacos-vs-sushi", title: "Tacos vs Sushi", description: "", category: "Food", source: "owner", status: "active",
      featured_until: null, created_at: "2026-11-18T00:00:00Z", history: null, round: null,
      sides: [{ id: "a", position: 0, name: "Tacos", emoji: "🌮", color: "#ff3b30", all_time_cents: 0 }, { id: "b", position: 1, name: "Sushi", emoji: "🍣", color: "#0a84ff", all_time_cents: 0 }],
    };
    expect(render(<TrendingRopeCard m={m} siteUrl="https://tugg.lol" />).container.textContent).toContain("Added by Tugg");
  });
});

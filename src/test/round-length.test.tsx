// Round length (weekly by default, daily per matchup), the permanent all-time score, empty-round history and
// daily publishing on a weekly-round site. Database rules live in round-length.sql / round-length-concurrency.py.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const state = vi.hoisted(() => ({
  rpc: [] as string[],
  writes: [] as { table: string; op: string; payload: any }[],
  closed: [] as any[],
  dayFacts: { total_cents: 0, pulls: 0, countries: [] as any[] },
  dayMatchups: [] as any[],
  roundTotals: [] as any[],
  pings: [] as string[][],
}));
vi.mock("@/integrations/supabase/client.server", () => {
  const resolve = (c: { table: string; op: string; head: boolean }) => {
    if (c.table === "rounds" && c.head) return { count: 0, data: null, error: null };
    if (c.table === "rounds") return { data: state.closed, error: null };
    if (c.table === "matchups") return { data: [{ id: "m1", slug: "notion-vs-obsidian", title: "Notion vs Obsidian", sides: [{ position: 0, name: "Notion" }, { position: 1, name: "Obsidian" }] }], error: null };
    return { data: null, error: null };
  };
  const from = (table: string) => {
    const c = { table, op: "select", head: false };
    const b: any = {
      select: (_s: string, o?: { head?: boolean }) => { c.head = !!o?.head; return b; },
      insert: (p: any) => { c.op = "insert"; state.writes.push({ table, op: "insert", payload: p }); return b; },
      upsert: (p: any) => { c.op = "upsert"; state.writes.push({ table, op: "upsert", payload: p }); return b; },
      update: (p: any) => { c.op = "update"; state.writes.push({ table, op: "update", payload: p }); return b; },
      delete: () => { c.op = "delete"; return b; },
      eq: () => b, lt: () => b, gte: () => b, in: () => b, not: () => b, order: () => b, limit: () => b, is: () => b,
      maybeSingle: async () => resolve(c), single: async () => resolve(c),
      then: (res: any, rej: any) => Promise.resolve(resolve(c)).then(res, rej),
    };
    return b;
  };
  const rpc = async (name: string) => {
    state.rpc.push(name);
    if (name === "tugg_day_facts") return { data: state.dayFacts, error: null };
    if (name === "tugg_day_matchups") return { data: state.dayMatchups, error: null };
    if (name === "tugg_round_totals") return { data: state.roundTotals, error: null };
    return { data: null, error: null };
  };
  return { supabaseAdmin: { from, rpc } };
});
vi.mock("@/lib/indexnow.server", () => ({ pingIndexNow: vi.fn(async (paths: string[]) => { state.pings.push(paths); return { status: 200, urls: paths.length }; }) }));
vi.mock("@/components/tugg/SideAvatar", () => ({ SideAvatar: () => null }));
vi.mock("@/components/tugg/ShareButton", () => ({ ShareButton: () => null }));

import { cadenceSummary, closedRoundName, currentRound, roundName, weekStart, ROUND_LENGTH_RULE } from "@/lib/rounds";
import { countdownText } from "@/components/tugg/Countdown";
import { cardVersion, matchupCardInput, resultCardInput } from "@/lib/og/card";
import { allTimeSentence, recordText, roundSentence } from "@/lib/matchup-facts";
import { AllTimeScore } from "@/components/tugg/AllTimeScore";
import { PaymentReceipt } from "@/components/tugg/PaymentReceipt";
import { recapSummary, runRecap } from "@/lib/jobs.server";
import { shareText } from "@/lib/share";
import { policySections, supportAnswers } from "@/lib/policies";

afterEach(() => cleanup());

const sides: any[] = [
  { id: "a1", position: 0, name: "Messi", emoji: "🐐", color: "#75aadb", all_time_cents: 2500, wins: 1 },
  { id: "b1", position: 1, name: "Ronaldo", emoji: "👑", color: "#e4002b", all_time_cents: 2500, wins: 0 },
];
const notion: any[] = [
  { id: "n", position: 0, name: "Notion", emoji: "📝", color: "#e5e5e5", all_time_cents: 2500, wins: 1, current_streak: 0, best_streak: 1 },
  { id: "o", position: 1, name: "Obsidian", emoji: "💎", color: "#8b5cf6", all_time_cents: 500, wins: 0, current_streak: 0, best_streak: 0 },
];
const lastDaily = { id: "r0", winner_side_id: "n", note: null, starts_at: "2026-11-11T00:00:00Z", ends_at: "2026-11-12T00:00:00Z", round_length: "daily" as const, total_a_cents: 2500, total_b_cents: 500 };
const emptyWeek = (extra: any = {}) => ({
  sides: notion,
  round: { id: "r1", starts_at: "2026-11-16T00:00:12Z", ends_at: "2026-11-23T00:00:00Z", total_a_cents: 0, total_b_cents: 0, pullers: 0, extensions: 0, round_length: "weekly" as const },
  history: { rounds: 15, last: lastDaily },
  ...extra,
});

describe("round names and boundaries", () => {
  it("names a weekly round by the Monday of its calendar week (UTC)", () => {
    expect(weekStart("2026-11-12T00:53:00Z")).toBe("2026-11-09"); // Thursday
    expect(weekStart("2026-11-16T00:00:00Z")).toBe("2026-11-16"); // Monday 00:00
    expect(weekStart("2026-11-15T23:59:59Z")).toBe("2026-11-09"); // Sunday night
    expect(roundName("weekly", "2026-11-12T00:53:00Z")).toBe("Week of Nov 9, 2026");
    expect(roundName("daily", "2026-11-12T00:00:00Z")).toBe("Nov 12, 2026");
  });
  it("keeps daily history labels as they were and names weekly ones", () => {
    expect(closedRoundName("daily", "2026-11-11T00:00:00Z", "2026-11-12T00:00:00Z")).toBe("2026-11-12");
    expect(closedRoundName("weekly", "2026-11-16T00:00:12Z", "2026-11-23T00:00:00Z")).toBe("Week of Nov 16, 2026");
  });
  it("words the round for the matchup's own length", () => {
    expect(currentRound("weekly")).toBe("this week's round");
    expect(currentRound("daily")).toBe("today's round");
    expect(cadenceSummary(["weekly", "weekly"])).toBe("Weekly rounds end Monday 00:00 UTC.");
    expect(cadenceSummary(["daily"])).toBe("Rounds end daily at 00:00 UTC.");
    expect(cadenceSummary(["weekly", "daily"])).toContain("busy ropes reset daily");
  });
  it("counts down days on a weekly round", () => {
    expect(countdownText(3 * 86400000 + 7 * 3600000 + 15 * 60000 + 9000)).toBe("3d 07:15:09");
    expect(countdownText(7 * 3600000 + 15 * 60000 + 9000)).toBe("07:15:09");
  });
  it("policy and rules copy is true for either length and says the all-time score never resets", () => {
    const rounds = supportAnswers.find((a) => a.id === "rounds")!.text;
    expect(rounds).toContain(ROUND_LENGTH_RULE);
    expect(rounds).toContain("never reset");
    expect(rounds).not.toMatch(/24-hour|Rounds end at 00:00 UTC\./);
    expect(JSON.stringify(policySections)).not.toContain("fresh contest every day");
  });
});

describe("share-image tokens", () => {
  // Locked values. They changed once, on purpose, when side emoji moved from Twemoji to Noto (render version 3),
  // so no year-cached card with the old artwork is ever served under a current URL.
  const liveDaily = { sides, round: { starts_at: "2026-11-11T00:00:00+00:00", total_a_cents: 0, total_b_cents: 2500, round_length: "daily" }, history: { rounds: 3, last: null } };
  const resultDaily = { id: "r", ends_at: "2026-11-12T00:00:00Z", starts_at: "2026-11-11T00:00:00Z", round_length: "daily", pullers: 3, winner_cents: 2500, loser_cents: 500, winner: sides[1], loser: sides[0] };
  it("daily live and result tokens moved off the Twemoji-era values and are stable", () => {
    const live = cardVersion(matchupCardInput(liveDaily)!);
    const result = cardVersion(resultCardInput(resultDaily));
    expect(live).not.toBe("0-2500-g6b77v"); // Twemoji-era token
    expect(result).not.toBe("500-2500-1jf0wtw"); // Twemoji-era token
    expect(live).toBe("0-2500-vuc9c4");
    expect(result).toBe("500-2500-vw2pif");
  });
  it("a weekly round is named by its week and gets its own token", () => {
    const weekly = { ...liveDaily, round: { ...liveDaily.round, starts_at: "2026-11-12T00:00:30Z", round_length: "weekly" } };
    const daily = { ...liveDaily, round: { ...liveDaily.round, starts_at: "2026-11-12T00:00:30Z" } };
    const input = matchupCardInput(weekly)!;
    expect(input).toMatchObject({ period: "week", day: "2026-11-09" });
    expect(cardVersion(input)).not.toBe(cardVersion(matchupCardInput(daily)!));
    const res = resultCardInput({ ...resultDaily, starts_at: "2026-11-16T00:00:12Z", ends_at: "2026-11-23T00:00:00Z", round_length: "weekly" });
    expect(res).toMatchObject({ period: "week", day: "2026-11-16" });
  });
  it("an empty round's card carries history, and its token changes when history does", () => {
    const input = matchupCardInput(emptyWeek())!;
    expect(input.history).toEqual({ rounds: 15, winsA: 1, winsB: 0, allTimeA: 2500, allTimeB: 500, last: { winner: 0, a: 2500, b: 500, tie: false } });
    const v = cardVersion(input);
    expect(v.startsWith("0-0-")).toBe(true);
    expect(cardVersion(matchupCardInput(emptyWeek({ history: { rounds: 16, last: lastDaily } }))!)).not.toBe(v);
    expect(cardVersion(matchupCardInput(emptyWeek({ sides: [{ ...notion[0], all_time_cents: 2600 }, notion[1]] }))!)).not.toBe(v);
    expect(matchupCardInput({ ...emptyWeek(), round: { ...emptyWeek().round, total_a_cents: 100 } })!.history).toBeUndefined();
  });
});

describe("empty round on the page and in share text", () => {
  it("leads with the previous round and the all-time score, never two zeros", () => {
    const m: any = emptyWeek();
    const s = roundSentence(m, "2026-11-16");
    expect(s).toBe("As of 2026-11-16 (UTC), this week's round has no pulls yet. Last round (ended 2026-11-12): Notion won $25 to $5.");
    expect(s).not.toContain("$0");
    expect(recordText(m)).toBe("Notion 1 — Obsidian 0 over 15 rounds");
    expect(allTimeSentence(m)).toBe("All-time score (never resets): rounds won Notion 1 — Obsidian 0 over 15 rounds; Notion $25 and Obsidian $5 pulled all-time.");
    expect(shareText({ slug: "n", title: "Notion vs Obsidian", sides: notion, a: 0, b: 0 })).toBe(
      "Notion vs Obsidian on Tugg: a new round is open. All-time: Notion $25 vs Obsidian $5. Be the first to pull.",
    );
  });
  it("a live round still reads as the live score", () => {
    const m: any = { ...emptyWeek(), round: { ...emptyWeek().round, total_a_cents: 700, total_b_cents: 1200 } };
    const weeklyLast = { ...m, history: { rounds: 16, last: { ...lastDaily, starts_at: "2026-11-09T00:00:00Z", ends_at: "2026-11-16T00:00:00Z", round_length: "weekly" } } };
    expect(roundSentence({ ...weeklyLast, round: emptyWeek().round }, "2026-11-17")).toContain("Last round (Week of Nov 9, 2026): Notion won $25 to $5.");
    expect(roundSentence(m, "2026-11-17")).toBe("As of 2026-11-17 (UTC), Obsidian leads Notion $12 to $7 in this week's round.");
  });
  it("the all-time panel is separate from the live round and shows the never-reset record", () => {
    render(<AllTimeScore m={emptyWeek() as any} lead />);
    expect(screen.getByRole("heading", { name: "All-time score · never resets" })).toBeInTheDocument();
    expect(screen.getByText("Notion 1 — Obsidian 0 over 15 rounds")).toBeInTheDocument();
    expect(screen.getByText("$25")).toBeInTheDocument();
    expect(screen.getByText("$5")).toBeInTheDocument();
    expect(screen.getByText("The live round is below")).toBeInTheDocument();
    expect(screen.getByText(/Notion won \$25 to \$5/)).toBeInTheDocument();
    expect(screen.getByText(/ended 2026-11-12/)).toBeInTheDocument();
  });
  it("the receipt words the round by its length", () => {
    const line = { matchupId: "m1", slug: "notion-vs-obsidian", title: "Notion vs Obsidian", sides: notion, sideId: "n", pulls: 25, totalA: 2500, totalB: 0 };
    const { rerender } = render(<PaymentReceipt receipt={{ amountCents: 2500, pulls: 25, refundedPulls: 0, siteUrl: "https://tugg.lol", lines: [{ ...line, roundLength: "weekly" }] }} />);
    expect(screen.getByText(/in this week's round vs/)).toBeInTheDocument();
    rerender(<PaymentReceipt receipt={{ amountCents: 2500, pulls: 25, refundedPulls: 0, siteUrl: "https://tugg.lol", lines: [line] }} />);
    expect(screen.getByText(/in today's round vs/)).toBeInTheDocument();
  });
});

describe("daily recap on a weekly-round site", () => {
  // No real AI call: without a key the recap falls back to the fact-built summary, which is what is published.
  beforeEach(() => vi.stubEnv("LOVABLE_API_KEY", ""));
  afterEach(() => vi.unstubAllEnvs());
  const reset = () => { state.rpc = []; state.writes = []; state.closed = []; state.pings = []; state.dayMatchups = []; state.roundTotals = []; };
  it("summarises a mid-round day without claiming a winner", () => {
    const s = recapSummary({ day: "2026-11-18", total_cents: 2500, pulls: 1, countries: [{ country: "IN", pulls: 1, cents: 2500 }], rounds: [],
      activity: [{ title: "Notion vs Obsidian", slug: "notion-vs-obsidian", a: "Notion", b: "Obsidian", a_cents: 2500, b_cents: 0, pulls: 1 }] });
    expect(s).toBe("On November 18, 2026 (UTC), Tugg players made 1 pull totalling $25 across 1 matchup. The most pulled rope was Notion vs Obsidian at $25. Pulls came from 1 country.");
  });
  it("a quiet mid-week day says so without inventing closed rounds", () => {
    const s = recapSummary({ day: "2026-11-18", total_cents: 0, pulls: 0, countries: [], rounds: [], activity: [] });
    expect(s).toBe("On November 18, 2026 (UTC), there was no activity on Tugg: no pulls were made.");
  });
  it("the weekly close day crowns the champions even when that day had no pulls", () => {
    const s = recapSummary({ day: "2026-11-22", total_cents: 0, pulls: 0, countries: [], activity: [], rounds: [
      { title: "Notion vs Obsidian", slug: "notion-vs-obsidian", a: "Notion", b: "Obsidian", a_cents: 2500, b_cents: 500, pullers: 2, winner: "Notion", note: null, length: "weekly" },
      { title: "Pizza vs Burgers", slug: "pizza-vs-burgers", a: "Pizza", b: "Burgers", a_cents: 0, b_cents: 0, pullers: 0, winner: null, note: "empty", length: "weekly" },
    ] });
    expect(s).toBe("On November 22, 2026 (UTC), there was no activity on Tugg: no pulls were made. 2 weekly rounds closed at 00:00 UTC: Notion won Notion vs Obsidian $25 to $5.");
  });
  it("publishes a dated recap and pings IndexNow on a mid-week day with no round closing", async () => {
    reset();
    state.dayFacts = { total_cents: 2500, pulls: 1, countries: [] };
    state.dayMatchups = [{ matchup_id: "m1", a_cents: 2500, b_cents: 0, pulls: 1 }];
    const out: any = await runRecap({ day: "2026-11-11" });
    expect(out.day).toBe("2026-11-11");
    const saved = state.writes.find((w) => w.table === "recaps" && w.op === "upsert")!.payload;
    expect(saved.day).toBe("2026-11-11");
    expect(saved.facts.rounds).toEqual([]);
    expect(saved.facts.activity).toEqual([{ title: "Notion vs Obsidian", slug: "notion-vs-obsidian", a: "Notion", b: "Obsidian", a_cents: 2500, b_cents: 0, pulls: 1 }]);
    expect(saved.summary).toContain("The most pulled rope was Notion vs Obsidian at $25.");
    expect(state.pings).toHaveLength(1);
    expect(state.pings[0]).toEqual(expect.arrayContaining(["/recap", "/recap/2026-11-11", "/m/notion-vs-obsidian", "/rivalries/notion-vs-obsidian"]));
    expect(state.rpc).toContain("tugg_day_matchups");
  });
  it("still publishes and pings on a day with no pulls and no closes", async () => {
    reset();
    state.dayFacts = { total_cents: 0, pulls: 0, countries: [] };
    await runRecap({ day: "2026-11-10" });
    expect(state.writes.some((w) => w.table === "recaps" && w.op === "upsert" && w.payload.day === "2026-11-10")).toBe(true);
    expect(state.pings[0]).toEqual(expect.arrayContaining(["/", "/recap", "/recap/2026-11-10"]));
  });
});

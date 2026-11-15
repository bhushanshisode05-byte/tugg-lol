import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

const state = vi.hoisted(() => ({ live: true, rpc: vi.fn(), sidesIn: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let v: any;
    const b: any = {
      middleware: () => b,
      inputValidator(x: any) { v = x; return b; },
      handler(fn: any) { return (arg: any = {}) => fn({ data: v ? v(arg.data) : arg.data }); },
    };
    return b;
  },
}));
vi.mock("@/lib/server-utils.server", () => ({
  config: () => ({ paymentsEnv: state.live ? "live" : "sandbox", pausePulls: false, siteUrl: "https://tugg.lol" }),
  liveOnly: () => state.live,
  resolvePaymentsEnv: () => ({ env: "sandbox" }),
  slugify: (s: string) => s,
  moderate: vi.fn(),
  publicDb: () => ({
    rpc: state.rpc,
    from: () => ({ select: () => ({ in: state.sidesIn }) }),
  }),
}));
vi.mock("@/lib/payments/selection.server", () => ({ selectedProvider: vi.fn(), selectedProduct: vi.fn(), paymentReadiness: vi.fn() }));

import { getRecentPulls } from "@/lib/tugg.functions";
import { clearRecentPullsCache } from "@/lib/recent-pulls.server";
import { RECENT_PULL_KEYS, RECENT_PULLS, relativeTime, toRecentPulls, type RecentPull } from "@/lib/recent-pulls";
import { RecentPulls } from "@/components/tugg/RecentPulls";

const NOW = Date.parse("2026-11-15T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000, HR = 3600_000;

// Stored pulls as the public SQL function sees them; it filters environment = 'live' when p_live is true.
const stored = [
  { id: "p1", side_id: "messi", matchup_id: "m1", amount_cents: 1000, display_name: null, shout_out: "secret shout", country: "DE", created_at: ago(2 * MIN), environment: "live", stripe_session_id: "pay_live_1", buyer_email: "a@example.com" },
  { id: "p2", side_id: "ronaldo", matchup_id: "m1", amount_cents: 2500, display_name: "RopeKing", shout_out: null, country: null, created_at: ago(14 * MIN), environment: "live", stripe_session_id: "pay_live_2", buyer_email: "b@example.com" },
  { id: "p3", side_id: "messi", matchup_id: "m1", amount_cents: 500, display_name: "Tester", shout_out: null, country: "US", created_at: ago(1 * MIN), environment: "sandbox", stripe_session_id: "pay_test_3", buyer_email: "t@example.com" },
  { id: "p4", side_id: "ronaldo", matchup_id: "m1", amount_cents: 500, display_name: "Old", shout_out: null, country: null, created_at: ago(49 * HR), environment: "live", stripe_session_id: "pay_live_4", buyer_email: "c@example.com" },
];
const sidesTable = [
  { id: "messi", name: "Messi", matchups: { title: "Messi vs Ronaldo" } },
  { id: "ronaldo", name: "Ronaldo", matchups: { title: "Messi vs Ronaldo" } },
];

beforeEach(() => {
  clearRecentPullsCache();
  state.live = true;
  state.rpc.mockReset().mockImplementation(async (fn: string, a: { p_live: boolean; p_limit: number }) => {
    expect(fn).toBe("tugg_recent_pulls");
    const rows = stored
      .filter((p) => !a.p_live || p.environment === "live")
      .sort((x, y) => y.created_at.localeCompare(x.created_at))
      .slice(0, a.p_limit);
    return { data: rows, error: null };
  });
  state.sidesIn.mockReset().mockImplementation(async (_c: string, ids: string[]) => ({ data: sidesTable.filter((s) => ids.includes(s.id)), error: null }));
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const row = (p: Partial<RecentPull>): RecentPull => ({ name: null, country: null, side: "Messi", matchup: "Messi vs Ronaldo", pulls: 10, at: ago(2 * MIN), ...p });

describe("recent pulls ticker: rendering", () => {
  it("renders newest first with honest relative times", () => {
    render(
      <RecentPulls
        showMatchup
        pulls={[
          row({ name: "Late", at: ago(40 * MIN), pulls: 5 }),
          row({ name: "RopeKing", side: "Ronaldo", pulls: 25, at: ago(14 * MIN) }),
          row({ name: null, country: "Germany", at: ago(2 * MIN) }),
          row({ name: "Fresh", at: ago(30 * 1000), pulls: 1 }),
          row({ name: "Night", at: ago(14 * HR + 59 * MIN), pulls: 5 }),
        ]}
      />,
    );
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual([
      "Fresh pulled 1 for Messi · Messi vs Ronaldojust now",
      "Someone in Germany pulled 10 for Messi · Messi vs Ronaldo2 min ago",
      "RopeKing pulled 25 for Ronaldo · Messi vs Ronaldo14 min ago",
      "Late pulled 5 for Messi · Messi vs Ronaldo40 min ago",
      "Night pulled 5 for Messi · Messi vs Ronaldo14 hr ago",
    ]);
  });

  it("never rounds older pulls to 'just now'", () => {
    expect(relativeTime(ago(59 * 1000), NOW)).toBe("just now");
    expect(relativeTime(ago(60 * 1000), NOW)).toBe("1 min ago");
    expect(relativeTime(ago(2 * MIN + 59 * 1000), NOW)).toBe("2 min ago");
    expect(relativeTime(ago(40 * MIN), NOW)).toBe("40 min ago");
    expect(relativeTime(ago(60 * MIN), NOW)).toBe("1 hr ago");
    expect(relativeTime(ago(47 * HR + 59 * MIN), NOW)).toBe("47 hr ago");
  });

  it("shows at most five rows", () => {
    render(<RecentPulls pulls={Array.from({ length: 8 }, (_, i) => row({ at: ago((i + 1) * MIN) }))} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(RECENT_PULLS.limit);
  });

  it("renders nothing at all when there are no pulls in the window", () => {
    const empty = render(<RecentPulls pulls={[]} />);
    expect(empty.container.querySelector("[data-recent-pulls]")).toBeNull();
    expect(empty.container.innerHTML).toBe("");
    const stale = render(<RecentPulls pulls={[row({ at: ago(48 * HR + 1000) })]} />);
    expect(stale.container.querySelector("[data-recent-pulls]")).toBeNull();
    expect(stale.container.innerHTML).toBe("");
  });

  it("removes itself once the last row ages past 48 hours", async () => {
    const { container } = render(<RecentPulls pulls={[row({ at: ago(48 * HR - 3000) })]} />);
    expect(container.querySelector("[data-recent-pulls]")).not.toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(container.querySelector("[data-recent-pulls]")).toBeNull();
  });

  it("says Someone, never Anonymous, for a pull with no display name", () => {
    const mapped = toRecentPulls(
      [
        { side_id: "messi", amount_cents: 1000, display_name: null, country: null, created_at: ago(MIN) },
        { side_id: "messi", amount_cents: 1000, display_name: "", country: null, created_at: ago(2 * MIN) },
        { side_id: "messi", amount_cents: 1000, display_name: "Anonymous", country: null, created_at: ago(3 * MIN) },
      ],
      new Map([["messi", { side: "Messi", matchup: "Messi vs Ronaldo" }]]),
      NOW,
    );
    expect(mapped.map((p) => p.name)).toEqual([null, null, null]);
    render(<RecentPulls pulls={mapped} />);
    expect(screen.getAllByRole("listitem")[0]!.textContent).toBe("Someone pulled 10 for Messi1 min ago");
    expect(document.body.textContent).not.toMatch(/anonymous/i);
  });
});

describe("recent pulls ticker: site-wide server function", () => {
  it("excludes sandbox pulls when the site is live", async () => {
    state.live = true;
    const out = await getRecentPulls();
    expect(state.rpc).toHaveBeenCalledWith("tugg_recent_pulls", { p_live: true, p_limit: 5 });
    expect(out.map((p) => p.name)).toEqual([null, "RopeKing"]);
    expect(JSON.stringify(out)).not.toContain("Tester");
  });

  it("returns exactly the public fields: no email, order or payment id, amount or shout-out", async () => {
    const out = await getRecentPulls();
    expect(out).toEqual([
      { name: null, country: "Germany", side: "Messi", matchup: "Messi vs Ronaldo", pulls: 10, at: ago(2 * MIN) },
      { name: "RopeKing", country: null, side: "Ronaldo", matchup: "Messi vs Ronaldo", pulls: 25, at: ago(14 * MIN) },
    ]);
    for (const p of out) expect(Object.keys(p).sort()).toEqual([...RECENT_PULL_KEYS]);
    const json = JSON.stringify(out);
    for (const leak of ["@", "example.com", "pay_", "p1", "p2", "amount", "cents", "email", "order", "secret shout", "side_id", "matchup_id", "\"id\""])
      expect(json).not.toContain(leak);
  });

  it("only includes pulls from the last 48 hours", async () => {
    const out = await getRecentPulls();
    expect(out.some((p) => p.name === "Old")).toBe(false);
  });

  it("returns nothing (so the ticker is absent) when there are no recent pulls", async () => {
    state.rpc.mockResolvedValueOnce({ data: [], error: null });
    expect(await getRecentPulls()).toEqual([]);
    expect(state.sidesIn).not.toHaveBeenCalled();
  });

  it("caches the feed for 15 seconds and does not cache failures", async () => {
    await getRecentPulls();
    await getRecentPulls();
    expect(state.rpc).toHaveBeenCalledTimes(1);
    vi.setSystemTime(NOW + 16_000);
    await getRecentPulls();
    expect(state.rpc).toHaveBeenCalledTimes(2);

    clearRecentPullsCache();
    state.rpc.mockResolvedValueOnce({ data: null, error: { message: "down" } });
    expect(await getRecentPulls()).toEqual([]);
    await getRecentPulls();
    expect(state.rpc).toHaveBeenCalledTimes(4);
  });
});

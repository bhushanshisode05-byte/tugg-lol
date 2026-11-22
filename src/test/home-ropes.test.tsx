import type { ReactNode, ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Matchup } from "@/lib/tugg.functions";
import { isNewRope, trendingRopes } from "@/lib/home-ropes";

const state = vi.hoisted(() => ({ matchups: [] as Matchup[] }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  Link: ({ children, className }: { children: ReactNode; className?: string }) => <a className={className}>{children}</a>,
}));
vi.mock("@tanstack/react-query", () => ({
  queryOptions: (options: unknown) => options,
  useSuspenseQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data: queryKey[0] === "home" ? { matchups: state.matchups, siteUrl: "https://tugg.lol" } : [],
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/lib/tugg.functions", () => ({ getHome: vi.fn(), getRecentPulls: vi.fn() }));
vi.mock("@/hooks/use-live", () => ({ useLive: vi.fn() }));
vi.mock("@/components/tugg/Shell", () => ({ Shell: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("@/components/tugg/ShareButton", () => ({ ShareButton: () => null }));
vi.mock("@/components/tugg/RecentPulls", () => ({ RecentPulls: () => null }));
vi.mock("@/components/tugg/SideAvatar", () => ({ SideAvatar: () => null }));
vi.mock("@/components/tugg/Rope", () => ({ Rope: () => null, usd: (cents: number) => `$${cents / 100}` }));
vi.mock("@/components/tugg/RoundStatus", () => ({ RoundStatus: () => null }));

import { Route } from "@/routes/index";

const NOW = Date.parse("2026-11-22T08:12:00Z");
const HOUR = 3_600_000;
function rope(id: string, ageHours: number, a = 0, b = 0, category = "Sports"): Matchup {
  return {
    id, slug: id, title: id, description: "", category, source: "owner", status: "active",
    featured_until: null, created_at: new Date(NOW - ageHours * HOUR).toISOString(), sides: [], history: null,
    round: {
      id: `round-${id}`, starts_at: "2026-11-16T00:00:00Z", ends_at: "2026-11-23T00:00:00Z",
      total_a_cents: a, total_b_cents: b, pullers: a + b > 0 ? 1 : 0, extensions: 0, round_length: "weekly",
    },
  };
}
function renderHome() {
  const Home = Route.options.component as ComponentType | undefined;
  if (!Home) throw new Error("Home component missing");
  return render(<Home />);
}
const displayedIds = () => screen.queryAllByRole("heading", { level: 3 }).map((heading) => heading.textContent?.trim());

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("homepage display ranking", () => {
  it("a paid current round outranks a newer empty rope, adding both sides", () => {
    const input = [rope("new-empty", 1), rope("older-paid", 100, 100, 500), rope("other-paid", 2, 500)];
    expect(trendingRopes(input).map((m) => m.id)).toEqual(["older-paid", "other-paid", "new-empty"]);
    expect(input.map((m) => m.id)).toEqual(["new-empty", "older-paid", "other-paid"]);
  });
  it("empty ropes are newest first, including ropes without an open round", () => {
    const withoutRound = { ...rope("newest", 1), round: null };
    expect(trendingRopes([rope("seed", 700), rope("recent", 24), withoutRound]).map((m) => m.id))
      .toEqual(["newest", "recent", "seed"]);
  });
  it("equal paid totals use newest first rather than all-time money", () => {
    expect(trendingRopes([rope("old", 70, 500), rope("new", 1, 200, 300)]).map((m) => m.id)).toEqual(["new", "old"]);
  });
  it("renders the new ranking while keeping the featured rope and category chips independent", () => {
    state.matchups = [
      { ...rope("featured-food", 200, 0, 0, "Food"), featured_until: "2026-11-29T00:00:00Z" },
      rope("old-sports", 100), rope("new-sports", 1), rope("paid-food", 80, 500, 500, "Food"),
    ];
    renderHome();
    expect(screen.getByRole("heading", { level: 2, name: "featured-food" })).toBeInTheDocument();
    expect(displayedIds()).toEqual(["paid-food", "new-sports", "old-sports", "featured-food"]);
    fireEvent.click(screen.getByRole("button", { name: "Sports" }));
    expect(displayedIds()).toEqual(["new-sports", "old-sports"]);
    expect(screen.getByRole("heading", { level: 2, name: "featured-food" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Food" }));
    expect(displayedIds()).toEqual(["paid-food", "featured-food"]);
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search matchups" }), { target: { value: "NEW-SPORTS" } });
    expect(displayedIds()).toEqual(["new-sports"]);
  });
  it("does not change the unfeatured hero's existing oldest-first tie behaviour", () => {
    state.matchups = [rope("old-seed", 700), rope("fresh-rope", 1)];
    renderHome();
    expect(screen.getByRole("heading", { level: 2, name: "old-seed" })).toBeInTheDocument();
    expect(displayedIds()).toEqual(["fresh-rope", "old-seed"]);
  });
});

describe("NEW eligibility is strictly inside the last 48 hours", () => {
  it("includes a rope created now and one created just under 48 hours ago", () => {
    expect(isNewRope(new Date(NOW).toISOString(), NOW)).toBe(true);
    expect(isNewRope(new Date(NOW - 48 * HOUR + 1).toISOString(), NOW)).toBe(true);
  });
  it("excludes exactly 48 hours and older", () => {
    expect(isNewRope(new Date(NOW - 48 * HOUR).toISOString(), NOW)).toBe(false);
    expect(isNewRope(new Date(NOW - 49 * HOUR).toISOString(), NOW)).toBe(false);
  });
  it("does not label invalid or future dates as new", () => {
    expect(isNewRope("not-a-date", NOW)).toBe(false);
    expect(isNewRope(new Date(NOW + 1).toISOString(), NOW)).toBe(false);
  });
  it("the homepage marks only eligible ropes with visible NEW text", () => {
    state.matchups = [rope("inside-window", 47), rope("at-boundary", 48), rope("outside-window", 49)];
    renderHome();
    expect(screen.getAllByText("NEW", { exact: true })).toHaveLength(1);
    const markedCard = screen.getByText("NEW", { exact: true }).closest("[data-rope-card]");
    expect(markedCard).toHaveTextContent("inside-window");
  });
});
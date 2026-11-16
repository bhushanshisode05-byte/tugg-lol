// Every user-visible sentence about a round's period ("this week", "today") must come from that round's own length.
// These tests fail if a card or sentence hardcodes the period, or guesses one when the length is unknown.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, className }: { children: React.ReactNode; className?: string }) => <a className={className}>{children}</a>,
}));
vi.mock("@/components/tugg/SideAvatar", () => ({ SideAvatar: () => null }));
vi.mock("@/components/tugg/ShareButton", () => ({ ShareButton: () => null }));

import { OpenRoundsPulled, TrendingRopeCard } from "@/components/tugg/HomeRopes";
import { roundSentence } from "@/lib/matchup-facts";
import { currentRound, CurrentRound, openRoundsPulled, pullersText, roundCloses, roundEnds, roundPeriod, type RoundLength } from "@/lib/rounds";

afterEach(() => cleanup());

const HOUR = 3_600_000;
const sides: any[] = [
  { id: "a", position: 0, name: "Messi", emoji: "🐐", color: "#75aadb", all_time_cents: 0, wins: 0, current_streak: 0, best_streak: 0 },
  { id: "b", position: 1, name: "Ronaldo", emoji: "👑", color: "#e4002b", all_time_cents: 0, wins: 0, current_streak: 0, best_streak: 0 },
];
// Far enough from the close that the status line stays calm (weekly: > 12 h, daily: > 3 h).
const matchup = (round_length: RoundLength, a = 0, b = 0, pullers = 0): any => ({
  id: `m-${round_length}`, slug: "messi-vs-ronaldo", title: "Messi vs Ronaldo", description: "", category: "Sports", source: "seed",
  status: "active", featured_until: null, created_at: "2026-11-01T00:00:00Z", sides, history: null,
  round: {
    id: "r", starts_at: new Date(Date.now() - HOUR).toISOString(), extensions: 0, round_length, pullers, total_a_cents: a, total_b_cents: b,
    ends_at: new Date(Date.now() + (round_length === "weekly" ? 3 * 24 : 10) * HOUR).toISOString(),
  },
});
const text = (el: HTMLElement) => (el.textContent ?? "").toLowerCase();

describe("home rope cards word the period from the matchup's own round", () => {
  it("a weekly matchup card says this week and never today", () => {
    const { container } = render(<TrendingRopeCard m={matchup("weekly")} siteUrl="https://tugg.lol" />);
    expect(text(container)).toContain("no pulls yet this week");
    expect(text(container)).toContain("this week's round");
    expect(text(container)).not.toContain("today");
  });
  it("a daily matchup card says today and never this week", () => {
    const { container } = render(<TrendingRopeCard m={matchup("daily", 700, 1200, 3)} siteUrl="https://tugg.lol" />);
    expect(text(container)).toContain("3 pullers today");
    expect(text(container)).toContain("today's round");
    expect(text(container)).not.toContain("week");
  });
  it("one puller is singular", () => {
    expect(pullersText("weekly", 1)).toBe("1 puller this week");
  });
  it("the home badge sums open rounds and follows their lengths", () => {
    const weekly = render(<OpenRoundsPulled matchups={[matchup("weekly", 500, 0, 1), matchup("weekly", 0, 1000, 2)]} />);
    expect(weekly.container.textContent).toBe("$15 pulled this week");
    weekly.unmount();
    const daily = render(<OpenRoundsPulled matchups={[matchup("daily", 300, 0, 1)]} />);
    expect(daily.container.textContent).toBe("$3 pulled today");
    daily.unmount();
    expect(openRoundsPulled([matchup("weekly").round, matchup("daily").round])?.period).toBe("in current rounds");
    const none = render(<OpenRoundsPulled matchups={[{ ...matchup("weekly"), round: null }]} />);
    expect(none.container.querySelector("[data-open-rounds-pulled]")).toBeNull();
  });
});

describe("matchup and rivalry sentences", () => {
  it("weekly and daily sentences use their own period", () => {
    expect(roundSentence(matchup("weekly", 700, 1200), "2026-11-17")).toContain("in this week's round");
    expect(roundSentence(matchup("daily", 700, 1200), "2026-11-17")).toContain("in today's round");
  });
  it("an unknown length (no open round) is neutral, never a guessed daily period", () => {
    const s = roundSentence({ ...matchup("weekly"), round: null }, "2026-11-17");
    expect(s).toBe("As of 2026-11-17 (UTC), the current round has no pulls yet.");
    for (const f of [currentRound, CurrentRound, roundPeriod, roundEnds, roundCloses]) {
      expect(f(null).toLowerCase()).not.toMatch(/\btoday\b|this week/);
      expect(f(undefined)).toBe(f(null));
    }
    expect(pullersText(null, 0)).toBe("No pulls yet this round");
    expect(roundCloses("weekly")).toBe("weekly round ends on Monday at 00:00 UTC");
    expect(roundCloses("daily")).toBe("daily round ends at 00:00 UTC");
  });
});

describe("no hardcoded round-period copy", () => {
  // Round-period phrases may only be produced by src/lib/rounds.ts. Site-wide UTC-day facts (stats, daily recaps)
  // use other wording ("Pulls today", "that day") and are deliberately not round copy.
  const PHRASE = /today's round|this week's round|pulled today|pulled this week|pullers? today|pullers? this week|pull (?:your side )?(?:today|this week)|"this week"|"today"|'this week'|'today'/i;
  // A silent "daily" default feeding wording is how this bug happened: a missing length must stay missing.
  const DAILY_DEFAULT = /\?\?\s*["']daily["']/;
  const roots = ["src/routes", "src/components", "src/lib"];
  const files: string[] = [];
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(n)) files.push(p);
    }
  };
  roots.forEach(walk);
  it("only rounds.ts words a round's period, and nothing defaults a missing length to daily", () => {
    const hits: string[] = [];
    for (const f of files) {
      if (f.endsWith(join("lib", "rounds.ts")) || f.includes(join("components", "ui"))) continue;
      readFileSync(f, "utf8").split("\n").forEach((line, i) => {
        const code = line.trim();
        if (code.startsWith("//") || code.startsWith("*") || code.startsWith("/*")) return;
        if (PHRASE.test(code) || DAILY_DEFAULT.test(code)) hits.push(`${f}:${i + 1}: ${code.slice(0, 120)}`);
      });
    }
    expect(hits).toEqual([]);
  });
});

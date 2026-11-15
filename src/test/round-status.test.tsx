// Conditional round countdown: calm name, urgent countdown, final hour with extensions. Thresholds come from
// src/lib/round-urgency.ts (weekly urgent under 12 h, daily under 3 h).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { RoundStatus } from "@/components/tugg/RoundStatus";
import { ShoutOuts } from "@/components/tugg/ShoutOuts";
import { closesInLabel, closesInText, FINAL_HOUR_MS, roundUrgency, URGENT_UNDER_MS } from "@/lib/round-urgency";

const NOW = Date.parse("2026-11-15T12:00:00.000Z");
const MIN = 60_000, HR = 3_600_000, DAY = 24 * HR;
const round = (left: number, round_length: "weekly" | "daily", extensions = 0) => ({
  ends_at: new Date(NOW + left).toISOString(),
  round_length,
  extensions,
});
const status = (c: HTMLElement) => c.querySelector("[data-round-status]") as HTMLElement;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("thresholds", () => {
  it("are 12 hours for weekly rounds, 3 hours for daily rounds, final hour at 1 hour", () => {
    expect(URGENT_UNDER_MS).toEqual({ weekly: 12 * HR, daily: 3 * HR });
    expect(FINAL_HOUR_MS).toBe(HR);
    expect(roundUrgency("weekly", round(12 * HR + 1000, "weekly").ends_at, NOW)).toBe("calm");
    expect(roundUrgency("weekly", round(12 * HR - 1000, "weekly").ends_at, NOW)).toBe("urgent");
    expect(roundUrgency("daily", round(3 * HR + 1000, "daily").ends_at, NOW)).toBe("calm");
    expect(roundUrgency("daily", round(59 * MIN, "daily").ends_at, NOW)).toBe("final");
  });
});

describe("RoundStatus", () => {
  it("weekly round with 5 days left: round name only, no countdown", () => {
    const { container } = render(<RoundStatus round={round(5 * DAY, "weekly")} />);
    expect(status(container).getAttribute("data-round-status")).toBe("calm");
    expect(container.textContent).toBe("This week's round");
    expect(container.querySelector("[data-round-ticker]")).toBeNull();
    expect(container.textContent).not.toMatch(/\d/);
  });

  it("weekly round with 6 hours left: live countdown", () => {
    const { container } = render(<RoundStatus round={round(6 * HR + 4 * MIN + 9000, "weekly")} />);
    expect(status(container).getAttribute("data-round-status")).toBe("urgent");
    expect(container.querySelector("[data-round-ticker]")!.textContent).toBe("Closes in 6h 04m 09s");
    expect(status(container).getAttribute("aria-label")).toBe("Closes in about 6 hours");
    act(() => vi.advanceTimersByTime(2000));
    expect(container.querySelector("[data-round-ticker]")!.textContent).toBe("Closes in 6h 04m 07s");
  });

  it("daily round with 6 hours left: round name, not the countdown", () => {
    const { container } = render(<RoundStatus round={round(6 * HR, "daily")} />);
    expect(status(container).getAttribute("data-round-status")).toBe("calm");
    expect(container.textContent).toBe("Today's round");
    expect(container.querySelector("[data-round-ticker]")).toBeNull();
  });

  it("daily round with 2 hours left: live countdown", () => {
    const { container } = render(<RoundStatus round={round(2 * HR, "daily")} />);
    expect(status(container).getAttribute("data-round-status")).toBe("urgent");
    expect(container.textContent).toBe("Closes in 2h 00m 00s");
  });

  it("final hour shows the extension note only when the round was extended", () => {
    const extended = render(<RoundStatus round={round(42 * MIN, "weekly", 2)} />);
    expect(status(extended.container).getAttribute("data-round-status")).toBe("final");
    expect(extended.container.querySelector("[data-extension-note]")!.textContent).toBe("+20m final hour");
    extended.unmount();

    const plain = render(<RoundStatus round={round(42 * MIN, "weekly", 0)} />);
    expect(status(plain.container).getAttribute("data-round-status")).toBe("final");
    expect(plain.container.textContent).toBe("Closes in 42m 00s");
    expect(plain.container.querySelector("[data-extension-note]")).toBeNull();
  });

  it("never shows the extension note outside the final hour", () => {
    const { container } = render(<RoundStatus round={round(6 * HR, "weekly", 3)} />);
    expect(container.querySelector("[data-extension-note]")).toBeNull();
  });

  it("keeps the per-second ticker out of any live region and gives a coarse label", () => {
    for (const r of [round(6 * HR, "weekly"), round(30 * MIN, "daily", 1)]) {
      const { container, unmount } = render(<RoundStatus round={r} />);
      const ticker = container.querySelector("[data-round-ticker]")!;
      expect(ticker.getAttribute("aria-hidden")).toBe("true");
      for (let el: Element | null = ticker; el; el = el.parentElement) {
        expect(["polite", "assertive"]).not.toContain(el.getAttribute("aria-live"));
        expect(["status", "alert", "log", "marquee"]).not.toContain(el.getAttribute("role"));
      }
      expect(status(container).getAttribute("aria-label")).toMatch(/^Closes in about \d+ (hours?|minutes)/);
      unmount();
    }
  });

  it("uses only factual wording: no exclamation marks or hype", () => {
    const { container } = render(<RoundStatus round={round(10 * MIN, "daily", 3)} />);
    const text = `${container.textContent} ${status(container).getAttribute("aria-label")}`;
    expect(text).not.toMatch(/!|hurry|last chance|don't miss/i);
  });

  it("renders the calm state on the server and hydrates without a mismatch", () => {
    const r = round(2 * HR, "daily");
    const html = renderToString(<RoundStatus round={r} />);
    expect(html).toContain("Today&#x27;s round");
    expect(html).not.toContain("Closes in");
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.appendChild(host);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    act(() => {
      hydrateRoot(host, <RoundStatus round={r} />);
    });
    expect(errors).not.toHaveBeenCalled();
    expect(host.textContent).toBe("Closes in 2h 00m 00s");
    errors.mockRestore();
    host.remove();
  });
});

describe("wording helpers", () => {
  it("rounds the ticking text down and the label coarsely", () => {
    expect(closesInText(3 * HR + 4 * MIN + 59_999)).toBe("3h 04m 59s");
    expect(closesInText(42 * MIN + 9000)).toBe("42m 09s");
    expect(closesInLabel(4 * HR + 12 * MIN)).toBe("Closes in about 4 hours");
    expect(closesInLabel(62 * MIN)).toBe("Closes in about 1 hour");
    expect(closesInLabel(33 * MIN)).toBe("Closes in about 35 minutes");
    expect(closesInLabel(3 * MIN)).toBe("Closes in under 5 minutes");
    expect(closesInLabel(0)).toBe("Closing now");
  });
});

describe("Shout-outs", () => {
  it("say Someone for a buyer with no display name", () => {
    const pull = (id: string, display_name: string | null) => ({ id, side_id: "a", matchup_id: "m", amount_cents: 500, display_name, shout_out: "go", country: null, created_at: new Date(NOW).toISOString() });
    const { container } = render(<ShoutOuts pulls={[pull("1", null), pull("2", "  "), pull("3", "RopeKing")]} sides={[{ id: "a", name: "Messi" }]} />);
    const names = [...container.querySelectorAll("li > span.font-bold")].map((n) => n.textContent);
    expect(names).toEqual(["Someone", "Someone", "RopeKing"]);
    expect(container.textContent).not.toContain("Anonymous");
  });
});

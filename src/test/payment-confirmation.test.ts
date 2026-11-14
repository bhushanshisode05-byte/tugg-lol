import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIRM_MESSAGES, CONFIRM_SCHEDULE, confirmDelay, createConfirmationPoller, isEndPhase, phaseForStatus, type ConfirmState, type PaymentResult } from "@/lib/payments/confirmation";

const paid: PaymentResult = { status: "paid", quantity: 5, refundedPulls: 0 };
const pending: PaymentResult = { status: "pending", quantity: 5, refundedPulls: 0 };

function setup(read: (id: string) => Promise<PaymentResult | null>) {
  const seen: ConfirmState[] = [];
  const poller = createConfirmationPoller({ read, onChange: (s) => seen.push(s) });
  return { poller, seen, phases: () => seen.map((s) => s.phase) };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-11T02:10:44Z")); });
afterEach(() => { vi.useRealTimers(); });

describe("post-payment confirmation", () => {
  it("backs off gently from 1 second, capped at 4 seconds for the first 3 minutes and 15 seconds after, for 10 minutes", () => {
    expect(confirmDelay(0)).toBe(1000);
    expect(confirmDelay(1)).toBe(1150);
    expect(confirmDelay(4)).toBe(1749);
    expect(confirmDelay(9)).toBe(3518);
    expect(confirmDelay(10)).toBe(4000);
    expect(confirmDelay(50)).toBe(4000);
    expect(confirmDelay(50, 179999)).toBe(4000);
    expect(confirmDelay(50, 180000)).toBe(15000);
    expect(confirmDelay(0, 180000)).toBe(1000);
    expect(CONFIRM_SCHEDULE.earlyMaxMs).toBe(4000);
    expect(CONFIRM_SCHEDULE.earlyWindowMs).toBe(180000);
    expect(CONFIRM_SCHEDULE.maxMs).toBe(15000);
    expect(CONFIRM_SCHEDULE.giveUpMs).toBe(600000);
    expect(CONFIRM_SCHEDULE.cancelledGiveUpMs).toBe(90000);
  });

  it("only paid, refunded, failed, expired and needs_review end checking", () => {
    expect(phaseForStatus("paid")).toBe("paid");
    expect(phaseForStatus("refunded")).toBe("paid");
    expect(phaseForStatus("failed")).toBe("failed");
    expect(phaseForStatus("expired")).toBe("failed");
    expect(phaseForStatus("needs_review")).toBe("review");
    expect(phaseForStatus("pending")).toBeNull();
    expect(phaseForStatus(undefined)).toBeNull();
  });

  it("confirmation arriving 79 seconds late (the real 02:10:43 → 02:12:02 order) recovers to paid without any failure", async () => {
    const start = Date.now();
    const read = vi.fn(async () => (Date.now() - start >= 79000 ? paid : pending));
    const { poller, phases } = setup(read);
    poller.track("acfa7a89-1bcd-465f-9b6c-3e2d2319dd03");
    await vi.advanceTimersByTimeAsync(100000);
    expect(poller.state.phase).toBe("paid");
    expect(phases()).not.toContain("failed");
    expect(phases()).not.toContain("slow");
    // At most one check every 4 seconds once warmed up: 25 checks across the first 80 seconds.
    expect(read.mock.calls.length).toBeLessThanOrEqual(26);
  });

  it("a confirmation five minutes late still recovers", async () => {
    const start = Date.now();
    const { poller, phases } = setup(async () => (Date.now() - start >= 5 * 60000 ? paid : pending));
    poller.track("8a5f9998-b895-44c5-bd1d-a7219529b94d");
    await vi.advanceTimersByTimeAsync(5 * 60000 + 16000);
    expect(poller.state.phase).toBe("paid");
    expect(phases()).not.toContain("failed");
  });

  it("network errors and a missing order are treated as still confirming, never as a failed payment", async () => {
    let n = 0;
    const { poller, phases } = setup(async () => { n++; if (n === 2) throw new Error("offline"); if (n === 3) return null; return n >= 5 ? paid : pending; });
    poller.track("o1");
    await vi.advanceTimersByTimeAsync(30000);
    expect(poller.state.phase).toBe("paid");
    expect(phases()).not.toContain("failed");
  });

  it("the checkout window closing after confirmation never puts the screen back to pending (the stuck-screen bug)", async () => {
    const read = vi.fn(async () => paid);
    const { poller } = setup(read);
    poller.track("o1");
    await vi.advanceTimersByTimeAsync(0);
    expect(poller.state.phase).toBe("paid");
    poller.signal("closed");
    poller.signal("status");
    poller.track("o1");
    await vi.advanceTimersByTimeAsync(60000);
    expect(poller.state.phase).toBe("paid");
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("after 10 minutes unconfirmed it stops with the calm note, and Check again resumes until paid", async () => {
    let done = false;
    const read = vi.fn(async () => (done ? paid : pending));
    const { poller, phases } = setup(read);
    poller.track("o1");
    await vi.advanceTimersByTimeAsync(CONFIRM_SCHEDULE.giveUpMs + 20000);
    expect(poller.state.phase).toBe("slow");
    const calls = read.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10 * 60000);
    expect(read.mock.calls.length).toBe(calls); // stopped: no endless polling
    done = true;
    poller.checkAgain();
    await vi.advanceTimersByTimeAsync(0);
    expect(poller.state.phase).toBe("paid");
    expect(phases()).not.toContain("failed");
  });

  it("shows a real failure only when the order is failed or expired", async () => {
    for (const status of ["failed", "expired"]) {
      const { poller } = setup(async () => ({ status, quantity: 5, refundedPulls: 0 }));
      poller.track(`o-${status}`);
      await vi.advanceTimersByTimeAsync(0);
      expect(poller.state.phase).toBe("failed");
    }
  });

  it("closing the window with no sign of payment shows the honest cancelled note and keeps checking", async () => {
    const read = vi.fn(async () => pending);
    const { poller } = setup(read);
    poller.track("o1");
    await vi.advanceTimersByTimeAsync(0);
    poller.signal("closed");
    await vi.advanceTimersByTimeAsync(0);
    expect(poller.state.phase).toBe("cancelled");
    expect(isEndPhase("cancelled")).toBe(false);
    expect(CONFIRM_MESSAGES[poller.state.phase as "cancelled"]).toBe("Checkout closed. Nothing was charged. If you did pay, your pulls will appear here in a moment.");
    const calls = read.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(read.mock.calls.length).toBeGreaterThan(calls); // still checking
  });

  it("from cancelled, a payment that lands 30 seconds later still produces the receipt", async () => {
    let closedAt = 0;
    const { poller, phases } = setup(async () => (closedAt && Date.now() - closedAt >= 30000 ? paid : pending));
    poller.track("o1");
    await vi.advanceTimersByTimeAsync(0);
    poller.signal("closed"); closedAt = Date.now();
    await vi.advanceTimersByTimeAsync(29000);
    expect(poller.state.phase).toBe("cancelled");
    await vi.advanceTimersByTimeAsync(5000);
    expect(poller.state.phase).toBe("paid");
    expect(phases()).not.toContain("slow");
  });

  it("from cancelled with nothing landing, the note disappears shortly after 90 seconds, never 'slow', and reading stops", async () => {
    const read = vi.fn(async () => pending);
    const { poller, phases } = setup(read);
    poller.track("o1");
    await vi.advanceTimersByTimeAsync(0);
    poller.signal("closed");
    await vi.advanceTimersByTimeAsync(89000);
    expect(poller.state.phase).toBe("cancelled");
    await vi.advanceTimersByTimeAsync(1500);
    expect(poller.state.phase).toBe("idle");
    const calls = read.mock.calls.length;
    await vi.advanceTimersByTimeAsync(20 * 60000);
    expect(read.mock.calls.length).toBe(calls);
    poller.checkAgain(); // tab becomes visible again
    poller.track("o1"); // a late repeat of the same order
    await vi.advanceTimersByTimeAsync(60000);
    expect(read.mock.calls.length).toBe(calls);
    expect(poller.state.phase).toBe("idle");
    expect(phases()).not.toContain("slow");
  });

  it("a close long after opening (past the 10-minute mark) still ends quietly, not with 'slow'", async () => {
    const { poller, phases } = setup(async () => pending);
    poller.track("o1");
    await vi.advanceTimersByTimeAsync(9.5 * 60000);
    poller.signal("closed");
    await vi.advanceTimersByTimeAsync(2 * 60000);
    expect(poller.state.phase).toBe("idle");
    expect(phases().slice(phases().lastIndexOf("cancelled"))).toEqual(["cancelled", "idle"]);
  });

  it("status then closed shows the paid-wording closed note and the full 10-minute path still ends at 'slow'", async () => {
    const { poller, phases } = setup(async () => pending);
    poller.track("o1");
    await vi.advanceTimersByTimeAsync(0);
    poller.signal("status");
    poller.signal("closed");
    await vi.advanceTimersByTimeAsync(0);
    expect(poller.state.phase).toBe("closed");
    await vi.advanceTimersByTimeAsync(5 * 60000);
    expect(poller.state.phase).toBe("closed");
    await vi.advanceTimersByTimeAsync(5 * 60000 + 20000);
    expect(poller.state.phase).toBe("slow");
    expect(phases()).not.toContain("cancelled");
    expect(phases()).not.toContain("idle");
  });

  it("a status signal arriving while cancelled moves to closed and the long path", async () => {
    const { poller } = setup(async () => pending);
    poller.track("o1");
    await vi.advanceTimersByTimeAsync(0);
    poller.signal("closed");
    await vi.advanceTimersByTimeAsync(10000);
    expect(poller.state.phase).toBe("cancelled");
    poller.signal("status");
    await vi.advanceTimersByTimeAsync(0);
    expect(poller.state.phase).toBe("closed");
    await vi.advanceTimersByTimeAsync(5 * 60000);
    expect(poller.state.phase).toBe("closed"); // well past 90 seconds, still checking
  });

  it("a returning redirect (track with no signal) keeps 'checking' and the full 10-minute window", async () => {
    const { poller, phases } = setup(async () => pending);
    poller.track("o-redirect");
    await vi.advanceTimersByTimeAsync(5 * 60000);
    expect(poller.state.phase).toBe("checking");
    await vi.advanceTimersByTimeAsync(5 * 60000 + 20000);
    expect(poller.state.phase).toBe("slow");
    expect(phases()).not.toContain("cancelled");
  });
  it("with no checkout-window signal at all, a payment confirmed 90 seconds in shows within 4 seconds", async () => {
    const start = Date.now();
    let shownAt = 0;
    const read = vi.fn(async () => (Date.now() - start >= 90000 ? paid : pending));
    const poller = createConfirmationPoller({ read, onChange: (s) => { if (s.phase === "paid") shownAt = Date.now() - start; } });
    poller.track("o-silent");
    await vi.advanceTimersByTimeAsync(120000);
    expect(poller.state.phase).toBe("paid");
    expect(shownAt - 90000).toBeLessThanOrEqual(4000);
  });

  it("a signal after the backoff has widened to 15 seconds checks now and then again 1 second later, not 15", async () => {
    const read = vi.fn(async () => pending);
    const { poller } = setup(read);
    poller.track("o1");
    await vi.advanceTimersByTimeAsync(200000); // past the 3-minute early window: gaps are now 15 seconds
    const calls = read.mock.calls.length;
    poller.signal("closed");
    await vi.advanceTimersByTimeAsync(0);
    expect(read.mock.calls.length).toBe(calls + 1); // immediate check
    await vi.advanceTimersByTimeAsync(999);
    expect(read.mock.calls.length).toBe(calls + 1);
    await vi.advanceTimersByTimeAsync(1);
    expect(read.mock.calls.length).toBe(calls + 2); // next gap is 1 second
    await vi.advanceTimersByTimeAsync(1150);
    expect(read.mock.calls.length).toBe(calls + 3);
  });

  it("a signal inside the early window also restarts the short gaps", async () => {
    const read = vi.fn(async () => pending);
    const { poller } = setup(read);
    poller.track("o1");
    await vi.advanceTimersByTimeAsync(60000); // gaps are at the 4-second early ceiling
    const calls = read.mock.calls.length;
    poller.signal("status");
    await vi.advanceTimersByTimeAsync(1000);
    expect(read.mock.calls.length).toBe(calls + 2);
  });

  it("Check again (tab visible) restarts the short gaps even when not in the calm note", async () => {
    const read = vi.fn(async () => pending);
    const { poller } = setup(read);
    poller.track("o1");
    await vi.advanceTimersByTimeAsync(200000);
    const calls = read.mock.calls.length;
    poller.checkAgain();
    await vi.advanceTimersByTimeAsync(1000);
    expect(read.mock.calls.length).toBe(calls + 2);
  });

  it("repeated checkout-window signals never extend the 10-minute give-up deadline", async () => {
    const read = vi.fn(async () => pending);
    const { poller } = setup(read);
    poller.track("o1");
    for (let i = 0; i < 70; i++) { await vi.advanceTimersByTimeAsync(10000); if (poller.state.phase !== "slow") poller.signal("status"); }
    expect(poller.state.phase).toBe("slow");
  });
});

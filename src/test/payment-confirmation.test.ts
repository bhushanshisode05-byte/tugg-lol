import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIRM_SCHEDULE, confirmDelay, createConfirmationPoller, phaseForStatus, type ConfirmState, type PaymentResult } from "@/lib/payments/confirmation";

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
  it("backs off gradually from 2 seconds to a 15 second cap and keeps checking for 10 minutes", () => {
    expect(confirmDelay(0)).toBe(2000);
    expect(confirmDelay(1)).toBe(2500);
    expect(confirmDelay(4)).toBe(4883);
    expect(confirmDelay(50)).toBe(15000);
    expect(CONFIRM_SCHEDULE.giveUpMs).toBe(600000);
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
    // Gentle on the server: about a dozen checks across 80 seconds rather than one every 4 seconds.
    expect(read.mock.calls.length).toBeLessThanOrEqual(13);
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

  it("a buyer closing the window before paying keeps checking with the neutral closed note", async () => {
    const { poller } = setup(async () => pending);
    poller.track("o1");
    await vi.advanceTimersByTimeAsync(0);
    poller.signal("closed");
    await vi.advanceTimersByTimeAsync(0);
    expect(poller.state.phase).toBe("closed");
  });
});

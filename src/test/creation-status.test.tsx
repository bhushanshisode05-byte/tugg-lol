// The $9/$29 create-matchup status uses the shared post-payment poller: it keeps checking well past the old 40-second
// cut-off, shows "Checkout closed. Nothing was charged." for an abandoned checkout, and never reads a moderation
// delay as a rejection. The Dodo statement line sits beside the pay button.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";

const mocks = vi.hoisted(() => ({
  search: {} as { session_id?: string },
  status: vi.fn(),
  checkout: vi.fn(),
  overlay: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("@tanstack/react-start", async (orig) => ({ ...(await orig<typeof import("@tanstack/react-start")>()), useServerFn: (f: unknown) => f }));
vi.mock("@tanstack/react-router", async (orig) => ({
  ...(await orig<typeof import("@tanstack/react-router")>()),
  createFileRoute: () => (opts: any) => ({ options: opts, useSearch: () => mocks.search }),
  useNavigate: () => mocks.navigate,
  Link: ({ children, ...p }: any) => <a href={String(p.to)}>{children}</a>,
}));
vi.mock("@/lib/tugg.functions", () => ({ createMatchupCheckout: mocks.checkout, getCreationStatus: mocks.status }));
vi.mock("@/lib/payments.functions", () => ({ getPaymentStatus: async () => ({ ready: true, paused: false, provider: "dodo", message: "" }) }));
vi.mock("@/lib/payments/dodo-overlay", () => ({ openDodoOverlay: mocks.overlay }));
vi.mock("@/components/tugg/Shell", () => ({ Shell: ({ children }: any) => <>{children}</> }));
vi.mock("@/components/tugg/SideAvatar", () => ({ SideAvatar: () => null }));
vi.mock("@/components/tugg/Rope", () => ({ Rope: () => null }));
vi.mock("@/components/tugg/SideImageField", () => ({ SideImageField: () => null }));
vi.mock("@/components/tugg/Turnstile", () => ({ Turnstile: ({ onToken }: any) => { useEffect(() => onToken("tok"), [onToken]); return null; } }));

import { Route as CreateRoute } from "@/routes/create";
import { createConfirmationPoller, type ConfirmState } from "@/lib/payments/confirmation";
import { CREATION_MESSAGES, creationConfirmed, creationPhase, creationResult, type CreationResult } from "@/lib/payments/creation-status";

const ORDER = "12345678-1234-4234-8234-123456789abc";
const DESCRIPTOR = "Payments are processed by Dodo Payments as merchant of record. Your card or bank statement will show the charge from Dodo Payments, not Tugg.";
const row = (status: string, matchup: string, extra: Record<string, unknown> = {}) => creationResult({ status, refund_status: null, review_reason: null, matchups: { slug: "tacos-vs-sushi", status: matchup, title: "Tacos vs Sushi" }, ...extra });
const CreatePage = () => { const C = (CreateRoute as any).options.component; return <C />; };
const flush = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => { vi.useFakeTimers(); mocks.search = {}; mocks.status.mockReset(); mocks.checkout.mockReset(); mocks.overlay.mockReset(); mocks.navigate.mockReset(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("creation outcome from the stored order", () => {
  it("maps stored states to outcomes; only live, rejected, refunded and failed end checking", () => {
    expect(row("pending", "pending_payment")).toMatchObject({ status: "waiting", paid: false });
    expect(row("paid", "pending_review")).toMatchObject({ status: "waiting", paid: true, delayed: false });
    expect(row("paid", "pending_review", { moderation_failures: 2 })).toMatchObject({ status: "waiting", delayed: true });
    expect(row("paid", "active")!.status).toBe("live");
    expect(row("paid", "rejected", { review_reason: "Politicians" })).toMatchObject({ status: "rejected", reason: "Politicians" });
    expect(row("paid", "pending_review", { refund_status: "succeeded" })!.status).toBe("refunded");
    expect(row("expired", "pending_payment")!.status).toBe("failed");
    expect(creationResult(null)).toBeNull();
    expect(creationPhase(row("paid", "pending_review")!)).toBeNull();
    expect(creationPhase(row("paid", "active")!)).toBe("paid");
    expect(creationPhase(row("paid", "rejected")!)).toBe("paid");
    expect(creationPhase(row("failed", "pending_payment")!)).toBe("failed");
  });

  it("keeps checking past 40 seconds and picks up a result that lands 5 minutes later", async () => {
    const start = Date.now();
    const read = vi.fn(async () => (Date.now() - start >= 5 * 60_000 ? row("paid", "active") : row("paid", "pending_review")));
    const seen: ConfirmState<CreationResult>[] = [];
    const p = createConfirmationPoller<CreationResult>({ read, phaseFor: creationPhase, confirmed: creationConfirmed, onChange: (s) => seen.push(s) });
    p.track(ORDER);
    await vi.advanceTimersByTimeAsync(41_000);
    const at41 = read.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(read.mock.calls.length).toBeGreaterThan(at41);
    expect(p.state.phase).toBe("checking");
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(p.state.phase).toBe("paid");
    expect(p.state.result?.status).toBe("live");
    expect(seen.some((s) => s.phase === "failed")).toBe(false);
  });

  it("a quiet close stops silently after 90 seconds, but a stored payment keeps checking on the full path", async () => {
    const unpaid = createConfirmationPoller<CreationResult>({ read: async () => row("pending", "pending_payment"), phaseFor: creationPhase, confirmed: creationConfirmed, onChange: () => {} });
    unpaid.track(ORDER); unpaid.signal("closed");
    await vi.advanceTimersByTimeAsync(1000);
    expect(unpaid.state.phase).toBe("cancelled");
    await vi.advanceTimersByTimeAsync(91_000);
    expect(unpaid.state.phase).toBe("idle");

    const paid = createConfirmationPoller<CreationResult>({ read: async () => row("paid", "pending_review"), phaseFor: creationPhase, confirmed: creationConfirmed, onChange: () => {} });
    paid.track(ORDER); paid.signal("closed");
    await vi.advanceTimersByTimeAsync(120_000);
    expect(paid.state.phase).toBe("closed");
  });
});

describe("create page", () => {
  const fillAndPay = async () => {
    const view = render(<CreatePage />);
    await flush(0);
    const [a, b] = screen.getAllByPlaceholderText("Name");
    fireEvent.change(a!, { target: { value: "Tacos" } });
    fireEvent.change(b!, { target: { value: "Sushi" } });
    await flush(0);
    return view;
  };

  it("shows the Dodo statement line directly after the pay button, in plain view", async () => {
    const view = await fillAndPay();
    const pay = screen.getByRole("button", { name: /^Pay \$9 and submit/ });
    const line = view.container.querySelector("[data-payment-descriptor]")!;
    expect(line.textContent).toBe(DESCRIPTOR);
    expect(pay.nextElementSibling).toBe(line);
    expect(line.closest("details,[role=tooltip]")).toBeNull();
  });

  it("an abandoned checkout says nothing was charged, keeps the buyer's entries and can be dismissed", async () => {
    mocks.checkout.mockResolvedValue({ url: "https://test.checkout.dodopayments.com/x", orderId: ORDER, environment: "sandbox" });
    let event: (e: string) => void = () => {};
    mocks.overlay.mockImplementation(async (_u: string, _e: string, cb: (e: string) => void) => { event = cb; return true; });
    mocks.status.mockResolvedValue(row("pending", "pending_payment"));
    await fillAndPay();
    fireEvent.click(screen.getByRole("button", { name: /^Pay \$9 and submit/ }));
    await flush(0);
    expect(screen.getByText(CREATION_MESSAGES.checking)).toBeTruthy();
    act(() => event("closed"));
    await flush(1500);
    expect(screen.getByText(CREATION_MESSAGES.cancelled)).toBeTruthy();
    expect(screen.queryByText("Checking your matchup…")).toBeNull();
    expect((screen.getAllByPlaceholderText("Name")[0] as HTMLInputElement).value).toBe("Tacos");
    expect(mocks.navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText(CREATION_MESSAGES.cancelled)).toBeNull();
  });

  it("a return from checkout keeps checking past 40 seconds, shows the moderation delay honestly, then goes live", async () => {
    mocks.search = { session_id: ORDER };
    const start = Date.now();
    mocks.status.mockImplementation(async () => (Date.now() - start >= 4 * 60_000 ? row("paid", "active") : row("paid", "pending_review", { moderation_failures: 1 })));
    render(<CreatePage />);
    expect(screen.getByText("Checking your matchup…")).toBeTruthy();
    await flush(45_000);
    expect(screen.getByText(CREATION_MESSAGES.delayed)).toBeTruthy();
    expect(screen.queryByText("Not approved")).toBeNull();
    await flush(4 * 60_000);
    expect(screen.getByText("It's live! 🎉")).toBeTruthy();
  });

  it("after 10 minutes without an answer shows the calm note with Check again, never a failure", async () => {
    mocks.search = { session_id: ORDER };
    mocks.status.mockResolvedValue(row("pending", "pending_payment"));
    render(<CreatePage />);
    await flush(10 * 60_000 + 20_000);
    expect(screen.getByText(CREATION_MESSAGES.slow)).toBeTruthy();
    const calls = mocks.status.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await flush(0);
    expect(mocks.status.mock.calls.length).toBe(calls + 1);
    expect(screen.queryByText("Payment not completed")).toBeNull();
  });
});

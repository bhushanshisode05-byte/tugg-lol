import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
const mocks = vi.hoisted(() => ({ getPaymentStatus: vi.fn() }));
vi.mock("@/lib/payments.functions", () => ({ getPaymentStatus: mocks.getPaymentStatus }));
vi.mock("@/lib/immediate-payments.functions", () => ({ buyImmediateBundle: vi.fn(), getImmediatePayment: vi.fn(), recordPaymentFunnel: vi.fn(async () => {}), getCodeDropConfig: vi.fn(async () => ({ environment: "sandbox", codedropId: "" })) }));
vi.mock("@/lib/basket-payments.functions", () => ({ buyPullBasket: vi.fn(), listBasketMatchups: vi.fn(async () => []) }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (f: unknown) => f }));
vi.mock("@/components/tugg/ShareButton", () => ({ ShareButton: () => null }));
vi.mock("@/components/tugg/Turnstile", () => ({ Turnstile: ({ onToken }: any) => <button onClick={() => onToken("fixture")}>Security passed</button> }));
vi.mock("@/components/tugg/SideAvatar", () => ({ SideAvatar: () => null }));
vi.mock("@/lib/payments/dodo-overlay", () => ({ openDodoOverlay: vi.fn(async () => true) }));
import { PullPanel } from "@/components/tugg/PullPanel";

const sides: any[] = [{ id: "12345678-1234-4234-8234-123456789abc", name: "Pizza", emoji: "🍕" }, { id: "22345678-1234-4234-8234-123456789abc", name: "Burgers", emoji: "🍔" }];
const panel = () => render(<PullPanel matchupId="32345678-1234-4234-8234-123456789abc" title="Pizza vs Burgers" sides={sides} slug="pizza-vs-burgers" paused={false} onPulled={vi.fn()} />);
const payButton = () => screen.getByRole("button", { name: /Pay \$5 · 5 pulls/ });

beforeEach(() => { mocks.getPaymentStatus.mockReset(); history.replaceState(null, "", "/"); });

it("while the status call is in flight there is no not-configured text and the pay button is disabled", () => {
  mocks.getPaymentStatus.mockReturnValue(new Promise(() => {}));
  panel();
  expect(screen.queryByText(/not configured/i)).toBeNull();
  expect(screen.queryByText(/unavailable/i)).toBeNull();
  expect(screen.getByText(/Checking checkout availability/)).toBeInTheDocument();
  expect(payButton()).toBeDisabled();
});

it("once the status resolves ready the buttons enable and no error text is present", async () => {
  mocks.getPaymentStatus.mockResolvedValue({ environment: "sandbox", provider: "dodo", ready: true, basket: false, paused: false, message: "" });
  panel();
  fireEvent.click(screen.getByText("Security passed"));
  await waitFor(() => expect(payButton()).not.toBeDisabled());
  expect(screen.queryByText(/not configured/i)).toBeNull();
  expect(screen.queryByText(/Checking checkout availability/)).toBeNull();
});

it("once the status resolves not-ready the real not-configured message appears", async () => {
  mocks.getPaymentStatus.mockResolvedValue({ environment: "sandbox", provider: "dodo", ready: false, basket: false, paused: false, message: "Dodo checkout is not configured yet. No payment has been taken. Please try again later." });
  panel();
  await screen.findByText(/not configured yet/i);
  expect(payButton()).toBeDisabled();
});

it("a failed status call shows a neutral retry state and never claims checkout is unconfigured", async () => {
  mocks.getPaymentStatus.mockRejectedValueOnce(new Error("network"));
  panel();
  await screen.findByText(/Couldn't check availability/);
  expect(screen.queryByText(/not configured/i)).toBeNull();
  expect(payButton()).toBeDisabled();
  mocks.getPaymentStatus.mockResolvedValue({ environment: "sandbox", provider: "dodo", ready: true, basket: false, paused: false, message: "" });
  fireEvent.click(screen.getByText("Security passed"));
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(payButton()).not.toBeDisabled());
  expect(mocks.getPaymentStatus).toHaveBeenCalledTimes(2);
});

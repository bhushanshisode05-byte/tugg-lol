import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
const mocks = vi.hoisted(() => ({
  getPaymentStatus: vi.fn(),
  getWallet: vi.fn(),
  spendPulls: vi.fn(),
  buyPullPack: vi.fn(),
}));
vi.mock("@/lib/payments.functions", () => mocks);
vi.mock("@/lib/immediate-payments.functions", () => ({ buyImmediateBundle: vi.fn(), getImmediatePayment: vi.fn(), recordPaymentFunnel: vi.fn(async()=>{}), getCodeDropConfig: vi.fn(async()=>({environment:"sandbox",codedropId:""})) }));
vi.mock("@/lib/basket-payments.functions", () => ({ buyPullBasket: vi.fn(), listBasketMatchups: vi.fn(async()=>[]) }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (f: unknown) => f }));
vi.mock("@/components/tugg/ShareButton", () => ({ ShareButton: () => null }));
vi.mock("@/components/tugg/Turnstile", () => ({
  Turnstile: ({ onToken }: any) => (
    <button onClick={() => onToken("public-turnstile-fixture")}>Mock security check</button>
  ),
}));
vi.mock("@/components/tugg/SideAvatar", () => ({ SideAvatar: () => null }));
import { PullPanel } from "@/components/tugg/PullPanel";
const sides: any[] = [
  { id: "12345678-1234-4234-8234-123456789abc", name: "Pizza" },
  { id: "22345678-1234-4234-8234-123456789abc", name: "Burgers" },
];
beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, "", "/");
  Object.values(mocks).forEach((f) => f.mockReset());
  mocks.getPaymentStatus.mockResolvedValue({ environment: "sandbox", provider: "dodo", pullMode: "wallet", ready: true });
  mocks.getWallet.mockResolvedValue({ balance: 10, flagged: false, paid: true });
});
describe("legacy wallets stay unreachable", () => {
  it("does not restore a wallet or offer spending even with legacy storage and configuration", async () => {
    const credential = "c".repeat(64);
    history.replaceState(null, "", `/#wallet=${credential}`);
    mocks.spendPulls.mockResolvedValue({ balance: 9, duplicate: false });
    const pulled = vi.fn();
    render(<PullPanel matchupId="32345678-1234-4234-8234-123456789abc" title="Pizza vs Burgers" sides={sides} slug="pizza-vs-burgers" paused={false} onPulled={pulled} />);
    await waitFor(()=>expect(mocks.getPaymentStatus).toHaveBeenCalled());
    expect(mocks.getWallet).not.toHaveBeenCalled();
    expect(mocks.spendPulls).not.toHaveBeenCalled();
    expect(mocks.buyPullPack).not.toHaveBeenCalled();
    expect(localStorage.getItem("tugg-wallet-sandbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "×10 · $10" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Wallet recovery link" })).toBeNull();
  });
  it("missing Dodo setup disables all three pack purchases", async () => {
    mocks.getPaymentStatus.mockResolvedValue({ environment: "sandbox", provider: "dodo", pullMode: "wallet", ready: false });
    render(<PullPanel matchupId="32345678-1234-4234-8234-123456789abc" title="Pizza vs Burgers" sides={sides} slug="pizza-vs-burgers" paused={false} onPulled={vi.fn()} />);
    await screen.findByText(/Dodo checkout is not configured yet/);
    for (const p of [5, 10, 25])
      expect(screen.getByRole("button", { name: `$${p} ${p} pulls` })).toBeEnabled();
    expect(screen.getByRole("button", {name: /Pay \$5/})).toBeDisabled();
    expect(mocks.buyPullPack).not.toHaveBeenCalled();
  });
});

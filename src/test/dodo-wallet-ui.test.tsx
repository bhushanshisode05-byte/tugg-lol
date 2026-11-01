import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
const mocks = vi.hoisted(() => ({ getPaymentStatus: vi.fn(), getWallet: vi.fn(), spendPulls: vi.fn(), buyPullPack: vi.fn() }));
vi.mock("@/lib/payments.functions", () => mocks);
vi.mock("@tanstack/react-start", () => ({ useServerFn: (f: unknown) => f }));
vi.mock("@/components/tugg/Turnstile", () => ({ Turnstile: ({ onToken }: any) => <button onClick={() => onToken("public-turnstile-fixture")}>Mock security check</button> }));
vi.mock("@/components/tugg/SideAvatar", () => ({ SideAvatar: () => null }));
import { PullPanel } from "@/components/tugg/PullPanel";
const sides: any[] = [{ id: "12345678-1234-4234-8234-123456789abc", name: "Pizza" }, { id: "22345678-1234-4234-8234-123456789abc", name: "Burgers" }];
beforeEach(() => {
 localStorage.clear(); history.replaceState(null, "", "/"); Object.values(mocks).forEach((f) => f.mockReset());
 mocks.getPaymentStatus.mockResolvedValue({ environment: "sandbox", ready: true }); mocks.getWallet.mockResolvedValue({ balance: 10, flagged: false, paid: true });
});
describe("wallet recovery and one-tap UI", () => {
 it("restores a private fragment wallet, spends one pull and reads remaining balance", async () => {
  const credential = "c".repeat(64); history.replaceState(null, "", `/#wallet=${credential}`);
  mocks.spendPulls.mockResolvedValue({ balance: 9, duplicate: false }); const pulled = vi.fn();
  render(<PullPanel sides={sides} slug="pizza-vs-burgers" paused={false} onPulled={pulled} />);
  await screen.findByText("10 pulls remaining");
  expect(location.hash).toBe(""); expect(localStorage.getItem("tugg-wallet-sandbox")).toBe(credential);
  expect(screen.getByRole("button", { name: "×10 · $10" })).toBeInTheDocument();
  fireEvent.click(screen.getByText("Mock security check")); fireEvent.click(screen.getByRole("button", { name: "Pull $1 for Pizza" }));
  await screen.findByText("9 pulls remaining"); expect(pulled).toHaveBeenCalledTimes(1);
  expect(mocks.spendPulls).toHaveBeenCalledWith({ data: expect.objectContaining({ token: credential, quantity: 1, sideId: sides[0].id, turnstileToken: "public-turnstile-fixture" }) });
  expect(screen.queryByRole("button", { name: "×10 · $10" })).toBeNull();
  expect(screen.getByRole("textbox", { name: "Wallet recovery link" })).toHaveValue(expect.stringContaining("#wallet="));
 });
 it("missing Dodo setup disables all three pack purchases", async () => {
  mocks.getPaymentStatus.mockResolvedValue({ environment: "sandbox", ready: false });
  render(<PullPanel sides={sides} slug="pizza-vs-burgers" paused={false} onPulled={vi.fn()} />);
  await screen.findByText(/Dodo checkout is not configured yet/);
  for (const p of [5, 10, 25]) expect(screen.getByRole("button", { name: `$${p} ${p} pulls` })).toBeDisabled();
  expect(mocks.buyPullPack).not.toHaveBeenCalled();
 });
});
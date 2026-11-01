// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ verify: vi.fn(), rpc: vi.fn(), provider: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    inputValidator() {
      return this;
    },
    handler(fn: any) {
      return (arg: any) => fn(arg);
    },
  }),
}));
vi.mock("@/lib/turnstile.server", () => ({ verifyTurnstileForRequest: mocks.verify }));
vi.mock("@/lib/payments/dodo.server", () => ({
  createDodoProvider: mocks.provider,
  dodoSettings: vi.fn(),
  productId: vi.fn(() => "p5"),
}));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: mocks.rpc } }));
import { buyPullPack, spendPulls } from "@/lib/payments.functions";
beforeEach(() => {
  vi.stubEnv("PAUSE_PULLS", "false");
  mocks.verify.mockReset();
  mocks.rpc.mockReset();
  mocks.provider.mockReset();
});
describe("wallet payment guards", () => {
  it("PAUSE_PULLS blocks spending before verification or debit", async () => {
    vi.stubEnv("PAUSE_PULLS", "true");
    expect(await spendPulls({ data: {} as any })).toHaveProperty(
      "error",
      "Pulls are paused right now. Please try again later.",
    );
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("PAUSE_PULLS blocks buying before provider calls", async () => {
    vi.stubEnv("PAUSE_PULLS", "true");
    expect(await buyPullPack({ data: {} as any })).toHaveProperty("error");
    expect(mocks.provider).not.toHaveBeenCalled();
  });
  it("failed Turnstile prevents wallet debit", async () => {
    mocks.verify.mockRejectedValue(new Error("Please complete the security check."));
    const r = await spendPulls({
      data: {
        token: "a".repeat(64),
        sideId: "12345678-1234-4234-8234-123456789abc",
        quantity: 1,
        requestId: "12345678-1234-4234-8234-123456789abc",
        name: "",
        shout: "",
      },
    });
    expect(r).toHaveProperty("error", "Please complete the security check.");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("failed Turnstile prevents pack order and checkout", async () => {
    const checkout = vi.fn();
    mocks.provider.mockReturnValue({ validateProduct: vi.fn(), checkout });
    mocks.verify.mockRejectedValue(new Error("Security failed"));
    expect(
      await buyPullPack({ data: { pack: 5, returnUrl: "https://tugg.lol/m/test" } }),
    ).toHaveProperty("error", "Security failed");
    expect(checkout).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

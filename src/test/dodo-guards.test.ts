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
import { buyPullPack, spendPulls, getWallet } from "@/lib/payments.functions";
import { config } from "@/lib/server-utils.server";
beforeEach(() => {
  vi.stubEnv("PAYMENT_PROVIDER", "dodo");
  vi.stubEnv("PULL_MODE", "wallet");
  vi.stubEnv("PAUSE_PULLS", "false");
  mocks.verify.mockReset();
  mocks.rpc.mockReset();
  mocks.provider.mockReset();
});
describe("wallet endpoints are permanently dormant", () => {
  it("forces immediate even if PULL_MODE requests wallet", () => {
    expect(config().pullMode).toBe("immediate");
  });
  it.each([getWallet,buyPullPack,spendPulls])("rejects wallet operations before any side effect",async fn=>{
    const result=await fn({data:{} as never});
    expect(result).toHaveProperty("error");
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.provider).not.toHaveBeenCalled();
  });
});

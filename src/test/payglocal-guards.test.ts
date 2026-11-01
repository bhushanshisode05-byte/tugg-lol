// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({verify:vi.fn(),ready:vi.fn(),provider:vi.fn()}));
vi.mock("@tanstack/react-start",()=>({createServerFn:()=>({inputValidator(){return this;},handler(fn:any){return (arg:any)=>fn(arg);}})}));
vi.mock("@/lib/turnstile.server",()=>({verifyTurnstileForRequest:mocks.verify}));
vi.mock("@/lib/payments/selection.server",()=>({paymentReadiness:mocks.ready,selectedProvider:mocks.provider}));
import { buyImmediateBundle } from "@/lib/immediate-payments.functions";
beforeEach(()=>{vi.stubEnv("PAUSE_PULLS","false");vi.stubEnv("PAYMENT_PROVIDER","payglocal");vi.stubEnv("PULL_MODE","immediate");mocks.verify.mockReset();mocks.ready.mockReset();mocks.provider.mockReset();});
it("PAUSE_PULLS blocks checkout before verification or any side effect",async()=>{vi.stubEnv("PAUSE_PULLS","true");expect(await buyImmediateBundle({data:{} as any})).toEqual({error:"Pulls are paused right now. Please try again later."});expect(mocks.ready).not.toHaveBeenCalled();expect(mocks.verify).not.toHaveBeenCalled();});
it("missing credentials fail closed before Turnstile or payment",async()=>{mocks.ready.mockImplementation(()=>{throw new Error("PayGlocal checkout is not configured yet.");});expect(await buyImmediateBundle({data:{} as any})).toHaveProperty("error","PayGlocal checkout is not configured yet.");expect(mocks.verify).not.toHaveBeenCalled();expect(mocks.provider).not.toHaveBeenCalled();});
it("failed Turnstile never starts checkout",async()=>{mocks.verify.mockRejectedValue(new Error("Security check failed"));const checkout=vi.fn();mocks.provider.mockReturnValue({checkout});expect(await buyImmediateBundle({data:{turnstileToken:"invalid"} as any})).toHaveProperty("error","Security check failed");expect(checkout).not.toHaveBeenCalled();});
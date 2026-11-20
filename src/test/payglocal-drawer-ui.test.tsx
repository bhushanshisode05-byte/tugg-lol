import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
const mocks=vi.hoisted(()=>({buy:vi.fn(),read:vi.fn(),funnel:vi.fn(async()=>{}),config:vi.fn(async()=>({environment:"sandbox",codedropId:"fixture"})),open:vi.fn()}));
vi.mock("@tanstack/react-start",()=>({useServerFn:(f:unknown)=>f}));
vi.mock("@/components/tugg/ShareButton", () => ({ ShareButton: () => null }));
vi.mock("@/lib/immediate-payments.functions",()=>({buyImmediateBundle:mocks.buy,getImmediatePayment:mocks.read,recordPaymentFunnel:mocks.funnel,getCodeDropConfig:mocks.config}));
vi.mock("@/lib/payments/codedrop",()=>({openCodeDrop:mocks.open}));
vi.mock("@/components/tugg/BillingFields",()=>({emptyBilling:{},BillingFields:()=>null}));
vi.mock("@/lib/payments/billing",()=>({billingSchema:{safeParse:()=>({success:true})}}));
vi.mock("@/components/tugg/SideAvatar",()=>({SideAvatar:()=>null}));
vi.mock("@/components/tugg/Turnstile",()=>({Turnstile:({onToken}:any)=><button onClick={()=>onToken("fixture")}>Security passed</button>}));
import { ImmediatePullPanel } from "@/components/tugg/ImmediatePullPanel";
const pulled=vi.fn();
beforeEach(()=>{history.replaceState(null,"","/");vi.stubGlobal("IntersectionObserver",class {observe(){}disconnect(){}});mocks.buy.mockResolvedValue({url:"https://checkout.uat.payglocal.in/test",orderId:"12345678-1234-4234-8234-123456789abc",environment:"sandbox",codedropId:"fixture"});mocks.read.mockResolvedValue({status:"pending",quantity:5});mocks.open.mockReset();mocks.funnel.mockClear();pulled.mockClear();});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
async function checkout(){render(<ImmediatePullPanel sides={[{id:"12345678-1234-4234-8234-123456789abc",name:"Pizza"}] as any} slug="pizza" paused={false} onPulled={pulled} status="ready" message="" onRetry={() => {}}/>);fireEvent.click(screen.getByText("Security passed"));fireEvent.click(screen.getByRole("button",{name:"Pay $5 · 5 pulls for Pizza"}));await waitFor(()=>expect(mocks.open).toHaveBeenCalled());}
it("drawer completed callback never applies pulls before server confirmation",async()=>{mocks.open.mockImplementation(async(_d,cb)=>{cb("completed");return true;});await checkout();await screen.findByText("Confirming your payment… This usually takes under a minute. Please don't pay again.");expect(pulled).not.toHaveBeenCalled();expect(mocks.funnel).toHaveBeenCalledWith({data:expect.objectContaining({step:"opened",mode:"drawer",bundle:5})});});
it("cancelled drawer records cancellation and keeps the rope unchanged",async()=>{mocks.open.mockImplementation(async(_d,cb)=>{setTimeout(()=>cb("cancelled"),0);return true;});await checkout();await waitFor(()=>expect(mocks.funnel).toHaveBeenCalledWith({data:expect.objectContaining({step:"cancelled",mode:"drawer"})}));expect(pulled).not.toHaveBeenCalled();});
it("server confirmed capture refreshes the rope and shows visitor pulls",async()=>{mocks.read.mockResolvedValue({status:"paid",quantity:5});mocks.open.mockResolvedValue(true);await checkout();await screen.findByText("5 pulls applied to your chosen side.");expect(pulled).toHaveBeenCalledTimes(1);});

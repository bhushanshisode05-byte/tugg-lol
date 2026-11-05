import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({initialize:vi.fn(),open:vi.fn(),isOpen:vi.fn()}));
vi.mock("dodopayments-checkout",()=>({DodoPayments:{Initialize:mocks.initialize,Checkout:{open:mocks.open,isOpen:mocks.isOpen}}}));
import { openDodoOverlay } from "@/lib/payments/dodo-overlay";
beforeEach(()=>{mocks.initialize.mockReset();mocks.open.mockReset();mocks.isOpen.mockReset().mockReturnValue(true);});
it("opens an on-page checkout with manual return and no fulfillment callback",async()=>{
 const changed=vi.fn();expect(await openDodoOverlay("https://checkout.dodopayments.com/test","sandbox",changed)).toBe(true);
 expect(mocks.open).toHaveBeenCalledWith({checkoutUrl:"https://checkout.dodopayments.com/test",options:{manualRedirect:true}});
 const options=mocks.initialize.mock.calls[0]?.[0];expect(options.mode).toBe("test");options.onEvent({event_type:"checkout.status",data:{status:"succeeded"}});expect(changed).toHaveBeenCalledWith("status");
});
it("SDK failure requests normal redirect fallback",async()=>{mocks.open.mockImplementation(()=>{throw new Error("blocked")});expect(await openDodoOverlay("https://checkout.dodopayments.com/test","sandbox",vi.fn())).toBe(false);});
it("external URL never opens the SDK",async()=>{expect(await openDodoOverlay("https://evil.test/pay","sandbox",vi.fn())).toBe(false);expect(mocks.open).not.toHaveBeenCalled();});
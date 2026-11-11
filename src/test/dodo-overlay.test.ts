import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({initialize:vi.fn(),open:vi.fn(),isOpen:vi.fn(),close:vi.fn()}));
vi.mock("dodopayments-checkout",()=>({DodoPayments:{Initialize:mocks.initialize,Checkout:{open:mocks.open,isOpen:mocks.isOpen,close:mocks.close}}}));
import { openDodoOverlay } from "@/lib/payments/dodo-overlay";
beforeEach(()=>{mocks.initialize.mockReset();mocks.open.mockReset();mocks.isOpen.mockReset().mockReturnValue(true);mocks.close.mockReset();});
it("opens an on-page checkout with manual return and no fulfillment callback",async()=>{
 const changed=vi.fn();expect(await openDodoOverlay("https://checkout.dodopayments.com/test","sandbox",changed)).toBe(true);
 expect(mocks.open).toHaveBeenCalledWith({checkoutUrl:"https://checkout.dodopayments.com/test",options:{manualRedirect:true}});
 const options=mocks.initialize.mock.calls[0]?.[0];expect(options.mode).toBe("test");options.onEvent({event_type:"checkout.status",data:{status:"processing"}});expect(changed).toHaveBeenLastCalledWith("status");expect(mocks.close).not.toHaveBeenCalled();
});
it("SDK failure requests normal redirect fallback",async()=>{mocks.open.mockImplementation(()=>{throw new Error("blocked")});expect(await openDodoOverlay("https://checkout.dodopayments.com/test","sandbox",vi.fn())).toBe(false);});
it("external URL never opens the SDK",async()=>{expect(await openDodoOverlay("https://evil.test/pay","sandbox",vi.fn())).toBe(false);expect(mocks.open).not.toHaveBeenCalled();});async function fresh(){vi.resetModules();return (await import("@/lib/payments/dodo-overlay")).openDodoOverlay;}
it("closes Dodo's window when it hands control back, so its processing view never covers the result",async()=>{
 const open=await fresh();const changed=vi.fn();await open("https://checkout.dodopayments.com/test","sandbox",changed);
 const onEvent=mocks.initialize.mock.calls[0]?.[0].onEvent;
 onEvent({event_type:"checkout.redirect_requested",data:{message:{redirect_to:"https://tugg.lol/m/x?payment=1"}}});
 expect(changed).toHaveBeenCalledWith("completed");expect(mocks.close).toHaveBeenCalledTimes(1);
 // The close it triggers is reported as completion, never as a cancellation.
 onEvent({event_type:"checkout.closed",data:{message:"Checkout closed manually"}});
 expect(changed).not.toHaveBeenCalledWith("closed");
});
it("a succeeded status also hands control back; a buyer closing before paying is a plain close",async()=>{
 const open=await fresh();const changed=vi.fn();await open("https://checkout.dodopayments.com/test","sandbox",changed);
 const onEvent=mocks.initialize.mock.calls[0]?.[0].onEvent;
 onEvent({event_type:"checkout.status",data:{message:{status:"succeeded"}}});expect(changed).toHaveBeenCalledWith("completed");expect(mocks.close).toHaveBeenCalledTimes(1);
 const second=vi.fn();await open("https://checkout.dodopayments.com/test2","sandbox",second);
 onEvent({event_type:"checkout.closed",data:{}});expect(second).toHaveBeenCalledWith("closed");expect(second).not.toHaveBeenCalledWith("completed");
});

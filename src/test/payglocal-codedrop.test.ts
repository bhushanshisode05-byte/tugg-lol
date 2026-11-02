import { afterEach, expect, it, vi } from "vitest";
import { drawerResult, openCodeDrop } from "@/lib/payments/codedrop";
import { paymentScriptPolicy } from "@/lib/payments/codedrop-policy";
const input={codedropId:"test-drawer",environment:"sandbox" as const,redirectUrl:"https://checkout.uat.payglocal.in/payment"};
afterEach(()=>{document.querySelectorAll('script[data-tugg-codedrop]').forEach(s=>s.remove());delete window.PGPay;vi.restoreAllMocks();});
it("missing ID leaves redirect checkout",async()=>expect(await openCodeDrop({...input,codedropId:""},vi.fn())).toBe(false));
it("loads the sandbox drawer script on demand and launches with redirectUrl",async()=>{
  const launch=vi.fn(); const pending=openCodeDrop(input,vi.fn());
  const script=document.querySelector<HTMLScriptElement>('script[data-tugg-codedrop]');
  expect(script?.src).toBe("https://codedrop.uat.payglocal.in/simple.js");
  expect(script?.dataset["displayMode"]).toBe("drawer");expect(script?.dataset["cdId"]).toBe("test-drawer");
  window.PGPay={launchPayment:launch};script?.dispatchEvent(new Event("load"));
  expect(await pending).toBe(true);expect(launch).toHaveBeenCalledWith({redirectUrl:input.redirectUrl},expect.any(Function));
});
it("blocked script silently falls back",async()=>{const pending=openCodeDrop(input,vi.fn());document.querySelector('script[data-tugg-codedrop]')?.dispatchEvent(new Event("error"));expect(await pending).toBe(false);});
it("cancellation reports cancellation without claiming payment",async()=>{window.PGPay={launchPayment:(_data,cb)=>cb({status:"CUSTOMER_CANCELLED"})};const cb=vi.fn();expect(await openCodeDrop(input,cb)).toBe(true);expect(cb).toHaveBeenCalledWith("cancelled");});
it.each([["SENT_FOR_CAPTURE","completed"],["ABANDONED","abandoned"],["AUTHORIZED","pending"],["ISSUER_DECLINE","failed"]])("maps %s to %s",(status,result)=>expect(drawerResult(status)).toBe(result));
it("never loads an untrusted redirect host",async()=>expect(await openCodeDrop({...input,redirectUrl:"https://payglocal.in.attacker.test/payment"},vi.fn())).toBe(false));
it("strict policy allows only exact CodeDrop script hosts without wildcard or unsafe script execution",()=>{const policy=paymentScriptPolicy("fixture");expect(policy).toContain("https://codedrop.uat.payglocal.in https://codedrop.payglocal.in");expect(policy).not.toContain("*");expect(policy).not.toContain("unsafe-inline");expect(policy).not.toContain("unsafe-eval");});
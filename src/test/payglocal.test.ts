// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, generateKeyPairSync, sign, verify } from "node:crypto";
import { signPayglocalRequest, verifyPayglocalToken } from "@/lib/payments/payglocal-crypto";
import { createPayglocalProvider, normalizePayglocal, payglocalSettings } from "@/lib/payments/payglocal.server";
import { paymentReadiness } from "@/lib/payments/selection.server";
import { config, liveOnly } from "@/lib/server-utils.server";
import { PRODUCTS } from "@/lib/payments/catalog";
const merchant=generateKeyPairSync("rsa",{modulusLength:2048}), gateway=generateKeyPairSync("rsa",{modulusLength:2048}), wrong=generateKeyPairSync("rsa",{modulusLength:2048});
const privateKey=merchant.privateKey.export({type:"pkcs8",format:"pem"}).toString();
const cert=gateway.publicKey.export({type:"spki",format:"pem"}).toString();
const billing={firstName:"Test",lastName:"Buyer",emailId:"test@example.test",addressCountry:"USA",addressStreet1:"Test street",addressCity:"Test city",addressState:"Test region",addressPostalCode:"12345"};
const token=(payload:unknown,key=gateway.privateKey)=>{const h=Buffer.from(JSON.stringify({alg:"RS256","is-digested":"false"})).toString("base64url"),p=Buffer.from(JSON.stringify(payload)).toString("base64url"),input=`${h}.${p}`;return `${input}.${sign("RSA-SHA256",Buffer.from(input),key).toString("base64url")}`;};
beforeEach(()=>{
  vi.stubEnv("PAYMENTS_ENV","sandbox");vi.stubEnv("PAYMENT_PROVIDER","payglocal");vi.stubEnv("PULL_MODE","immediate");vi.stubEnv("OWNER_EMAIL","owner@example.test");vi.stubEnv("OWNER_NAME","Test Operator");
  vi.stubEnv("PAYGLOCAL_SANDBOX_MERCHANT_ID","testmid");vi.stubEnv("PAYGLOCAL_SANDBOX_KEY_ID","testkid");vi.stubEnv("PAYGLOCAL_SANDBOX_PRIVATE_KEY",privateKey);vi.stubEnv("PAYGLOCAL_SANDBOX_PUBLIC_CERT",cert);
});
afterEach(()=>vi.unstubAllEnvs());
describe("PayGlocal cryptography and provider",()=>{
  it("signs exact serialized request digest with RS256 documented headers",()=>{
    const body='{"amount":"5.00","currency":"USD"}',t=signPayglocalRequest(body,{merchantId:"testmid",keyId:"testkid",privateKey},1234567890000),[h,p,s]=t.split(".");
    expect(h && JSON.parse(Buffer.from(h,"base64url").toString())).toMatchObject({alg:"RS256",kid:"testkid",iss:"testmid","x-gl-enc":"false","is-digested":"true"});
    expect(p && JSON.parse(Buffer.from(p,"base64url").toString())).toEqual({digest:createHash("sha256").update(body).digest("base64"),digestAlgorithm:"SHA-256",exp:300000,iat:"1234567890000"});
    expect(s && verify("RSA-SHA256",Buffer.from(`${h}.${p}`),merchant.publicKey,Buffer.from(s,"base64url"))).toBe(true);
  });
  it("accepts a valid callback",()=>expect(verifyPayglocalToken(token({merchantId:"testmid",status:"SENT_FOR_CAPTURE"}),cert,"testmid")).toHaveProperty("status","SENT_FOR_CAPTURE"));
  it("rejects tampered callbacks",()=>{const t=token({merchantId:"testmid",status:"AUTHORIZED"}).split(".");t[1]=Buffer.from(JSON.stringify({merchantId:"testmid",status:"SENT_FOR_CAPTURE"})).toString("base64url");expect(()=>verifyPayglocalToken(t.join("."),cert,"testmid")).toThrow();});
  it("rejects wrong-key callbacks",()=>expect(()=>verifyPayglocalToken(token({merchantId:"testmid"},wrong.privateKey),cert,"testmid")).toThrow());
  it("rejects wrong-environment merchant callbacks",()=>expect(()=>verifyPayglocalToken(token({merchantId:"livemid"}),cert,"testmid")).toThrow("environment"));
  it("rejects expired callback JWTs",()=>expect(()=>verifyPayglocalToken(token({merchantId:"testmid",exp:1}),cert,"testmid")).toThrow("Expired"));
  it("fails closed when sandbox credentials are missing",()=>{vi.stubEnv("PAYGLOCAL_SANDBOX_PRIVATE_KEY","");expect(()=>payglocalSettings()).toThrow("not configured");});
  it("never falls back to sandbox credentials in live mode",()=>{vi.stubEnv("PAYMENTS_ENV","live");expect(()=>payglocalSettings()).toThrow("not configured");});
  it("refuses the same credential identity in both environments",()=>{vi.stubEnv("PAYGLOCAL_LIVE_MERCHANT_ID","testmid");expect(()=>payglocalSettings()).toThrow();});
  it("merchant identity is required before checkout",()=>{vi.stubEnv("OWNER_EMAIL","");expect(()=>paymentReadiness()).toThrow("contact details");});
  it.each([["pull_5",500,5],["pull_10",1000,10],["pull_25",2500,25],["standard",900,0],["featured",2900,0]] as const)("keeps %s price exact",(kind,cents,pulls)=>expect(PRODUCTS[kind]).toMatchObject({cents,pulls}));
  it("uses hosted USD checkout without card data",async()=>{
    const fetcher=vi.fn(async()=>Response.json({gid:"gl_test",data:{redirectUrl:"https://checkout.payglocal.in/test",statusUrl:"https://api.uat.payglocal.in/gl/v1/payments/gl_test/status"}}));
    const p=createPayglocalProvider(fetcher as typeof fetch);await p.checkout({productId:"pull_5",orderId:"12345678-1234-4234-8234-123456789abc",returnUrl:"https://tugg.lol/m/test",cents:500,billing});
    const [url,options]=fetcher.mock.calls[0] as unknown as [string,RequestInit];const body=JSON.parse(String(options.body));
    expect(url).toBe("https://api.uat.payglocal.in/gl/v1/payments/initiate/paycollect");expect(body.paymentData).toEqual({totalAmount:"5.00",txnCurrency:"USD",billingData:billing});expect(body.merchantUniqueId).toBe("S12345678123442348234123456789abc");expect(body.paymentData.cardData).toBeUndefined();expect(options.method).toBe("POST");
  });
  it("normalizes documented capitalized status amounts and transaction currency, not billing currency",()=>expect(normalizePayglocal({gid:"g",status:"SENT_FOR_CAPTURE",data:{Amount:"5",txnCurrency:"USD",Currency:"INR",merchantTxnId:"id"}},"sandbox")).toMatchObject({total_amount:500,currency:"USD"}));
  it("rejects cross-environment status URLs before sending credentials",async()=>{const f=vi.fn();await expect(createPayglocalProvider(f).payment("gid","https://api.payglocal.in/gl/v1/payments/gid/status")).rejects.toThrow();expect(f).not.toHaveBeenCalled();});
  it("excludes sandbox pulls in public live queries",()=>{vi.stubEnv("PAYMENTS_ENV","live");expect(liveOnly()).toBe(true);expect(config().paymentsEnv).toBe("live");});
});
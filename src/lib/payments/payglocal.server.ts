import { z } from "zod";
import { createPrivateKey, createPublicKey } from "node:crypto";
import { config } from "../server-utils.server";
import type { PaymentProvider, VerifiedPayment } from "./provider";
import { signPayglocalRequest } from "./payglocal-crypto";
export const PAYGLOCAL_NOT_READY = "PayGlocal checkout is not configured yet. No payment has been taken. Please try again later.";
export function payglocalSettings() {
  const c = config(), s = c.payglocal;
  if (!s.merchantId || !s.keyId || !s.privateKey || !s.publicCert || s.merchantId === s.otherMerchantId || s.keyId === s.otherKeyId) throw new Error(PAYGLOCAL_NOT_READY);
  try {
    const key = createPrivateKey(s.privateKey), cert = createPublicKey(s.publicCert);
    if (key.asymmetricKeyType !== "rsa" || cert.asymmetricKeyType !== "rsa" || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048 || (cert.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) throw new Error("Invalid keys");
  } catch { throw new Error(PAYGLOCAL_NOT_READY); }
  return { ...s, environment: c.paymentsEnv, base: c.paymentsEnv === "live" ? "https://api.payglocal.in" : "https://api.uat.payglocal.in" };
}
export function normalizePayglocal(raw: Record<string, unknown>, environment: "sandbox" | "live"): VerifiedPayment {
  const d = raw["data"] && typeof raw["data"] === "object" ? raw["data"] as Record<string, unknown> : {};
  const value = (key: string) => raw[key] ?? d[key];
  const amount = value("amount") ?? value("totalAmount") ?? (d["paymentData"] as Record<string, unknown> | undefined)?.["totalAmount"];
  const currency = value("currency") ?? value("txnCurrency") ?? (d["paymentData"] as Record<string, unknown> | undefined)?.["txnCurrency"];
  const cents = Number(amount) * 100;
  return {
    payment_id: String(value("gid") ?? value("x-gl-gid") ?? ""),
    status: String(value("status") ?? ""), currency: String(currency ?? ""), total_amount: Number.isFinite(cents) && Math.abs(cents - Math.round(cents)) < .00001 ? Math.round(cents) : -1,
    metadata: { tugg_environment: environment, merchantTxnId: value("merchantTxnId"), merchantUniqueId: value("merchantUniqueId"), merchantId: value("merchantId") ?? value("x-gl-merchantId") },
    product_cart: [], billing: { country: String(value("country") ?? value("addressCountry") ?? "") },
  };
}
export function createPayglocalProvider(fetchImpl: typeof fetch = fetch): PaymentProvider {
  const s = payglocalSettings();
  async function request(path: string, method: "GET" | "POST", data?: unknown) {
    const body = data === undefined ? "" : JSON.stringify(data);
    const response = await fetchImpl(`${s.base}${path}`, { method, headers: { "Content-Type": "application/json", "x-gl-merchantid": s.merchantId, "x-gl-kid": s.keyId, "x-gl-token-external": signPayglocalRequest(body, s) }, ...(method === "POST" ? { body } : {}), signal: AbortSignal.timeout(20000), redirect: "error" });
    if (!response.ok) throw new Error("PayGlocal could not confirm the payment request. Please try again later.");
    const json = await response.json() as Record<string, unknown>;
    return json;
  }
  return {
    environment: s.environment,
    async validateProduct(_id, cents) { if (![500,1000,2500,900,2900].includes(cents)) throw new Error("Invalid purchase"); },
    async checkout(input) {
      if (!input.billing || !input.cents) throw new Error("Billing details are required for digital purchases.");
      const id = `${s.environment === "live" ? "L" : "S"}${input.orderId.replaceAll("-", "")}`;
      const callback = new URL("/api/public/payments/payglocal/callback", input.returnUrl);
      callback.searchParams.set("env", s.environment); callback.searchParams.set("order", input.orderId);
      const raw = await request("/gl/v1/payments/initiate/paycollect", "POST", { merchantTxnId: id, merchantUniqueId: id, paymentData: { totalAmount: (input.cents / 100).toFixed(2), txnCurrency: "USD", billingData: input.billing }, riskData: { shippingData: input.billing }, merchantCallbackURL: callback.toString() });
      const data = raw["data"] as Record<string, unknown> | undefined;
      const gid = z.string().min(1).max(200).parse(raw["gid"]);
      const url = z.string().url().parse(data?.["redirectUrl"]);
      if (new URL(url).protocol !== "https:") throw new Error("Invalid payment address");
      return { sessionId: gid, url };
    },
    async payment(id) {
      if (!/^[A-Za-z0-9_-]{1,200}$/.test(id)) throw new Error("Invalid payment reference");
      const raw = await request(`/gl/v1/payments/${encodeURIComponent(id)}/status`, "GET");
      return normalizePayglocal(raw, s.environment);
    },
    async refund(gid, orderId) {
      if (!/^[A-Za-z0-9_-]{1,200}$/.test(gid)) throw new Error("Invalid payment reference");
      const raw = await request(`/gl/v1/payments/${encodeURIComponent(gid)}/refund`, "POST", { refundType: "F", merchantUniqueId: `R${orderId.replaceAll("-", "")}` });
      const status = String(raw["status"] ?? "");
      if (status !== "SENT_FOR_REFUND") throw new Error("Refund outcome requires review");
      return { refundId: String(raw["gid"] ?? ""), status: "submitted" };
    },
  };
}
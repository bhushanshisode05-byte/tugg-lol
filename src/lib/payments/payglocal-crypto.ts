import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
export function signPayglocalRequest(body: string, settings: { merchantId: string; keyId: string; privateKey: string }, now = Date.now()) {
  const header = encode({ alg: "RS256", kid: settings.keyId, iss: settings.merchantId, "x-gl-merchantId": settings.merchantId, "issued-by": settings.merchantId, "x-gl-enc": "false", "is-digested": "true" });
  // Byte-for-byte digest-object format from PayGlocal's official JS client.
  const payload = encode({ digest: createHash("sha256").update(body).digest("base64"), digestAlgorithm: "SHA-256", exp: 300000, iat: String(now) });
  const input = `${header}.${payload}`;
  return `${input}.${sign("RSA-SHA256", Buffer.from(input), createPrivateKey(settings.privateKey)).toString("base64url")}`;
}
export function decodePayglocalHint(token: string): Record<string, unknown> {
  if (token.length > 20000) throw new Error("Invalid payment token");
  const part = token.split(".")[1];
  if (!part) throw new Error("Invalid payment token");
  const data: unknown = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid payment token");
  return data as Record<string, unknown>;
}
export function verifyPayglocalToken(token: string, publicCert: string, merchantId: string, now = Date.now()) {
  const parts = token.split(".");
  const [headerPart, payloadPart, signature] = parts;
  if (parts.length !== 3 || !headerPart || !payloadPart || !signature || token.length > 20000) throw new Error("Invalid payment token");
  const header = JSON.parse(Buffer.from(headerPart, "base64url").toString("utf8"));
  if (header.alg !== "RS256" || header["is-digested"] === "true") throw new Error("Unsupported callback token");
  if (!verify("RSA-SHA256", Buffer.from(`${headerPart}.${payloadPart}`), createPublicKey(publicCert), Buffer.from(signature, "base64url"))) throw new Error("Invalid payment signature");
  const payload = decodePayglocalHint(token);
  const mid = payload["merchantId"] ?? payload["x-gl-merchantId"] ?? payload["merchant-id"] ?? payload["x-gl-merchantid"];
  if (mid !== merchantId) throw new Error("Payment environment mismatch");
  if (payload["iat"] != null) {
    const raw = Number(payload["iat"]);
    const issued = raw < 1e12 ? raw * 1000 : raw;
    if (!Number.isFinite(issued) || issued > now + 300000) throw new Error("Invalid payment timestamp");
  }
  // JWT absolute expiry only: request digest exp=300000 is a lifetime, not a callback JWT epoch.
  if (payload["exp"] != null) {
    const raw = Number(payload["exp"]);
    if (!Number.isFinite(raw) || (raw < 1e12 ? raw * 1000 : raw) < now) throw new Error("Expired payment token");
  }
  return payload;
}
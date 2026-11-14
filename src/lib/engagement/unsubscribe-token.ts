/**
 * Signed, permanent unsubscribe tokens: "<sha256 of the lowercased address>.<HMAC-SHA256 truncated to 128 bits>".
 * No account and no stored token needed, and old emails keep working forever. Server-only use (needs the secret).
 */
const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function emailHash(email: string) {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(email.trim().toLowerCase()));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}
async function sign(secret: string, hash: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`tugg-engagement-unsubscribe:v1:${hash}`)));
  return b64url(mac.slice(0, 16));
}
export async function unsubscribeToken(secret: string, hash: string) {
  if (!secret || secret.length < 32 || !/^[a-f0-9]{64}$/.test(hash)) throw new Error("unsubscribe signing unavailable");
  return `${hash}.${await sign(secret, hash)}`;
}
/** Returns the address hash for a valid token, otherwise null. Constant-time comparison of the signature. */
export async function verifyUnsubscribeToken(secret: string, token: unknown): Promise<string | null> {
  if (!secret || secret.length < 32 || typeof token !== "string" || token.length > 120) return null;
  const m = /^([a-f0-9]{64})\.([A-Za-z0-9_-]{22})$/.exec(token);
  if (!m) return null;
  const expected = await sign(secret, m[1]!);
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ m[2]!.charCodeAt(i);
  return diff === 0 ? m[1]! : null;
}

/** Standard Webhooks: HMAC-SHA256 over id.timestamp.rawBody; no parsed-body verification. */
export async function verifyDodoSignature(raw: string, headers: Headers, secret: string, now = Date.now()) {
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signatures = headers.get("webhook-signature");
  if (!id || id.length > 200 || !timestamp || !/^\d+$/.test(timestamp) || !signatures)
    throw new Error("Invalid signature");
  if (Math.abs(now / 1000 - Number(timestamp)) > 300) throw new Error("Expired signature");
  const encoded = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let bytes: Uint8Array<ArrayBuffer>;
  try { bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)); }
  catch { throw new Error("Webhook configuration unavailable"); }
  const key = await crypto.subtle.importKey("raw", bytes, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const message = new TextEncoder().encode(`${id}.${timestamp}.${raw}`);
  for (const entry of signatures.split(/\s+/)) {
    const [version, value] = entry.split(",");
    if (version !== "v1" || !value) continue;
    try {
      if (await crypto.subtle.verify("HMAC", key, Uint8Array.from(atob(value), (c) => c.charCodeAt(0)), message)) return id;
    } catch { /* malformed candidate is not a signature */ }
  }
  throw new Error("Invalid signature");
}
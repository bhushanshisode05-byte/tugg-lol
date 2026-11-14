/**
 * Engagement-email provider adapter (Resend HTTP API). Deliberately separate from the transactional app-email
 * sender. Every send carries RFC 8058 one-click unsubscribe headers and an
 * idempotency key equal to the notification id, so a retried or re-leased send is delivered once.
 */
export type EngagementMailConfig = { provider: string; apiKey: string; from: string; unsubscribeSecret: string };
export type MailInput = { id: string; to: string; subject: string; html: string; text: string; oneClickUrl: string };
export type MailResult = { ok: true } | { ok: false; retry: boolean; code: string; retryAfter?: number };

const ADDRESS = /^[^\s@<>"\r\n]{1,64}@[^\s@<>"\r\n]{1,189}\.[A-Za-z]{2,24}$/;
const FROM = /^(?:[A-Za-z0-9 .'&-]{1,40} )?<?([^\s@<>"\r\n]{1,64}@[^\s@<>"\r\n]{1,189}\.[A-Za-z]{2,24})>?$/;

export function engagementMailReady(c: EngagementMailConfig) {
  return c.provider === "resend" && c.apiKey.length >= 10 && FROM.test(c.from) && c.unsubscribeSecret.length >= 32;
}

export async function sendEngagementMail(c: EngagementMailConfig, m: MailInput, fetcher: typeof fetch = fetch): Promise<MailResult> {
  if (!engagementMailReady(c)) return { ok: false, retry: false, code: "not_configured" };
  if (!ADDRESS.test(m.to) || /[\r\n]/.test(m.subject) || !/^https:\/\/tugg\.lol\//.test(m.oneClickUrl)) return { ok: false, retry: false, code: "invalid_message" };
  let res: Response;
  try {
    res = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${c.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `tugg-engagement/${m.id}` },
      body: JSON.stringify({
        from: c.from, to: [m.to], reply_to: "hello@tugg.lol", subject: m.subject, html: m.html, text: m.text,
        headers: { "List-Unsubscribe": `<${m.oneClickUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
        tags: [{ name: "category", value: "engagement" }],
      }),
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    return { ok: false, retry: true, code: "network" };
  }
  if (res.ok) return { ok: true };
  if (res.status === 429) {
    const after = Number(res.headers.get("retry-after"));
    return { ok: false, retry: true, code: "rate_limited", retryAfter: Number.isFinite(after) && after > 0 ? Math.min(after, 3600) : 60 };
  }
  // 409 = the same idempotency key is still being processed: try again later, never as a new email.
  if (res.status === 409 || res.status >= 500) return { ok: false, retry: true, code: res.status === 409 ? "in_progress" : "provider_5xx" };
  return { ok: false, retry: false, code: `provider_${res.status}`.slice(0, 40) };
}

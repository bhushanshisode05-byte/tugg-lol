import { config } from "../server-utils.server";
import { ENGAGEMENT_RULES, type EngagementKind } from "./rules";
import { renderEngagement, type EngagementData } from "./templates";
import { unsubscribeToken } from "./unsubscribe-token";
import { engagementMailReady, sendEngagementMail } from "./mailer.server";

/**
 * Player notification run (scheduled). Separate from pulls, payments and round closing: it only reads committed
 * facts, so nothing here can block or roll them back. Never throws; returns counts without addresses.
 */
const SITE = "https://tugg.lol";
type Claimed = { id: string; kind: EngagementKind; environment: "sandbox" | "live"; recipient_email: string | null; backed_side_ids: string[]; data: EngagementData; ends_at: string | null; a_cents: number; b_cents: number };
async function db() { return (await import("@/integrations/supabase/client.server")).supabaseAdmin; }

export const unsubscribeLinks = (token: string) => ({
  page: `${SITE}/unsubscribe#t=${encodeURIComponent(token)}`,
  oneClick: `${SITE}/api/public/email/unsubscribe?t=${encodeURIComponent(token)}`,
});

async function finish(client: Awaited<ReturnType<typeof db>>, id: string, outcome: "sent" | "retry" | "failed", code?: string, retryAfter?: number) {
  try { await client.rpc("engagement_finish", { p_id: id, p_outcome: outcome, ...(code ? { p_error: code } : {}), ...(retryAfter ? { p_retry_after: retryAfter } : {}) }); }
  catch { /* The lease expires and the same id (idempotency key) is retried later. */ }
}

export async function runEngagement(now = new Date(), fetcher: typeof fetch = fetch) {
  const counts = { claimed: 0, sent: 0, retry: 0, failed: 0 };
  try {
    const c = config();
    const ready = engagementMailReady(c.engagement);
    const client = await db();
    const scan = await client.rpc("engagement_scan", { p_enqueue: ready, p_now: now.toISOString() });
    if (scan.error) return { ok: false as const, reason: "scan_failed", ...counts };
    if (!ready) return { ok: true as const, reason: "provider_not_configured", scan: scan.data, ...counts };
    if (c.pauseEmails) return { ok: true as const, reason: "paused", scan: scan.data, ...counts };
    const deadline = Date.now() + 3500;
    while (counts.claimed < ENGAGEMENT_RULES.batchPerRun && Date.now() < deadline) {
      const take = Math.min(ENGAGEMENT_RULES.concurrency, ENGAGEMENT_RULES.batchPerRun - counts.claimed);
      const claim = await client.rpc("engagement_claim", { p_limit: take, p_lease_seconds: 600 });
      const rows = (claim.data ?? []) as unknown as Claimed[];
      if (claim.error || rows.length === 0) break;
      counts.claimed += rows.length;
      await Promise.all(rows.map(async (row) => {
        try {
          if (!row.recipient_email) { counts.failed++; return finish(client, row.id, "failed", "no_recipient"); }
          const hash = await (await import("./unsubscribe-token")).emailHash(row.recipient_email);
          const links = unsubscribeLinks(await unsubscribeToken(c.engagement.unsubscribeSecret, hash));
          const mail = await renderEngagement({ kind: row.kind, environment: row.environment, backedSideIds: row.backed_side_ids, data: row.data,
            aCents: Number(row.a_cents), bCents: Number(row.b_cents), endsAt: row.ends_at, now: new Date(), unsubscribeUrl: links.page });
          const result = await sendEngagementMail(c.engagement, { id: row.id, to: row.recipient_email, subject: mail.subject, html: mail.html, text: mail.text, oneClickUrl: links.oneClick }, fetcher);
          if (result.ok) { counts.sent++; return finish(client, row.id, "sent"); }
          if (result.retry) { counts.retry++; return finish(client, row.id, "retry", result.code, result.retryAfter); }
          counts.failed++; return finish(client, row.id, "failed", result.code);
        } catch { counts.failed++; return finish(client, row.id, "failed", "render_failed"); }
      }));
    }
    return { ok: true as const, reason: "ran", scan: scan.data, ...counts };
  } catch {
    return { ok: false as const, reason: "unavailable", ...counts };
  }
}

/** Unsubscribe by token (page button or RFC 8058 one-click POST). */
export async function unsubscribeByToken(token: unknown, source: "link" | "one_click") {
  try {
    const { verifyUnsubscribeToken } = await import("./unsubscribe-token");
    const hash = await verifyUnsubscribeToken(config().engagement.unsubscribeSecret, token);
    if (!hash) return "invalid" as const;
    const r = await (await db()).rpc("engagement_unsubscribe", { p_hash: hash, p_source: source });
    return r.error ? ("unavailable" as const) : r.data === "unsubscribed" ? ("unsubscribed" as const) : ("invalid" as const);
  } catch { return "unavailable" as const; }
}

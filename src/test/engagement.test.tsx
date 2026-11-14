// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  cfg: { pauseEmails: false, engagement: { provider: "resend", apiKey: "re_test_key_123", from: "Tugg <rounds@updates.tugg.lol>", unsubscribeSecret: "s".repeat(64) } },
  rpc: [] as { name: string; args: any }[], claims: [] as any[][], scanError: false, lovableSends: [] as any[], noticeClaims: new Set<string>(),
}));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (options: any) => options }));
vi.mock("@/lib/server-utils.server", () => ({ config: () => state.cfg }));
vi.mock("@/lib/email-templates/send-email", () => ({ sendTemplateEmail: async (...args: any[]) => { state.lovableSends.push(args); return { sent: true }; } }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  rpc: async (name: string, args: any) => {
    state.rpc.push({ name, args });
    if (name === "engagement_scan") return state.scanError ? { data: null, error: { message: "x" } } : { data: { overtaken: 0 }, error: null };
    if (name === "engagement_claim") return { data: state.claims.shift() ?? [], error: null };
    if (name === "engagement_finish") return { data: "ok", error: null };
    if (name === "engagement_unsubscribe") return { data: "unsubscribed", error: null };
    if (name === "claim_tugg_notice") { if (state.noticeClaims.has(args.p_key)) return { data: "duplicate", error: null }; state.noticeClaims.add(args.p_key); return { data: "accepted", error: null }; }
    return { data: null, error: null };
  },
  from: () => { const q: any = { select: () => q, eq: () => q, single: async () => ({ data: null, error: null }), insert: async () => ({ error: null }) }; return q; },
} }));

import { ENGAGEMENT_DISCLOSURE, ENGAGEMENT_RULES, isClosableGap } from "@/lib/engagement/rules";
import { renderEngagement, formatTimeLeft, type EngagementMessage } from "@/lib/engagement/templates";
import { emailHash, unsubscribeToken, verifyUnsubscribeToken } from "@/lib/engagement/unsubscribe-token";
import { sendEngagementMail } from "@/lib/engagement/mailer.server";
import { runEngagement, unsubscribeByToken } from "@/lib/engagement/engagement.server";
import { deliverNotice } from "@/lib/app-email.server";
import { SITE_COLORS } from "@/lib/og/theme";
import { render } from "@react-email/render";
import { Notice } from "@/lib/email-templates/tugg-notices";
import { Route as UnsubRoute } from "@/routes/api/public/email/unsubscribe";

const A = "00000000-0000-4000-8000-00000000000a", B = "00000000-0000-4000-8000-00000000000b";
const data = { title: "Notion vs Obsidian", slug: "notion-vs-obsidian", round_length: "weekly", a_id: A, a_name: "Notion", b_id: B, b_name: "Obsidian", a_cents: 4000, b_cents: 5500, ends_at: "2026-11-16T00:00:00Z", leader_id: B };
const now = new Date("2026-11-14T21:30:00Z");
const msg = (over: Partial<EngagementMessage> = {}): EngagementMessage => ({ kind: "overtaken", environment: "live", backedSideIds: [A], data, aCents: 4000, bCents: 5500, endsAt: "2026-11-16T00:00:00Z", now, unsubscribeUrl: "https://tugg.lol/unsubscribe#t=tok", ...over });
const claimRow = (over: any = {}) => ({ id: "11111111-1111-4111-8111-111111111111", kind: "overtaken", environment: "live", recipient_email: "ann@example.com", backed_side_ids: [A], data, ends_at: "2026-11-16T00:00:00Z", a_cents: 4000, b_cents: 5500, ...over });
const okFetch = () => vi.fn(async () => new Response("{}", { status: 200 }));
beforeEach(() => { state.rpc = []; state.claims = []; state.scanError = false; state.lovableSends = []; state.noticeClaims.clear(); state.cfg.pauseEmails = false; state.cfg.engagement.apiKey = "re_test_key_123"; });

describe("rules", () => {
  it("one email of each kind per person per round", () => expect(ENGAGEMENT_RULES.perKindPerRound).toBe(1));
  it("closable gap: up to $25, or up to 20% of the leader's total when that is larger", () => {
    expect(isClosableGap(2500, 2600)).toBe(true);
    expect(isClosableGap(2600, 2600)).toBe(false);
    expect(isClosableGap(4000, 20000)).toBe(true);
    expect(isClosableGap(4100, 20000)).toBe(false);
    expect(isClosableGap(19500, 20000)).toBe(false); // $5 vs $200: hopeless
    expect(isClosableGap(0, 100)).toBe(false);
  });
  it("closing window is 6 h for weekly and 2 h for daily rounds", () => expect(ENGAGEMENT_RULES.closingWindowHours).toEqual({ daily: 2, weekly: 6 }));
  it("disclosure names the emails, one-click opt-out and that receipts continue", () => {
    expect(ENGAGEMENT_DISCLOSURE).toMatch(/rounds you pull in/);
    expect(ENGAGEMENT_DISCLOSURE).toMatch(/unsubscribe/i);
    expect(ENGAGEMENT_DISCLOSURE).toMatch(/receipts and refund notices still arrive/);
  });
});

describe("templates", () => {
  it("overtaken: new leader, new score, time left, matchup link, unsubscribe", async () => {
    const r = await renderEngagement(msg());
    expect(r.subject).toBe("Obsidian just took the lead in Notion vs Obsidian");
    expect(r.text).toContain("Notion $40 · Obsidian $55");
    expect(r.text).toContain("1 day 2 hours");
    expect(r.html).toContain("https://tugg.lol/m/notion-vs-obsidian");
    expect(r.html).toContain("https://tugg.lol/unsubscribe#t=tok");
  });
  it("never shows another buyer's identity even if extra fields reach the template", async () => {
    const r = await renderEngagement(msg({ data: { ...data, display_name: "SecretPuller", email: "other@example.com", shout_out: "ShoutSecret42" } as any }));
    for (const s of ["SecretPuller", "other@example.com", "ShoutSecret42"]) { expect(r.html).not.toContain(s); expect(r.text).not.toContain(s); }
  });
  it("sandbox email is unmistakably a test; live is not", async () => {
    const t = await renderEngagement(msg({ environment: "sandbox" }));
    expect(t.subject.startsWith("[TEST] ")).toBe(true);
    expect(t.text).toContain("TEST EMAIL");
    expect(t.text).toContain("Test score (sandbox pulls only)");
    const l = await renderEngagement(msg());
    expect(l.subject).not.toContain("TEST"); expect(l.text).not.toContain("TEST EMAIL");
  });
  it("streak is mentioned only when true (backed the winner, 2+ rounds)", async () => {
    const res = (streak: number, backed: string[]) => renderEngagement(msg({ kind: "round_result", backedSideIds: backed, data: { ...data, winner_id: A, streak, next_round: true } }));
    expect((await res(3, [A])).text).toContain("You have backed the winner 3 rounds running.");
    expect((await res(1, [A])).text).not.toContain("rounds running");
    expect((await res(3, [B])).text).not.toContain("rounds running");
    expect((await res(3, [A, B])).text).toContain("You pulled for both sides");
    expect((await res(3, [A, B])).text).not.toContain("rounds running");
  });
  it("round result shows winner, final score and the side they backed", async () => {
    const r = await renderEngagement(msg({ kind: "round_result", backedSideIds: [B], data: { ...data, winner_id: B, streak: 0 } }));
    expect(r.subject).toBe("Obsidian won the round in Notion vs Obsidian");
    expect(r.text).toContain("You backed Obsidian. Your side won.");
  });
  it("closing soon states the gap and the time left", async () => {
    const r = await renderEngagement(msg({ kind: "closing_soon", endsAt: "2026-11-14T23:45:00Z" }));
    expect(r.subject).toBe("Notion vs Obsidian closes in 2 hours 15 minutes: Notion is $15 behind");
  });
  it("escapes hostile side names and strips header breaks from the subject", async () => {
    const r = await renderEngagement(msg({ data: { ...data, b_name: "<script>x</script>\r\nBcc: a@b.c" } }));
    expect(r.html).not.toContain("<script>x</script>");
    expect(r.subject).not.toMatch(/[\r\n]/);
  });
  it("all emails use the site's colour tokens, not the old red", async () => {
    const e = await renderEngagement(msg());
    const n = await render(<Notice heading="Receipt" paragraphs={["x"]} />);
    for (const html of [e.html, n]) {
      expect(html.toLowerCase()).toContain(SITE_COLORS.primary);
      expect(html.toLowerCase()).toContain(SITE_COLORS.background);
      expect(html.toLowerCase()).not.toContain("#e53642");
      expect(html.toLowerCase()).not.toContain("#bc2235");
    }
  });
  it("formats time left", () => {
    expect(formatTimeLeft(3 * 86400000 + 5 * 3600000)).toBe("3 days 5 hours");
    expect(formatTimeLeft(45 * 60000)).toBe("45 minutes");
  });
});

describe("unsubscribe tokens", () => {
  it("round-trips, rejects tampering and other secrets", async () => {
    const h = await emailHash(" Ann@Example.com ");
    expect(h).toBe(await emailHash("ann@example.com"));
    const t = await unsubscribeToken("k".repeat(64), h);
    expect(await verifyUnsubscribeToken("k".repeat(64), t)).toBe(h);
    expect(await verifyUnsubscribeToken("j".repeat(64), t)).toBeNull();
    expect(await verifyUnsubscribeToken("k".repeat(64), t.slice(0, -1) + (t.endsWith("A") ? "B" : "A"))).toBeNull();
    expect(await verifyUnsubscribeToken("k".repeat(64), (h.startsWith("a") ? "b" : "a") + t.slice(1))).toBeNull();
  });
});

describe("provider adapter", () => {
  const cfg = () => state.cfg.engagement;
  const mail = { id: "n1", to: "ann@example.com", subject: "S", html: "<p>h</p>", text: "h", oneClickUrl: "https://tugg.lol/api/public/email/unsubscribe?t=x" };
  it("sends RFC 8058 one-click headers and the notification id as idempotency key", async () => {
    const f = okFetch();
    expect(await sendEngagementMail(cfg(), mail, f as any)).toEqual({ ok: true });
    const [, init] = f.mock.calls[0] as any;
    const body = JSON.parse(init.body);
    expect(init.headers["Idempotency-Key"]).toBe("tugg-engagement/n1");
    expect(body.headers).toEqual({ "List-Unsubscribe": "<https://tugg.lol/api/public/email/unsubscribe?t=x>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
    expect(body.to).toEqual(["ann@example.com"]);
    expect(body.cc).toBeUndefined(); expect(body.bcc).toBeUndefined();
  });
  it("429 retries after the provider's wait; 5xx and network errors retry; 4xx stops", async () => {
    expect(await sendEngagementMail(cfg(), mail, (async () => new Response("", { status: 429, headers: { "retry-after": "30" } })) as any)).toEqual({ ok: false, retry: true, code: "rate_limited", retryAfter: 30 });
    expect(await sendEngagementMail(cfg(), mail, (async () => new Response("", { status: 503 })) as any)).toMatchObject({ retry: true });
    expect(await sendEngagementMail(cfg(), mail, (async () => { throw new Error("down"); }) as any)).toMatchObject({ retry: true, code: "network" });
    expect(await sendEngagementMail(cfg(), mail, (async () => new Response("", { status: 422 })) as any)).toMatchObject({ retry: false, code: "provider_422" });
  });
  it("does nothing without full configuration", async () => {
    const f = okFetch();
    expect(await sendEngagementMail({ ...cfg(), apiKey: "" }, mail, f as any)).toMatchObject({ ok: false, code: "not_configured" });
    expect(f).not.toHaveBeenCalled();
  });
});

describe("scheduled run", () => {
  it("without a provider: scans (state only, nothing queued) and sends nothing", async () => {
    state.cfg.engagement.apiKey = "";
    const f = okFetch();
    const r = await runEngagement(now, f as any);
    expect(r.reason).toBe("provider_not_configured");
    expect(state.rpc.find((c) => c.name === "engagement_scan")?.args.p_enqueue).toBe(false);
    expect(state.rpc.some((c) => c.name === "engagement_claim")).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
  it("PAUSE_EMAILS stops engagement sends", async () => {
    state.cfg.pauseEmails = true; state.claims = [[claimRow()]];
    const f = okFetch();
    expect((await runEngagement(now, f as any)).reason).toBe("paused");
    expect(f).not.toHaveBeenCalled();
  });
  it("sends a claimed row once and marks it sent", async () => {
    state.claims = [[claimRow()]];
    const f = okFetch();
    const r = await runEngagement(now, f as any);
    expect(r).toMatchObject({ ok: true, sent: 1, claimed: 1 });
    expect(f).toHaveBeenCalledTimes(1);
    expect(state.rpc.find((c) => c.name === "engagement_finish")?.args).toMatchObject({ p_outcome: "sent" });
  });
  it("a provider outage never throws; the row is handed back for a later retry", async () => {
    state.claims = [[claimRow(), claimRow({ id: "22222222-2222-4222-8222-222222222222", recipient_email: "bob@example.com" })]];
    const r = await runEngagement(now, (async () => { throw new Error("provider down"); }) as any);
    expect(r).toMatchObject({ ok: true, sent: 0, retry: 2 });
    expect(state.rpc.filter((c) => c.name === "engagement_finish").map((c) => c.args.p_outcome)).toEqual(["retry", "retry"]);
  });
  it("a database failure is reported, never thrown", async () => {
    state.scanError = true;
    await expect(runEngagement(now, okFetch() as any)).resolves.toMatchObject({ ok: false, reason: "scan_failed" });
  });
  it("each run sends at most a small batch", async () => {
    state.claims = Array.from({ length: 20 }, (_, i) => [claimRow({ id: `3333333${i % 10}-3333-4333-8333-33333333333${i % 10}` }), claimRow({ id: `4444444${i % 10}-4444-4444-8444-44444444444${i % 10}` })]);
    const f = okFetch();
    await runEngagement(now, f as any);
    expect(f.mock.calls.length).toBeLessThanOrEqual(ENGAGEMENT_RULES.batchPerRun);
    expect(state.rpc.filter((c) => c.name === "engagement_claim").every((c) => c.args.p_limit <= ENGAGEMENT_RULES.concurrency)).toBe(true);
  });
});

describe("unsubscribe", () => {
  const handler = (UnsubRoute as any).server.handlers.POST;
  async function tokenFor(email: string) { return unsubscribeToken(state.cfg.engagement.unsubscribeSecret, await emailHash(email)); }
  it("one-click POST (mail app) unsubscribes the address hash immediately", async () => {
    const t = await tokenFor("ann@example.com");
    const res = await handler({ request: new Request(`https://tugg.lol/api/public/email/unsubscribe?t=${t}`, { method: "POST", body: "List-Unsubscribe=One-Click", headers: { "Content-Type": "application/x-www-form-urlencoded" } }) });
    expect(res.status).toBe(200);
    expect(state.rpc.find((c) => c.name === "engagement_unsubscribe")?.args).toEqual({ p_hash: await emailHash("ann@example.com"), p_source: "one_click" });
  });
  it("page button POST works without an account; forged tokens are refused", async () => {
    const ok = await handler({ request: new Request("https://tugg.lol/api/public/email/unsubscribe", { method: "POST", body: JSON.stringify({ t: await tokenFor("ann@example.com") }) }) });
    expect(ok.status).toBe(200);
    const forged = await handler({ request: new Request("https://tugg.lol/api/public/email/unsubscribe", { method: "POST", body: JSON.stringify({ t: `${await emailHash("ann@example.com")}.${"A".repeat(22)}` }) }) });
    expect(forged.status).toBe(400);
  });
  it("GET never unsubscribes (link scanners), it only opens the confirmation page", async () => {
    const res = await (UnsubRoute as any).server.handlers.GET({ request: new Request(`https://tugg.lol/api/public/email/unsubscribe?t=${await tokenFor("ann@example.com")}`) });
    expect(res.status).toBe(303);
    expect(state.rpc.some((c) => c.name === "engagement_unsubscribe")).toBe(false);
  });
  it("after unsubscribing, purchase receipts and refund notices still send", async () => {
    expect(await unsubscribeByToken(await tokenFor("ann@example.com"), "link")).toBe("unsubscribed");
    expect((await deliverNotice("purchase-receipt", "ann@example.com", "order-1", { heading: "Receipt" })).sent).toBe(true);
    expect((await deliverNotice("matchup-rejection", "ann@example.com", "order-1:completed", { heading: "Refund" })).sent).toBe(true);
    expect(state.lovableSends.map((s) => s[0])).toEqual(["purchase-receipt", "matchup-rejection"]);
  });
});

describe("separation of email categories", () => {
  const dir = "src/lib/engagement";
  const sources = readdirSync(dir).map((f) => readFileSync(`${dir}/${f}`, "utf8"));
  it("engagement code never uses the transactional (Lovable app-email) sender", () => {
    for (const s of sources) { expect(s).not.toMatch(/send-email|@lovable\.dev\/email-js|sendTemplateEmail|deliverNotice/); }
  });
  it("transactional code never consults engagement opt-outs", () => {
    const tx = readFileSync("src/lib/app-email.server.ts", "utf8") + readFileSync("src/lib/email-templates/send-email.ts", "utf8");
    expect(tx).not.toMatch(/engagement_unsubscribe|engagement_notifications|engagement\.server/);
  });
  it("pulls, payments and round closing never call the engagement run", () => {
    for (const f of ["src/lib/payments/fulfillment.server.ts", "src/lib/payments/basket-fulfillment.server.ts", "src/lib/payments/payglocal-fulfillment.server.ts", "src/lib/jobs.server.ts"]) {
      expect(readFileSync(f, "utf8")).not.toMatch(/engagement/);
    }
  });
});

// @vitest-environment node
// Buyer receipts for the active payment provider. Regression: receipts once read an unused provider's
// table, found nothing and returned silently, so no Dodo buyer ever got a receipt.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

type Row = Record<string, any>;
const state = vi.hoisted(() => ({ cards: {} as Record<string, any>, cardError: false, tables: {} as Record<string, any[]>, reads: [] as string[], sends: [] as any[], claims: new Set<string>(), refund: vi.fn() }));

vi.mock("@/lib/server-utils.server", () => ({
  config: () => ({ pauseEmails: false, siteUrl: "https://tugg.lol", paymentProvider: "dodo", paymentsEnv: "sandbox" }),
  moderate: vi.fn(async () => ({ outcome: "allowed", reason: "ok" })),
}));
vi.mock("@/lib/email-templates/send-email", () => ({ sendTemplateEmail: async (...args: any[]) => { state.sends.push(args); return { sent: true }; } }));
vi.mock("@/lib/tugg.functions", () => ({
  loadMatchups: async ({ ids }: { ids: string[] }) => (state.tables["matchups"] ?? []).filter((m) => ids.includes(m.id)).map((m) => ({
    ...m, sides: (state.tables["sides"] ?? []).filter((s) => s.matchup_id === m.id), round: { total_a_cents: 0, total_b_cents: 0, round_length: "weekly" },
  })),
  // Stands in for the public card loader the image route uses: null means the card can't be drawn.
  loadPullCard: async (id: string) => { if (state.cardError) throw new Error("rpc down"); return state.cards[id] ?? null; },
}));
vi.mock("@/integrations/supabase/client.server", () => {
  // Tiny in-memory table store: filters really filter, so a wrong table or id returns nothing, just like production.
  function from(table: string) {
    state.reads.push(table);
    const filters: ((r: Row) => boolean)[] = [];
    let patch: Row | null = null, inserted: Row | null = null;
    const rows = () => (state.tables[table] ??= []).filter((r) => filters.every((f) => f(r)));
    const run = () => {
      if (inserted) { (state.tables[table] ??= []).push(inserted); return { data: [inserted], error: null }; }
      const hit = rows();
      if (patch) for (const r of hit) Object.assign(r, patch);
      return { data: hit, error: null };
    };
    const q: any = {
      select: () => q, order: () => q,
      eq: (k: string, v: any) => { filters.push((r) => r[k] === v); return q; },
      neq: (k: string, v: any) => { filters.push((r) => r[k] !== v); return q; },
      is: (k: string, v: any) => { filters.push((r) => (r[k] ?? null) === v); return q; },
      in: (k: string, v: any[]) => { filters.push((r) => v.includes(r[k])); return q; },
      update: (v: Row) => { patch = v; return q; },
      insert: (v: Row) => { inserted = v; return q; },
      async single() { const { data } = run(); return data.length === 1 ? { data: data[0], error: null } : { data: null, error: { message: "not found" } }; },
      async maybeSingle() { const { data } = run(); return { data: data[0] ?? null, error: null }; },
      then(resolve: any, reject: any) { try { resolve(run()); } catch (e) { reject(e); } },
    };
    return q;
  }
  const order = (id: string): Row => state.tables["dodo_orders"]!.find((o) => o["id"] === id)!;
  async function rpc(name: string, args: any) {
    if (name === "claim_tugg_notice") { if (state.claims.has(args.p_key)) return { data: "duplicate", error: null }; state.claims.add(args.p_key); return { data: "accepted", error: null }; }
    if (name === "claim_dodo_immediate_order") { Object.assign(order(args.p_order), { payment_id: args.p_payment }); return { data: true, error: null }; }
    if (name === "apply_dodo_bundle") { Object.assign(order(args.p_order), { status: "paid", paid_at: "2026-11-16T20:00:00Z" }); return { data: {}, error: null }; }
    if (name === "apply_dodo_basket") {
      const o = order(args.p_order); let refund = 0;
      for (const l of state.tables["dodo_basket_lines"]!.filter((l) => l["order_id"] === o["id"])) { if (l["inactive"]) { l["status"] = "refunded"; refund += l["quantity"] * 100; } else l["status"] = "applied"; }
      Object.assign(o, { status: "paid", paid_at: "2026-11-16T20:00:00Z", basket_refund_cents: refund });
      return { data: {}, error: null };
    }
    return { data: null, error: null };
  }
  return { supabaseAdmin: { from, rpc } };
});

import { RECEIPT_ORDER_TABLE, sendPurchaseNotices } from "@/lib/app-email.server";
import { processDodoEvent } from "@/lib/payments/fulfillment.server";
import { refundTimingText } from "@/lib/payments/copy";
import type { PaymentProvider, VerifiedPayment } from "@/lib/payments/provider";

const ORDER = "11111111-1111-4111-8111-111111111111";
const BUYER = "buyer@example.com";
const M1 = "a0000000-0000-4000-8000-000000000001", M2 = "a0000000-0000-4000-8000-000000000002", M3 = "a0000000-0000-4000-8000-000000000003";
const S = (n: number) => `b0000000-0000-4000-8000-00000000000${n}`;
function seedMatchups() {
  state.tables["matchups"] = [
    { id: M1, slug: "pizza-vs-burgers", title: "Pizza vs Burgers", status: "active" },
    { id: M2, slug: "cats-vs-dogs", title: "Cats vs Dogs", status: "active" },
    { id: M3, slug: "tea-vs-coffee", title: "Tea vs Coffee", status: "retired" },
  ];
  state.tables["sides"] = [
    { id: S(1), matchup_id: M1, name: "Pizza", position: 0 }, { id: S(2), matchup_id: M1, name: "Burgers", position: 1 },
    { id: S(3), matchup_id: M2, name: "Cats", position: 0 }, { id: S(4), matchup_id: M2, name: "Dogs", position: 1 },
    { id: S(5), matchup_id: M3, name: "Tea", position: 0 }, { id: S(6), matchup_id: M3, name: "Coffee", position: 1 },
  ];
}
const dodoOrder = (patch: Row = {}): Row => ({
  id: ORDER, environment: "sandbox", kind: "pull_5", expected_cents: 500, quantity: 5, product_id: "pdt_5", wallet_id: null,
  matchup_id: null, side_id: S(1), checkout_id: "cks_SECRETSESSION123", payment_id: "pay_0NabcDEF123", status: "paid",
  refund_id: null, refund_status: null, review_allowed: null, review_reason: null, created_at: "2026-11-16T19:59:00Z",
  paid_at: "2026-11-16T20:00:00Z", provider_status: "succeeded", basket_refund_cents: 0, buyer_email: BUYER,
  processing_key: "99999999-9999-4999-8999-999999999999", ...patch,
});
const receipt = () => state.sends.find((s) => s[0] === "purchase-receipt");
const details = () => receipt()?.[2].templateData.details as { label: string; value: string }[];
const detail = (label: string) => details()?.find((d) => d.label === label)?.value;
const links = () => receipt()?.[2].templateData.links as { href: string; label: string }[];
const logs = () => JSON.stringify(state.tables["events"] ?? []);

beforeEach(() => { state.cards = {}; state.cardError = false; state.tables = {}; state.reads = []; state.sends = []; state.claims.clear(); state.refund.mockReset(); seedMatchups(); });

describe("Dodo purchase receipts", () => {
  it("a paid Dodo bundle sends one receipt with the right matchup, side, pulls, amount, reference and mode", async () => {
    state.tables["dodo_orders"] = [dodoOrder()];
    await sendPurchaseNotices(ORDER, "sandbox", "dodo");
    expect(state.sends).toHaveLength(1);
    expect(receipt()?.[1]).toBe(BUYER);
    expect(detail("Matchup")).toBe("Pizza vs Burgers");
    expect(detail("Side")).toBe("Pizza");
    expect(detail("Pulls")).toBe("5");
    expect(detail("Amount")).toBe("$5.00 USD");
    expect(detail("Payment reference")).toBe("pay_0NabcDEF123");
    expect(detail("Mode")).toBe("Sandbox / test");
    expect(links()).toEqual([{ href: "https://tugg.lol/m/pizza-vs-burgers", label: "View the matchup on Tugg" }]);
  });

  it("the mode label comes from the order's own environment", async () => {
    state.tables["dodo_orders"] = [dodoOrder({ environment: "live" })];
    await sendPurchaseNotices(ORDER, "live", "dodo");
    expect(detail("Mode")).toBe("Live");
  });

  it("a paid basket sends one receipt listing every matchup, side and pull count", async () => {
    state.tables["dodo_orders"] = [dodoOrder({ kind: "basket", side_id: null, quantity: 15, expected_cents: 1500 })];
    state.tables["dodo_basket_lines"] = [
      { order_id: ORDER, position: 0, matchup_id: M1, side_id: S(2), quantity: 10, status: "applied" },
      { order_id: ORDER, position: 1, matchup_id: M2, side_id: S(3), quantity: 5, status: "applied" },
    ];
    await sendPurchaseNotices(ORDER, "sandbox", "dodo");
    expect(state.sends.filter((s) => s[0] === "purchase-receipt")).toHaveLength(1);
    expect(detail("Purchase")).toBe("15 pulls across 2 matchups");
    expect(detail("Matchup 1")).toBe("Pizza vs Burgers: 10 pulls for Burgers");
    expect(detail("Matchup 2")).toBe("Cats vs Dogs: 5 pulls for Cats");
    expect(detail("Amount")).toBe("$15.00 USD");
    expect(detail("Refunded")).toBeUndefined();
  });

  it("a partially refunded basket shows the refunded amount, pulls and refund status", async () => {
    state.tables["dodo_orders"] = [dodoOrder({ kind: "basket", side_id: null, quantity: 15, expected_cents: 1500, basket_refund_cents: 500, refund_status: "pending" })];
    state.tables["dodo_basket_lines"] = [
      { order_id: ORDER, position: 0, matchup_id: M1, side_id: S(1), quantity: 10, status: "applied" },
      { order_id: ORDER, position: 1, matchup_id: M3, side_id: S(5), quantity: 5, status: "refunded" },
    ];
    await sendPurchaseNotices(ORDER, "sandbox", "dodo");
    expect(detail("Purchase")).toBe("10 pulls");
    expect(detail("Matchup")).toBe("Pizza vs Burgers");
    expect(detail("Amount")).toBe("$15.00 USD");
    expect(detail("Refunded")).toBe("$5.00 USD for 5 pulls, because a matchup stopped taking pulls before your payment was applied");
    expect(detail("Refund status")).toBe("Refund requested, not yet confirmed");
    expect(receipt()?.[2].templateData.paragraphs).toContain(refundTimingText("dodo"));
  });

  it.each([["pending"], ["failed"], ["expired"], ["needs_review"]])("a %s order sends nothing", async (status) => {
    state.tables["dodo_orders"] = [dodoOrder({ status })];
    await sendPurchaseNotices(ORDER, "sandbox", "dodo");
    expect(state.sends).toHaveLength(0);
  });

  it("a missing order, or one from the other environment, sends nothing", async () => {
    await sendPurchaseNotices(ORDER, "sandbox", "dodo");
    state.tables["dodo_orders"] = [dodoOrder({ environment: "live" })];
    await sendPurchaseNotices(ORDER, "sandbox", "dodo");
    expect(state.sends).toHaveLength(0);
  });

  it("a paid order without a stored buyer email sends nothing and logs missing_buyer_email", async () => {
    state.tables["dodo_orders"] = [dodoOrder({ buyer_email: null })];
    await sendPurchaseNotices(ORDER, "sandbox", "dodo");
    expect(state.sends).toHaveLength(0);
    expect(state.tables["events"]).toEqual([{ kind: "app_notice_result", detail: { key: `purchase-receipt:${ORDER}`, template: "purchase-receipt", status: "missing_buyer_email" } }]);
  });

  it("a rejected Dodo matchup sends a receipt and a refund notice with Dodo refund wording", async () => {
    state.tables["dodo_orders"] = [dodoOrder({ kind: "standard", side_id: null, quantity: 0, expected_cents: 900, matchup_id: M1, review_allowed: false, review_reason: "Not permitted", refund_status: "succeeded", refund_id: "rfd_SECRET" })];
    await sendPurchaseNotices(ORDER, "sandbox", "dodo");
    expect(state.sends.map((s) => s[0])).toEqual(["purchase-receipt", "matchup-rejection"]);
    expect(detail("Purchase")).toBe("Standard matchup");
    const notice = state.sends[1][2].templateData;
    expect(notice.details).toContainEqual({ label: "Refund status", value: "Refund confirmed" });
    expect(notice.details).toContainEqual({ label: "Payment reference", value: "pay_0NabcDEF123" });
    expect(notice.paragraphs).toEqual([refundTimingText("dodo")]);
    expect(JSON.stringify(state.sends)).not.toMatch(/PayGlocal/);
  });

  it("no receipt body carries a checkout session, refund id or processing key, and no log carries an address or provider id", async () => {
    state.tables["dodo_orders"] = [dodoOrder({ kind: "standard", side_id: null, quantity: 0, expected_cents: 900, matchup_id: M1, review_allowed: false, refund_status: "needs_review", refund_id: "rfd_SECRET" })];
    await sendPurchaseNotices(ORDER, "sandbox", "dodo");
    const bodies = JSON.stringify(state.sends.filter((s) => s[1] === BUYER));
    expect(state.sends.length).toBe(3); // receipt, rejection notice, owner refund-review alert
    expect(bodies).not.toMatch(/cks_|rfd_|99999999-9999/);
    expect(JSON.stringify(state.sends.filter((s) => s[1] !== BUYER))).not.toMatch(/@example|pay_|cks_|rfd_/);
    expect(logs()).not.toMatch(/@|pay_|cks_|rfd_/);
    expect(logs()).toContain("recipient_hash");
  });
});

describe("guard: the receipt reads the table the active provider writes to", () => {
  it("the default provider is Dodo and its receipt table is dodo_orders", () => {
    expect(readFileSync("src/lib/server-utils.server.ts", "utf8")).toMatch(/PAYMENT_PROVIDER"\] \|\| "dodo"/);
    expect(RECEIPT_ORDER_TABLE.dodo).toBe("dodo_orders");
  });

  it.each([
    ["dodo", "src/lib/payments/fulfillment.server.ts"],
    ["payglocal", "src/lib/payments/payglocal-fulfillment.server.ts"],
  ] as const)("%s fulfilment writes to its receipt table and asks for receipts as that provider", (provider, file) => {
    const src = readFileSync(file, "utf8");
    const table = RECEIPT_ORDER_TABLE[provider];
    expect(src).toMatch(new RegExp(`from\\(["']${table}["']\\)\\s*\\.update`));
    expect(src).toMatch(new RegExp(`sendPurchaseNotices\\(id, provider\\.environment, ["']${provider}["']\\)`));
  });

  it("a Dodo receipt never reads another provider's order table", async () => {
    state.tables["payglocal_orders"] = [{ ...dodoOrder(), merchant_unique_id: "Sref" }];
    await sendPurchaseNotices(ORDER, "sandbox", "dodo");
    expect(state.sends).toHaveLength(0);
    expect(state.reads).toContain("dodo_orders");
    expect(state.reads).not.toContain("payglocal_orders");
  });

  const provider = (p: VerifiedPayment): PaymentProvider => ({ environment: "sandbox", validateProduct: vi.fn(), checkout: vi.fn(), payment: vi.fn(async () => p), refund: state.refund });
  const pay = (patch: Partial<VerifiedPayment> = {}): VerifiedPayment => ({ payment_id: "pay_0NabcDEF123", status: "succeeded", currency: "USD", total_amount: 500, metadata: { tugg_order_id: ORDER, tugg_environment: "sandbox" }, product_cart: [{ product_id: "pdt_5", quantity: 1 }], checkout_session_id: "cks_SECRETSESSION123", customer: { email: BUYER }, ...patch });

  it("end to end: a verified Dodo payment for a pending bundle order ends with a sent receipt", async () => {
    state.tables["dodo_orders"] = [dodoOrder({ status: "pending", payment_id: null, paid_at: null, buyer_email: null, processing_key: null })];
    await processDodoEvent({ type: "payment.succeeded", data: { payment_id: "pay_0NabcDEF123" } }, provider(pay()));
    expect(state.sends.map((s) => [s[0], s[1]])).toEqual([["purchase-receipt", BUYER]]);
    expect(detail("Payment reference")).toBe("pay_0NabcDEF123");
    // Replays (webhook retry, reconciliation) never send a second receipt.
    await processDodoEvent({ type: "payment.succeeded", data: { payment_id: "pay_0NabcDEF123" } }, provider(pay()));
    expect(state.sends).toHaveLength(1);
  });

  it("end to end: a verified Dodo basket payment with an inactive matchup sends one receipt showing the refund", async () => {
    state.refund.mockResolvedValue({ refundId: "rfd_SECRET", status: "pending" });
    state.tables["dodo_orders"] = [dodoOrder({ kind: "basket", side_id: null, product_id: "pdt_1", quantity: 15, expected_cents: 1500, status: "pending", payment_id: null, paid_at: null, buyer_email: null, processing_key: null })];
    state.tables["dodo_basket_lines"] = [
      { order_id: ORDER, position: 0, matchup_id: M1, side_id: S(1), quantity: 10, status: "pending" },
      { order_id: ORDER, position: 1, matchup_id: M3, side_id: S(5), quantity: 5, status: "pending", inactive: true },
    ];
    await processDodoEvent({ type: "payment.succeeded", data: { payment_id: "pay_0NabcDEF123" } }, provider(pay({ total_amount: 1500, product_cart: [{ product_id: "pdt_1", quantity: 15 }], metadata: { tugg_order_id: ORDER, tugg_environment: "sandbox", tugg_kind: "basket" } })));
    expect(state.refund).toHaveBeenCalledTimes(1);
    expect(state.sends.map((s) => s[0])).toEqual(["purchase-receipt"]);
    expect(detail("Matchup")).toBe("Pizza vs Burgers");
    expect(detail("Refunded")).toBe("$5.00 USD for 5 pulls, because a matchup stopped taking pulls before your payment was applied");
  });
});

// A pull recorded for a receipt line, plus the public card the image route would draw for it.
const P = (n: number) => `c0000000-0000-4000-8000-00000000000${n}`;
function recordPull(n: number, session: string, matchupId: string, sideId: string, slug: string, { card = true } = {}) {
  (state.tables["pulls"] ??= []).push({ id: P(n), stripe_session_id: session, round_a_after_cents: 500, round_b_after_cents: 0 });
  if (card) state.cards[P(n)] = { id: P(n), slug, sideId, matchupId };
}
const ISO = /\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2})?/;
/** Every piece of text a reader sees in a notice: heading, paragraphs, detail labels and values, link labels. */
const visibleText = (data: any): string[] => [data.heading, ...(data.paragraphs ?? []), ...(data.details ?? []).flatMap((d: any) => [d.label, d.value]), ...(data.links ?? []).map((l: any) => l.label)].filter(Boolean);
const basket = (lines: Row[], patch: Row = {}) => {
  state.tables["dodo_orders"] = [dodoOrder({ kind: "basket", side_id: null, quantity: 15, expected_cents: 1500, ...patch })];
  state.tables["dodo_basket_lines"] = lines.map((l, position) => ({ order_id: ORDER, position, status: "applied", ...l }));
};

describe("receipt date", () => {
  it("renders the stored timestamp as a readable, labelled UTC date", async () => {
    state.tables["dodo_orders"] = [dodoOrder({ paid_at: "2026-11-18T00:44:10.019322+00:00" })];
    await sendPurchaseNotices(ORDER, "sandbox", "dodo");
    expect(detail("Date")).toBe("18 November 2026, 00:44 UTC");
    expect(detail("Date (UTC)")).toBeUndefined();
  });

  it("falls back to the order's created time when paid_at is empty", async () => {
    state.tables["dodo_orders"] = [dodoOrder({ paid_at: null, created_at: "2026-11-16 19:59:00+00" })];
    await sendPurchaseNotices(ORDER, "sandbox", "dodo");
    expect(detail("Date")).toBe("16 November 2026, 19:59 UTC");
  });

  it.each([
    ["bundle", () => { state.tables["dodo_orders"] = [dodoOrder({ paid_at: "2026-11-18T00:44:10.019322+00:00" })]; }],
    ["basket with a refund", () => basket([{ matchup_id: M1, side_id: S(1), quantity: 10 }, { matchup_id: M3, side_id: S(5), quantity: 5, status: "refunded" }], { basket_refund_cents: 500, refund_status: "pending" })],
    ["rejected matchup", () => { state.tables["dodo_orders"] = [dodoOrder({ kind: "standard", side_id: null, quantity: 0, expected_cents: 900, matchup_id: M1, review_allowed: false, refund_status: "needs_review" })]; }],
  ])("no user-visible field of a %s notice looks like a raw ISO-8601 date", async (_name, seed) => {
    seed();
    await sendPurchaseNotices(ORDER, "sandbox", "dodo");
    expect(state.sends.length).toBeGreaterThan(0);
    for (const send of state.sends) for (const text of visibleText(send[2].templateData)) expect(text).not.toMatch(ISO);
  });
});

describe("receipt link", () => {
  it("a single-matchup receipt links to that buyer's own pull card page", async () => {
    state.tables["dodo_orders"] = [dodoOrder()];
    recordPull(1, `dodo:${ORDER}`, M1, S(1), "pizza-vs-burgers");
    await sendPurchaseNotices(ORDER, "sandbox", "dodo");
    expect(links()).toEqual([{ href: `https://tugg.lol/pull/${P(1)}`, label: "See your pull card" }]);
  });

  it("a basket receipt links every line to its own pull card, naming the matchup", async () => {
    basket([{ matchup_id: M1, side_id: S(2), quantity: 10 }, { matchup_id: M2, side_id: S(3), quantity: 5 }]);
    recordPull(1, `dodo:${ORDER}:0`, M1, S(2), "pizza-vs-burgers");
    recordPull(2, `dodo:${ORDER}:1`, M2, S(3), "cats-vs-dogs");
    await sendPurchaseNotices(ORDER, "sandbox", "dodo");
    expect(links()).toEqual([
      { href: `https://tugg.lol/pull/${P(1)}`, label: "See your pull card: Pizza vs Burgers" },
      { href: `https://tugg.lol/pull/${P(2)}`, label: "See your pull card: Cats vs Dogs" },
    ]);
  });

  it("a basket line without a card falls back on its own; the other line keeps its card", async () => {
    basket([{ matchup_id: M1, side_id: S(2), quantity: 10 }, { matchup_id: M2, side_id: S(3), quantity: 5 }]);
    recordPull(1, `dodo:${ORDER}:0`, M1, S(2), "pizza-vs-burgers");
    recordPull(2, `dodo:${ORDER}:1`, M2, S(3), "cats-vs-dogs", { card: false });
    await sendPurchaseNotices(ORDER, "sandbox", "dodo");
    expect(links()).toEqual([
      { href: `https://tugg.lol/pull/${P(1)}`, label: "See your pull card: Pizza vs Burgers" },
      { href: "https://tugg.lol/m/cats-vs-dogs", label: "View Cats vs Dogs on Tugg" },
    ]);
  });

  it("a refunded basket line gets no link, the applied line links to its card", async () => {
    basket([{ matchup_id: M1, side_id: S(1), quantity: 10 }, { matchup_id: M3, side_id: S(5), quantity: 5, status: "refunded" }], { basket_refund_cents: 500, refund_status: "pending" });
    recordPull(1, `dodo:${ORDER}:0`, M1, S(1), "pizza-vs-burgers");
    await sendPurchaseNotices(ORDER, "sandbox", "dodo");
    expect(links()).toEqual([{ href: `https://tugg.lol/pull/${P(1)}`, label: "See your pull card" }]);
  });

  it.each([
    ["no snapshot was recorded", () => {}],
    ["the card loader finds nothing", () => recordPull(1, `dodo:${ORDER}`, M1, S(1), "pizza-vs-burgers", { card: false })],
    ["the card loader fails", () => { recordPull(1, `dodo:${ORDER}`, M1, S(1), "pizza-vs-burgers"); state.cardError = true; }],
    ["the card belongs to another matchup", () => { recordPull(1, `dodo:${ORDER}`, M1, S(1), "pizza-vs-burgers"); state.cards[P(1)].slug = "cats-vs-dogs"; }],
  ])("falls back to the matchup page when %s", async (_why, seed) => {
    state.tables["dodo_orders"] = [dodoOrder()];
    seed();
    await sendPurchaseNotices(ORDER, "sandbox", "dodo");
    expect(links()).toEqual([{ href: "https://tugg.lol/m/pizza-vs-burgers", label: "View the matchup on Tugg" }]);
  });

  it("a matchup purchase links to the matchup only once it is public, otherwise home", async () => {
    state.tables["dodo_orders"] = [dodoOrder({ kind: "standard", side_id: null, quantity: 0, expected_cents: 900, matchup_id: M1 })];
    await sendPurchaseNotices(ORDER, "sandbox", "dodo");
    expect(links()).toEqual([{ href: "https://tugg.lol/m/pizza-vs-burgers", label: "View your matchup on Tugg" }]);
    state.sends = []; state.claims.clear();
    state.tables["matchups"]![0].status = "rejected";
    await sendPurchaseNotices(ORDER, "sandbox", "dodo");
    expect(links()).toEqual([{ href: "https://tugg.lol/", label: "Visit Tugg" }]);
  });

  it("every receipt link is a public tugg.lol page with no email, order id, payment id or token", async () => {
    const seeds = [
      () => { state.tables["dodo_orders"] = [dodoOrder()]; recordPull(1, `dodo:${ORDER}`, M1, S(1), "pizza-vs-burgers"); },
      () => { basket([{ matchup_id: M1, side_id: S(2), quantity: 10 }, { matchup_id: M2, side_id: S(3), quantity: 5 }]); recordPull(1, `dodo:${ORDER}:0`, M1, S(2), "pizza-vs-burgers"); },
      () => { state.tables["dodo_orders"] = [dodoOrder({ kind: "featured", side_id: null, quantity: 0, expected_cents: 2900, matchup_id: M2 })]; },
    ];
    for (const seed of seeds) {
      state.tables = {}; state.cards = {}; state.sends = []; state.claims.clear(); seedMatchups(); seed();
      await sendPurchaseNotices(ORDER, "sandbox", "dodo");
      expect(links().length).toBeGreaterThan(0);
      for (const { href, label } of links()) {
        expect(href).toMatch(/^https:\/\/tugg\.lol\/(?:$|m\/[a-z0-9-]+$|pull\/[0-9a-f-]{36}$)/);
        expect(label.trim()).not.toBe("");
        expect(href).not.toContain(ORDER);
        expect(href).not.toMatch(/@|%40|pay_|cks_|rfd_|99999999-9999|token|session|[?#]/i);
      }
    }
  });
});

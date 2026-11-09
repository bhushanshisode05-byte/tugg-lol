import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Turnstile, type TurnstileHandle } from "./Turnstile";
import { SideAvatar } from "./SideAvatar";
import { buyPullBasket, listBasketMatchups } from "@/lib/basket-payments.functions";
import { getImmediatePayment, recordPaymentFunnel } from "@/lib/immediate-payments.functions";
import { TURNSTILE_ACTIONS } from "@/lib/turnstile";
import { openDodoOverlay } from "@/lib/payments/dodo-overlay";
import { paymentProviderText } from "@/lib/payments/copy";
import { BASKET_MAX_MATCHUPS, BASKET_MAX_PULLS, BASKET_MIN_PULLS, BASKET_QUICK_PICKS, basketTotal, isWholeBasketAmount, splitPulls } from "@/lib/payments/basket";
import type { Side } from "@/lib/tugg.functions";

type LineSide = { id: string; name: string; emoji: string };
type Line = { matchupId: string; title: string; sides: LineSide[]; sideId: string; pulls: number };
type Option = Awaited<ReturnType<typeof listBasketMatchups>>[number];
type Step = "viewed" | "bundle_selected" | "turnstile_passed" | "opened" | "cancelled" | "abandoned" | "failed";

export function BasketPullPanel({ matchupId, title, sides, slug, paused, onPulled, ready, message }: { matchupId: string; title: string; sides: Side[]; slug: string; paused: boolean; onPulled: () => void; ready: boolean; message: string }) {
  const buy = useServerFn(buyPullBasket), read = useServerFn(getImmediatePayment), list = useServerFn(listBasketMatchups), funnel = useServerFn(recordPaymentFunnel);
  const [lines, setLines] = useState<Line[]>([{ matchupId, title, sides, sideId: sides[0]?.id || "", pulls: 5 }]);
  const [custom, setCustom] = useState(""), [options, setOptions] = useState<Option[] | null>(null);
  const [name, setName] = useState(""), [shout, setShout] = useState(""), [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [confirmation, setConfirmation] = useState(""), [orderId, setOrderId] = useState("");
  const [environment, setEnvironment] = useState<"sandbox" | "live">("sandbox");
  const ts = useRef<TurnstileHandle>(null), funnelId = useRef(""), section = useRef<HTMLElement>(null), viewed = useRef(false), completed = useRef(false);
  const total = basketTotal(lines);
  const valid = isWholeBasketAmount(total) && lines.every((l) => l.sideId && l.pulls >= 1) && new Set(lines.map((l) => l.matchupId)).size === lines.length;
  const emit = (step: Step, bundle = total, mode: "none" | "drawer" | "redirect" = "none") => {
    if (!funnelId.current) funnelId.current = crypto.randomUUID();
    if (!isWholeBasketAmount(bundle)) return Promise.resolve();
    window.__lovableEvents?.track?.("project.payment_funnel", { step, bundle, mode, environment });
    return funnel({ data: { funnelId: funnelId.current, step, bundle, mode } }).catch(() => {});
  };
  const setTotal = (amount: number) => {
    setLines((current) => { const split = splitPulls(amount, current.length); return current.map((l, i) => ({ ...l, pulls: split[i]! })); });
    void emit("bundle_selected", amount);
  };
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("payment");
    if (id && /^[0-9a-f-]{36}$/i.test(id)) setOrderId(id);
    const el = section.current; if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting) && !viewed.current) { viewed.current = true; void emit("viewed"); observer.disconnect(); } });
    observer.observe(el); return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pulledRef = useRef(onPulled);
  useEffect(() => { pulledRef.current = onPulled; }, [onPulled]);
  useEffect(() => {
    const id = orderId; if (!id) return;
    let stop = false, n = 0, timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const r = await read({ data: { orderId: id } }); if (stop) return;
      if (r?.status === "paid") {
        completed.current = true;
        const applied = r.quantity - r.refundedPulls;
        setConfirmation(r.refundedPulls > 0
          ? `${applied} pulls applied. ${r.refundedPulls} pulls are being refunded because a matchup stopped taking pulls before your payment was applied.`
          : `${r.quantity} pulls applied to your chosen sides.`);
        pulledRef.current();
      } else if (r?.status === "needs_review") setConfirmation("Your payment is being reviewed. No pulls have been applied yet; please do not pay again.");
      else if (r?.status === "failed" || r?.status === "expired") setConfirmation("Payment failed or expired. No pulls were applied.");
      else { setConfirmation("Payment confirmation pending. Please do not pay again."); if (n++ < 30) timer = setTimeout(tick, 4000); }
    };
    tick().catch(() => setConfirmation("Payment confirmation pending."));
    return () => { stop = true; if (timer) clearTimeout(timer); };
  }, [read, orderId]);
  const loadOptions = () => { if (!options) void list().then(setOptions).catch(() => setOptions([])); };
  const addMatchup = (id: string) => {
    const m = options?.find((o) => o.id === id); if (!m || lines.length >= BASKET_MAX_MATCHUPS || lines.some((l) => l.matchupId === id)) return;
    setLines((current) => { const next = [...current, { matchupId: m.id, title: m.title, sides: m.sides, sideId: m.sides[0]?.id || "", pulls: 1 }]; const split = splitPulls(Math.max(basketTotal(current), BASKET_MIN_PULLS), next.length); return next.map((l, i) => ({ ...l, pulls: split[i]! })); });
  };
  const updateLine = (i: number, patch: Partial<Line>) => setLines((current) => current.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  if (paused) return <p className="mt-8 border-y border-border py-5 text-muted-foreground">Pulls are paused for a moment. Check back soon.</p>;
  const available = (options ?? []).filter((o) => !lines.some((l) => l.matchupId === o.id));
  return <section ref={section} className="mt-8 border-y-2 border-foreground py-6" aria-label="Pull the rope">
    <h2 className="font-display text-2xl font-extrabold">Pull the rope</h2>
    <p className="mt-2 text-muted-foreground">From $5 · $1 per pull. One payment can cover up to {BASKET_MAX_MATCHUPS} different matchups, applied immediately after confirmed payment. No stored balance.</p>
    {confirmation && <p role="status" className="mt-3 font-semibold">{confirmation}</p>}
    <div className="mt-4 grid grid-cols-4 gap-2">
      {BASKET_QUICK_PICKS.map((p) => <Button key={p} variant={p === total ? "default" : "outline"} aria-pressed={p === total} onClick={() => { setCustom(""); setTotal(p); }} className="h-auto flex-col py-3"><span className="font-mono text-xl">${p}</span><span>{p} pulls</span></Button>)}
      <label className="flex flex-col justify-center rounded-md border border-input px-2 py-1 text-xs text-muted-foreground">Custom $
        <Input aria-label="Custom amount in dollars" inputMode="numeric" placeholder="5–500" value={custom} className="mt-1 h-8 border-0 p-0 font-mono text-base text-foreground shadow-none focus-visible:ring-0"
          onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 3); setCustom(v); const n = Number(v); if (isWholeBasketAmount(n)) setTotal(n); }} />
      </label>
    </div>
    {custom && !isWholeBasketAmount(Number(custom)) && <p className="mt-2 text-sm text-destructive">Enter a whole dollar amount from ${BASKET_MIN_PULLS} to ${BASKET_MAX_PULLS}.</p>}
    <ol className="mt-5 space-y-4">
      {lines.map((l, i) => <li key={l.matchupId} className="rounded-xl border border-border p-3">
        <div className="flex items-center justify-between gap-2"><p className="font-semibold">{l.title}</p>
          {i > 0 && <Button variant="ghost" size="sm" onClick={() => setLines((c) => c.filter((_, j) => j !== i))} aria-label={`Remove ${l.title}`}>Remove</Button>}</div>
        <div className="mt-2 grid grid-cols-2 gap-2">{l.sides.map((s) => <Button key={s.id} variant={l.sideId === s.id ? "default" : "outline"} aria-pressed={l.sideId === s.id} onClick={() => updateLine(i, { sideId: s.id })} className="h-auto min-h-12 whitespace-normal py-3">
          {i === 0 ? <SideAvatar side={sides.find((x) => x.id === s.id)} /> : <span aria-hidden>{s.emoji}</span>}{s.name}</Button>)}</div>
        {lines.length > 1 && <label className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">Pulls
          <Input aria-label={`Pulls for ${l.title}`} inputMode="numeric" className="h-9 w-20 font-mono" value={String(l.pulls)} onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, "").slice(0, 3)); updateLine(i, { pulls: Math.max(1, n || 1) }); setCustom(""); }} />
          <span>${l.pulls}</span></label>}
      </li>)}
    </ol>
    {lines.length < BASKET_MAX_MATCHUPS && <div className="mt-3" onPointerDown={loadOptions} onFocus={loadOptions}>
      <Select value="" onValueChange={addMatchup} onOpenChange={(open) => { if (open) loadOptions(); }}>
        <SelectTrigger aria-label="Add another matchup"><SelectValue placeholder={`+ Add another matchup (${lines.length}/${BASKET_MAX_MATCHUPS})`} /></SelectTrigger>
        <SelectContent>{options === null ? <SelectItem value="loading" disabled>Loading matchups…</SelectItem> : available.length === 0 ? <SelectItem value="none" disabled>No other matchups available</SelectItem> : available.map((o) => <SelectItem key={o.id} value={o.id}>{o.title}</SelectItem>)}</SelectContent>
      </Select>
      <p className="mt-1 text-xs text-muted-foreground">Each matchup can be added once, with one side.</p>
    </div>}
    <div className="mt-4 grid gap-3 sm:grid-cols-2"><Input aria-label="Display name" placeholder="Display name (optional)" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} /><Input aria-label="Shout-out" placeholder="Shout-out (optional)" value={shout} maxLength={80} onChange={(e) => setShout(e.target.value)} /></div>
    <Turnstile ref={ts} action={TURNSTILE_ACTIONS.pull} onToken={(t) => { setToken(t); if (t) void emit("turnstile_passed"); }} className="mt-4" />
    {!ready && <p className="mt-4 text-sm text-muted-foreground">{message || "Checkout is unavailable. No payment has been taken."}</p>}
    {!isWholeBasketAmount(total) && <p className="mt-3 text-sm text-destructive">Your basket must total between ${BASKET_MIN_PULLS} and ${BASKET_MAX_PULLS}.</p>}
    {error && <p role="alert" className="mt-3 text-destructive">{error}</p>}
    <Button className="mt-4 h-auto w-full whitespace-normal py-4" disabled={!ready || busy || !token || !valid} onClick={async () => {
      setBusy(true); setError("");
      try {
        const r = await buy({ data: { funnelId: funnelId.current || (funnelId.current = crypto.randomUUID()), lines: lines.map((l) => ({ matchupId: l.matchupId, sideId: l.sideId, pulls: l.pulls })), name, shout, returnUrl: `${window.location.origin}/m/${slug}`, turnstileToken: token ?? undefined } });
        if ("error" in r) { setError(r.error); void emit("failed"); return; }
        setEnvironment(r.environment); completed.current = false;
        const drawer = await openDodoOverlay(r.url, r.environment, (result) => { if (result === "closed") void emit("cancelled", r.total, "drawer"); setOrderId(r.orderId); setConfirmation("Payment confirmation pending. Please do not pay again."); });
        await emit("opened", r.total, drawer ? "drawer" : "redirect");
        if (drawer) { setOrderId(r.orderId); setConfirmation("Payment confirmation pending. Please do not pay again."); } else window.location.assign(r.url);
      } catch { setError("Checkout could not open. No unverified pulls applied."); void emit("failed"); }
      finally { ts.current?.reset(); setBusy(false); }
    }}>Pay ${total} · {total} pulls{lines.length > 1 ? ` across ${lines.length} matchups` : ` for ${lines[0]?.sides.find((s) => s.id === lines[0]?.sideId)?.name ?? ""}`}</Button>
    <p className="mt-4 text-xs text-muted-foreground">{paymentProviderText("dodo")} One charge of ${total}. Pulls are non-refundable except where required by law; if a matchup stops taking pulls before your payment is applied, that part is refunded automatically. No credits, stored balance, prizes or payouts.</p>
  </section>;
}

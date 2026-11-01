import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Turnstile, type TurnstileHandle } from "./Turnstile";
import { SideAvatar } from "./SideAvatar";
import { TURNSTILE_ACTIONS } from "@/lib/turnstile";
import { buyPullPack, getWallet, spendPulls, getPaymentStatus } from "@/lib/payments.functions";
import { spendOptions, DODO_NOT_READY } from "@/lib/payments/catalog";
import { walletTokenPattern, newWalletToken } from "@/lib/payments/wallet";
import type { Side } from "@/lib/tugg.functions";
import { Copy } from "lucide-react";

export function PullPanel({ sides, slug, paused, onPulled }: { sides: Side[]; slug: string; paused: boolean; onPulled: () => void }) {
  const buy = useServerFn(buyPullPack), spend = useServerFn(spendPulls), read = useServerFn(getWallet), status = useServerFn(getPaymentStatus);
  const [wallet, setWallet] = useState("");
  const [balance, setBalance] = useState(0), [flagged, setFlagged] = useState(false);
  const [side, setSide] = useState(sides[0]?.id || ""), [name, setName] = useState(""), [shout, setShout] = useState("");
  const [token, setToken] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [ready, setReady] = useState<boolean | null>(null), [confirmed, setConfirmed] = useState(false);
  const [recovery, setRecovery] = useState("");
  const ts = useRef<TurnstileHandle>(null);
  useEffect(() => {
    let stopped = false, timer: ReturnType<typeof setTimeout> | undefined;
    let n = 0;
    const fragment = new URLSearchParams(window.location.hash.slice(1)).get("wallet");
    if (fragment) history.replaceState(null, "", window.location.pathname + window.location.search);
    const boot = async () => {
      const configuration = await status(); if (stopped) return; setReady(configuration.ready);
      const key = `tugg-wallet-${configuration.environment}`;
      let stored = "";
      try { stored = localStorage.getItem(key) || ""; } catch { /* browser may disable storage */ }
      const current = fragment && walletTokenPattern.test(fragment) ? fragment : stored;
      if (!walletTokenPattern.test(current)) return;
      setWallet(current);
      if (fragment) {
        try { localStorage.setItem(key, current); } catch { /* recovery still works for this visit */ }
      }
      const link = `${window.location.origin}/m/${slug}#wallet=${current}`;
      setRecovery(link);
      const orderId = new URLSearchParams(window.location.search).get("order");
      const tick = async () => {
        const r = await read({ data: { token: current, ...(orderId ? { orderId } : {}) } });
        if (stopped) return;
        if ("error" in r) { setError(r.error); return; }
        setBalance(r.balance); setFlagged(r.flagged); setConfirmed(r.paid || r.balance > 0);
        if (orderId && !r.paid && n++ < 60) timer = setTimeout(tick, 2000);
      };
      await tick();
    };
    boot().catch(() => { if (!stopped) setError("Could not load your pulls. Please try again."); });
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [slug, read, status]);
  async function purchase(pack: 5 | 10 | 25) {
    setBusy(true); setError("");
    try {
      const configuration = await status();
      const current = wallet || newWalletToken();
      try { localStorage.setItem(`tugg-wallet-${configuration.environment}`, current); }
      catch { setError("Your browser cannot save your wallet. Enable browser storage before paying."); return; }
      setWallet(current);
      const r = await buy({ data: { pack, token: current, returnUrl: `${window.location.origin}/m/${slug}`, turnstileToken: token ?? undefined } });
      if ("error" in r) { setError(r.error); return; }
      window.location.assign(r.url);
    } catch { setError("Dodo checkout could not open. No pulls have been credited."); }
    finally { ts.current?.reset(); setBusy(false); }
  }
  async function pull(quantity: 1 | 5 | 10) {
    setBusy(true); setError("");
    try {
      const r = await spend({ data: { token: wallet, sideId: side, quantity, requestId: crypto.randomUUID(), name, shout, turnstileToken: token ?? undefined } });
      if ("error" in r) setError(r.error);
      else { setBalance(r.balance); onPulled(); }
    } catch { setError("Could not confirm this pull. Check your balance before trying again."); }
    finally { ts.current?.reset(); setBusy(false); }
  }
  if (paused) return <p className="mt-8 border-y border-border py-5 text-muted-foreground">Pulls are paused for a moment. Check back soon.</p>;
  return <section className="mt-8 border-y-2 border-foreground py-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-2xl font-extrabold">Pull the rope</h2><p className="font-mono">{balance} pulls remaining</p></div>
    {flagged && <p role="alert" className="mt-3 text-destructive">This wallet is under payment review.</p>}
    {balance > 0 ? <>
      <div className="mt-4 grid grid-cols-2 gap-3">{sides.map((s) => <Button key={s.id} variant={side === s.id ? "default" : "outline"} aria-pressed={side === s.id} onClick={() => setSide(s.id)} className="h-auto min-h-16 whitespace-normal py-4"><SideAvatar side={s} />{s.name}</Button>)}</div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Display name (optional)" /><Input value={shout} onChange={(e) => setShout(e.target.value)} maxLength={80} placeholder="Shout-out (optional)" /></div>
      <div className="mt-4 flex flex-wrap gap-2">{spendOptions(balance).map((q) => <Button key={q} disabled={busy || !token || flagged} onClick={() => pull(q as 1 | 5 | 10)} className="h-auto whitespace-normal py-3">{q === 1 ? `Pull $1 for ${sides.find((s) => s.id === side)?.name}` : `×${q} · $${q}`}</Button>)}</div>
    </> : <>
      <p className="mt-3 text-muted-foreground">Buy pulls in packs. Each pull is $1. Unused pulls never expire.</p>
      {ready === false && <p className="mt-3 text-sm text-muted-foreground">{DODO_NOT_READY}</p>}
      <div className="mt-4 grid grid-cols-3 gap-2">{([5, 10, 25] as const).map((p) => <Button key={p} variant="outline" disabled={busy || !token || flagged || ready !== true} onClick={() => purchase(p)} className="h-auto flex-col py-4"><span className="font-mono text-xl">${p}</span><span>{p} pulls</span></Button>)}</div>
    </>}
    {(ready || balance > 0) && <Turnstile ref={ts} action={TURNSTILE_ACTIONS.pull} onToken={setToken} className="mt-4" />}
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {confirmed && recovery && <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4"><p className="text-sm text-muted-foreground">Save this link to restore your pulls on another device.</p><Button variant="outline" onClick={() => navigator.clipboard.writeText(recovery).catch(() => setError("Clipboard unavailable. Copy the recovery link below."))}><Copy />Copy recovery link</Button><Input readOnly value={recovery} aria-label="Wallet recovery link" /></div>}
    <p className="mt-4 text-xs text-muted-foreground">Packs are non-refundable except where required by law. No prizes or payouts. Dodo Payments is the merchant of record.</p>
  </section>;
}
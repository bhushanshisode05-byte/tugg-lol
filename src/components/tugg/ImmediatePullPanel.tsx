import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Turnstile, type TurnstileHandle } from "./Turnstile";
import { SideAvatar } from "./SideAvatar";
import { BillingFields, emptyBilling } from "./BillingFields";
import { billingSchema } from "@/lib/payments/billing";
import { buyImmediateBundle, getImmediatePayment } from "@/lib/immediate-payments.functions";
import { TURNSTILE_ACTIONS } from "@/lib/turnstile";
import type { Side } from "@/lib/tugg.functions";
export function ImmediatePullPanel({ sides, slug, paused, onPulled, ready, message }: { sides: Side[]; slug: string; paused: boolean; onPulled: () => void; ready: boolean; message: string }) {
  const buy=useServerFn(buyImmediateBundle), read=useServerFn(getImmediatePayment);
  const [side,setSide]=useState(sides[0]?.id || ""),[pack,setPack]=useState<5|10|25>(5),[name,setName]=useState(""),[shout,setShout]=useState("");
  const [billing,setBilling]=useState(emptyBilling),[token,setToken]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[confirmation,setConfirmation]=useState("");
  const ts=useRef<TurnstileHandle>(null);
  const pulledRef=useRef(onPulled);
  useEffect(()=>{pulledRef.current=onPulled;},[onPulled]);
  useEffect(()=>{
    const id=new URLSearchParams(window.location.search).get("payment"); if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return;
    let stop=false, n=0, timer: ReturnType<typeof setTimeout>|undefined;
    const tick=async()=> { const r=await read({data:{orderId:id}}); if(stop)return;
      if(r?.status === "paid") {setConfirmation(`${r.quantity} pulls applied to your chosen side.`);pulledRef.current();}
      else if(r?.status === "failed" || r?.status === "expired") setConfirmation("Payment failed or expired. No pulls were applied.");
      else {setConfirmation("Payment confirmation pending. Please do not pay again.");if(n++<30)timer=setTimeout(tick,4000);}
    };tick().catch(()=>setConfirmation("Payment confirmation pending."));return()=>{stop=true;if(timer)clearTimeout(timer);};
  },[read]);
  if(paused)return <p className="mt-8 border-y border-border py-5 text-muted-foreground">Pulls are paused for a moment. Check back soon.</p>;
  return <section className="mt-8 border-y-2 border-foreground py-6"><h2 className="font-display text-2xl font-extrabold">Pull the rope</h2>
    <p className="mt-2 text-muted-foreground">One-time bundles. $1 per pull, applied to your side after confirmed payment. No stored balance.</p>
    {confirmation && <p role="status" className="mt-3 font-semibold">{confirmation}</p>}
    <div className="mt-4 grid grid-cols-2 gap-3">{sides.map(s=><Button key={s.id} variant={side===s.id?"default":"outline"} aria-pressed={side===s.id} onClick={()=>setSide(s.id)} className="h-auto min-h-16 whitespace-normal py-4"><SideAvatar side={s}/>{s.name}</Button>)}</div>
    <div className="mt-4 grid grid-cols-3 gap-2">{([5,10,25] as const).map(p=><Button key={p} variant={p===pack?"default":"outline"} aria-pressed={p===pack} onClick={()=>setPack(p)} className="h-auto flex-col py-3"><span className="font-mono text-xl">${p}</span><span>{p} pulls</span></Button>)}</div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2"><Input aria-label="Display name" placeholder="Display name (optional)" value={name} maxLength={40} onChange={e=>setName(e.target.value)}/><Input aria-label="Shout-out" placeholder="Shout-out (optional)" value={shout} maxLength={80} onChange={e=>setShout(e.target.value)}/></div>
    {ready && <><BillingFields value={billing} onChange={setBilling}/><Turnstile ref={ts} action={TURNSTILE_ACTIONS.pull} onToken={setToken} className="mt-4"/></>}
    {!ready && <p className="mt-4 text-sm text-muted-foreground">{message || "PayGlocal checkout is unavailable. No payment has been taken."}</p>}
    {error && <p role="alert" className="mt-3 text-destructive">{error}</p>}
    <Button className="mt-4 h-auto w-full whitespace-normal py-4" disabled={!ready||busy||!token||!billingSchema.safeParse(billing).success||!side} onClick={async()=>{setBusy(true);setError("");try{const r=await buy({data:{sideId:side,pack,name,shout,billing,returnUrl:`${window.location.origin}/m/${slug}`,turnstileToken:token??undefined}});if("error" in r)setError(r.error);else window.location.assign(r.url);}catch{setError("Checkout could not open. No unverified pulls applied.");}finally{ts.current?.reset();setBusy(false);}}}>Pay ${pack} · {pack} pulls for {sides.find(s=>s.id===side)?.name}</Button>
    <p className="mt-4 text-xs text-muted-foreground">PayGlocal (RBI-authorised) processes payments. Bundles are non-refundable except where required by law. No prizes or payouts.</p>
  </section>;
}
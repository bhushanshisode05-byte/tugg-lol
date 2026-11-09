import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Turnstile, type TurnstileHandle } from "./Turnstile";
import { SideAvatar } from "./SideAvatar";
import { BillingFields, emptyBilling } from "./BillingFields";
import { billingSchema } from "@/lib/payments/billing";
import { buyImmediateBundle, getImmediatePayment, getCodeDropConfig, recordPaymentFunnel } from "@/lib/immediate-payments.functions";
import { TURNSTILE_ACTIONS } from "@/lib/turnstile";
import { openCodeDrop } from "@/lib/payments/codedrop";
import { openDodoOverlay } from "@/lib/payments/dodo-overlay";
import { paymentProviderText } from "@/lib/payments/copy";
import type { Side } from "@/lib/tugg.functions";
export function ImmediatePullPanel({ sides, slug, paused, onPulled, ready, message, provider = "dodo" }: { sides: Side[]; slug: string; paused: boolean; onPulled: () => void; ready: boolean; message: string; provider?: string }) {
  const buy=useServerFn(buyImmediateBundle), read=useServerFn(getImmediatePayment);
  const [side,setSide]=useState(sides[0]?.id || ""),[pack,setPack]=useState<5|10|25>(5),[name,setName]=useState(""),[shout,setShout]=useState("");
  const [billing,setBilling]=useState(emptyBilling),[token,setToken]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[confirmation,setConfirmation]=useState("");
  const ts=useRef<TurnstileHandle>(null);
  const funnel=useServerFn(recordPaymentFunnel), settings=useServerFn(getCodeDropConfig);
  const funnelId=useRef(""); const viewed=useRef(false); const section=useRef<HTMLElement>(null);
  const [environment,setEnvironment]=useState<"sandbox"|"live">("sandbox");
  const [orderId,setOrderId]=useState("");
  const completed=useRef(false); const failed=useRef(false);
  const emit = (step: "viewed"|"bundle_selected"|"turnstile_passed"|"opened"|"cancelled"|"abandoned"|"failed", bundle: 5|10|25 = pack, mode: "none"|"drawer"|"redirect" = "none") => {
    if (!funnelId.current) funnelId.current=crypto.randomUUID();
    window.__lovableEvents?.track?.("project.payment_funnel", {step,bundle,mode,environment});
    return funnel({data:{funnelId:funnelId.current,step,bundle,mode}}).catch(()=>{});
  };
  useEffect(()=>{
    void settings().then(c=>setEnvironment(c.environment)).catch(()=>{});
    const id=new URLSearchParams(window.location.search).get("payment");
    if(id && /^[0-9a-f-]{36}$/i.test(id)) {setOrderId(id);try{const saved=sessionStorage.getItem(`tugg-funnel-${id}`);if(saved && /^[0-9a-f-]{36}$/i.test(saved))funnelId.current=saved;}catch{/* Storage may be disabled; checkout still works. */}}
    const el=section.current; if(!el || typeof IntersectionObserver === "undefined")return;
    const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)&&!viewed.current){viewed.current=true;emit("viewed");observer.disconnect();}});
    observer.observe(el); return()=>observer.disconnect();
  },[]);
  const pulledRef=useRef(onPulled);
  useEffect(()=>{pulledRef.current=onPulled;},[onPulled]);
  useEffect(()=>{
    const id=orderId; if (!id) return;
    let stop=false, n=0, timer: ReturnType<typeof setTimeout>|undefined;
    const tick=async()=> { const r=await read({data:{orderId:id}}); if(stop)return;
      if(r?.status === "paid") {if(!completed.current){completed.current=true;window.__lovableEvents?.track?.("project.payment_funnel",{step:"completed",bundle:r.quantity,mode:"none",environment});}setConfirmation(`${r.quantity} pulls applied to your chosen side.`);pulledRef.current();}
      else if(r?.status === "failed" || r?.status === "expired") {setConfirmation("Payment failed or expired. No pulls were applied."); if(!failed.current){failed.current=true;window.__lovableEvents?.track?.("project.payment_funnel",{step:"failed",bundle:r.quantity,mode:"none",environment});}}
      else {setConfirmation("Payment confirmation pending. Please do not pay again.");if(n++<30)timer=setTimeout(tick,4000);}
    };tick().catch(()=>setConfirmation("Payment confirmation pending."));return()=>{stop=true;if(timer)clearTimeout(timer);};
  },[read,orderId,environment]);
  if(paused)return <p className="mt-8 border-y border-border py-5 text-muted-foreground">Pulls are paused for a moment. Check back soon.</p>;
  return <section ref={section} className="mt-8 border-y-2 border-foreground py-6"><h2 className="font-display text-2xl font-extrabold">Pull the rope</h2>
    <p className="mt-2 text-muted-foreground">From $5 · $1 per pull. One-time bundles, applied to your side after confirmed payment. No stored balance.</p>
    {confirmation && <p role="status" className="mt-3 font-semibold">{confirmation}</p>}
    <div className="mt-4 grid grid-cols-2 gap-3">{sides.map(s=><Button key={s.id} variant={side===s.id?"default":"outline"} aria-pressed={side===s.id} onClick={()=>setSide(s.id)} className="h-auto min-h-16 whitespace-normal py-4"><SideAvatar side={s}/>{s.name}</Button>)}</div>
    <div className="mt-4 grid grid-cols-3 gap-2">{([5,10,25] as const).map(p=><Button key={p} variant={p===pack?"default":"outline"} aria-pressed={p===pack} onClick={()=>{setPack(p);emit("bundle_selected",p);}} className="h-auto flex-col py-3"><span className="font-mono text-xl">${p}</span><span>{p} pulls</span></Button>)}</div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2"><Input aria-label="Display name" placeholder="Display name (optional)" value={name} maxLength={40} onChange={e=>setName(e.target.value)}/><Input aria-label="Shout-out" placeholder="Shout-out (optional)" value={shout} maxLength={80} onChange={e=>setShout(e.target.value)}/></div>
    {ready && provider === "payglocal" && <BillingFields value={billing} onChange={setBilling}/>}
    <Turnstile ref={ts} action={TURNSTILE_ACTIONS.pull} onToken={t=>{setToken(t);if(t)emit("turnstile_passed");}} className="mt-4"/>
    {!ready && <p className="mt-4 text-sm text-muted-foreground">{message || "Checkout is unavailable. No payment has been taken."}</p>}
    {error && <p role="alert" className="mt-3 text-destructive">{error}</p>}
    <Button className="mt-4 h-auto w-full whitespace-normal py-4" disabled={!ready||busy||!token||(provider === "payglocal" && !billingSchema.safeParse(billing).success)||!side} onClick={async()=>{setBusy(true);setError("");try{const r=await buy({data:{funnelId:funnelId.current || (funnelId.current=crypto.randomUUID()),sideId:side,pack,name,shout,...(provider === "payglocal" ? {billing}:{}),returnUrl:`${window.location.origin}/m/${slug}`,turnstileToken:token??undefined}});if("error" in r){setError(r.error);emit("failed");}else {
      setEnvironment(r.environment); completed.current=false; failed.current=false;
      try{sessionStorage.setItem(`tugg-funnel-${r.orderId}`,funnelId.current);}catch{/* Anonymous continuity is optional. */}
      const drawer=r.provider === "dodo" ? await openDodoOverlay(r.url,r.environment,result=>{
        if(result === "closed") void emit("cancelled",pack,"drawer");
        setOrderId(r.orderId);setConfirmation("Payment confirmation pending. Please do not pay again.");
      }) : await openCodeDrop({codedropId:r.codedropId,environment:r.environment,redirectUrl:r.url},result=>{
        if(result==="cancelled"||result==="abandoned"||result==="failed") {emit(result,pack,"drawer");setConfirmation(result==="failed"?"Payment failed. Confirmation will be checked.":"Payment closed. Confirmation will be checked.");}
        else setConfirmation("Payment confirmation pending. Please do not pay again.");
        setOrderId(r.orderId);
      });
      await emit("opened",pack,drawer?"drawer":"redirect");
      if(drawer){setOrderId(r.orderId);setConfirmation("Payment confirmation pending. Please do not pay again.");}else window.location.assign(r.url);
    }}catch{setError("Checkout could not open. No unverified pulls applied.");emit("failed");}finally{ts.current?.reset();setBusy(false);}}}>Pay ${pack} · {pack} pulls for {sides.find(s=>s.id===side)?.name}</Button>
    <p className="mt-4 text-xs text-muted-foreground">{paymentProviderText(provider)} Bundles are non-refundable except where required by law. No credits, stored balance, prizes or payouts.</p>
  </section>;
}
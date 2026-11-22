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
import { paymentStatementText } from "@/lib/payments/copy";
import { usePaymentConfirmation } from "@/hooks/use-payment-confirmation";
import { PaymentConfirmation } from "./PaymentReceipt";
import type { PaymentResult } from "@/lib/payments/confirmation";
import type { Side } from "@/lib/tugg.functions";
import { ENGAGEMENT_DISCLOSURE } from "@/lib/engagement/rules";
import { customDollarsError } from "@/lib/payments/custom-pull";
import { AvailabilityNote, type AvailabilityStatus } from "./AvailabilityNote";
export function ImmediatePullPanel({ sides, slug, paused, onPulled, status, message, onRetry, provider = "dodo" }: { sides: Side[]; slug: string; paused: boolean; onPulled: () => void; status: AvailabilityStatus; message: string; onRetry: () => void; provider?: string }) {
  const ready = status === "ready";
  const buy=useServerFn(buyImmediateBundle), read=useServerFn(getImmediatePayment);
  const [side,setSide]=useState(sides[0]?.id || ""),[pack,setPack]=useState<5|10|25|"custom">(5),[name,setName]=useState(""),[shout,setShout]=useState("");
  const [custom,setCustom]=useState("10");
  const amountError = pack === "custom" ? customDollarsError(custom) : "";
  const pulls = pack === "custom" ? (amountError ? 0 : Number(custom)) : pack;
  const [dismissed,setDismissed]=useState(false);
  const [billing,setBilling]=useState(emptyBilling),[token,setToken]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const ts=useRef<TurnstileHandle>(null);
  const funnel=useServerFn(recordPaymentFunnel), settings=useServerFn(getCodeDropConfig);
  const funnelId=useRef(""); const viewed=useRef(false); const section=useRef<HTMLElement>(null);
  const [environment,setEnvironment]=useState<"sandbox"|"live">("sandbox");
  const completed=useRef(false); const failed=useRef(false);
  const emit = (step: "viewed"|"bundle_selected"|"turnstile_passed"|"opened"|"cancelled"|"abandoned"|"failed", bundle: number = pulls, mode: "none"|"drawer"|"redirect" = "none") => {
    if (!funnelId.current) funnelId.current=crypto.randomUUID();
    window.__lovableEvents?.track?.("project.payment_funnel", {step,bundle,mode,environment});
    return funnel({data:{funnelId:funnelId.current,step,bundle,mode}}).catch(()=>{});
  };
  useEffect(()=>{
    void settings().then(c=>setEnvironment(c.environment)).catch(()=>{});
    const id=new URLSearchParams(window.location.search).get("payment");
    if(id && /^[0-9a-f-]{36}$/i.test(id)) {confirm.track(id);try{const saved=sessionStorage.getItem(`tugg-funnel-${id}`);if(saved && /^[0-9a-f-]{36}$/i.test(saved))funnelId.current=saved;}catch{/* Storage may be disabled; checkout still works. */}}
    const el=section.current; if(!el || typeof IntersectionObserver === "undefined")return;
    const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)&&!viewed.current){viewed.current=true;emit("viewed");observer.disconnect();}});
    observer.observe(el); return()=>observer.disconnect();
  },[]);
  const onPaid=(r: PaymentResult)=>{if(!completed.current){completed.current=true;window.__lovableEvents?.track?.("project.payment_funnel",{step:"completed",bundle:r.quantity,mode:"none",environment});}onPulled();};
  const confirm=usePaymentConfirmation((id)=>read({data:{orderId:id}}),onPaid);
  const phase=confirm.state.phase;
  useEffect(()=>{if(phase==="failed"&&!failed.current){failed.current=true;window.__lovableEvents?.track?.("project.payment_funnel",{step:"failed",bundle:confirm.state.result?.quantity ?? pulls,mode:"none",environment});}// eslint-disable-next-line react-hooks/exhaustive-deps
  },[phase]);
  if(paused)return <p className="mt-8 border-y border-border py-5 text-muted-foreground">Pulls are paused for a moment. Check back soon.</p>;
  return <section ref={section} className="mt-8 border-y-2 border-foreground py-6"><h2 className="font-display text-2xl font-extrabold">Pull the rope</h2>
    <p className="mt-2 text-muted-foreground">From $5 · $1 per pull. Bundles or whole-dollar amounts up to $1,000, applied after confirmed payment. No stored balance.</p>
    <PaymentConfirmation state={confirm.state} paidText={`${confirm.state.result?.quantity ?? pulls} pulls applied to your chosen side.`} onCheckAgain={confirm.checkAgain} dismissed={dismissed} onDismiss={()=>setDismissed(true)}/>
    <div className="mt-4 grid grid-cols-2 gap-3">{sides.map(s=><Button key={s.id} variant={side===s.id?"default":"outline"} aria-pressed={side===s.id} onClick={()=>setSide(s.id)} className="h-auto min-h-16 whitespace-normal py-4"><SideAvatar side={s}/>{s.name}</Button>)}</div>
    <div className={`mt-4 grid ${provider === "dodo" ? "grid-cols-4" : "grid-cols-3"} gap-2`}>{([5,10,25] as const).map(p=><Button key={p} variant={p===pack?"default":"outline"} aria-pressed={p===pack} onClick={()=>{setPack(p);emit("bundle_selected",p);}} className="h-auto flex-col py-3"><span className="font-mono text-xl">${p}</span><span>{p} pulls</span></Button>)}{provider === "dodo" && <Button variant={pack === "custom" ? "default" : "outline"} aria-pressed={pack === "custom"} onClick={()=>{setPack("custom");if(!customDollarsError(custom))void emit("bundle_selected",Number(custom));}} className="h-auto flex-col py-3"><span className="font-mono text-xl">Other</span><span>$5–$1,000</span></Button>}</div>
    {pack === "custom" && <div className="mt-4"><label htmlFor="custom-pull-dollars" className="text-sm">Amount in US dollars</label><Input id="custom-pull-dollars" type="number" inputMode="numeric" min={5} max={1000} step={1} value={custom} aria-invalid={!!amountError} aria-describedby="custom-pull-note" onChange={e=>setCustom(e.target.value)} className="mt-2"/><p id="custom-pull-note" role={amountError ? "alert" : "status"} className={`mt-2 text-sm ${amountError ? "text-destructive" : "text-muted-foreground"}`}>{amountError || `${pulls} pulls`}</p></div>}
    <div className="mt-4 grid gap-3 sm:grid-cols-2"><Input aria-label="Display name" placeholder="Display name (optional)" value={name} maxLength={40} onChange={e=>setName(e.target.value)}/><Input aria-label="Shout-out" placeholder="Shout-out (optional)" value={shout} maxLength={80} onChange={e=>setShout(e.target.value)}/></div>
    {ready && provider === "payglocal" && <BillingFields value={billing} onChange={setBilling}/>}
    <Turnstile ref={ts} action={TURNSTILE_ACTIONS.pull} onToken={t=>{setToken(t);if(t)emit("turnstile_passed");}} className="mt-4"/>
    <AvailabilityNote status={status} message={message} onRetry={onRetry}/>
    {error && <p role="alert" className="mt-3 text-destructive">{error}</p>}
    <Button className="mt-4 h-auto w-full whitespace-normal py-4" disabled={!!amountError||!ready||busy||!token||(provider === "payglocal" && !billingSchema.safeParse(billing).success)||!side} onClick={async()=>{setBusy(true);setError("");try{const r=await buy({data:{funnelId:funnelId.current || (funnelId.current=crypto.randomUUID()),sideId:side,pack,...(pack === "custom" ? {customCents:pulls*100}:{}),name,shout,...(provider === "payglocal" ? {billing}:{}),returnUrl:`${window.location.origin}/m/${slug}`,turnstileToken:token??undefined}});if("error" in r){setError(r.error);emit("failed");}else {
      setEnvironment(r.environment); completed.current=false; failed.current=false; setDismissed(false);
      try{sessionStorage.setItem(`tugg-funnel-${r.orderId}`,funnelId.current);}catch{/* Anonymous continuity is optional. */}
      const drawer=r.provider === "dodo" ? await openDodoOverlay(r.url,r.environment,result=>{
        if(result === "closed") void emit("cancelled",pulls,"drawer");
        confirm.track(r.orderId);confirm.signal(result);
      }) : await openCodeDrop({codedropId:r.codedropId,environment:r.environment,redirectUrl:r.url},result=>{
        if(result==="cancelled"||result==="abandoned"||result==="failed") emit(result,pulls,"drawer");
        confirm.track(r.orderId);confirm.signal(result==="cancelled"||result==="abandoned"?"closed":result==="failed"?"failed":"status");
      });
      await emit("opened",pulls,drawer?"drawer":"redirect");
      if(drawer)confirm.track(r.orderId);else window.location.assign(r.url);
    }}catch{setError("Checkout could not open. No unverified pulls applied.");emit("failed");}finally{ts.current?.reset();setBusy(false);}}}>Pay ${pulls || "—"} · {pulls} pulls for {sides.find(s=>s.id===side)?.name}</Button>
    <p className="mt-3 text-sm text-foreground" data-payment-descriptor>{paymentStatementText(provider)}</p>
    <p className="mt-2 text-xs text-muted-foreground">Bundles are non-refundable except where required by law. No credits, stored balance, prizes or payouts.</p>
    <p className="mt-2 text-xs text-muted-foreground" data-engagement-disclosure>{ENGAGEMENT_DISCLOSURE}</p>
  </section>;
}
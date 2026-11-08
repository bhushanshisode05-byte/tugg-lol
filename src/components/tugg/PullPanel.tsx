import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getPaymentStatus } from "@/lib/payments.functions";
import type { Side } from "@/lib/tugg.functions";
import { ImmediatePullPanel } from "./ImmediatePullPanel";

export function PullPanel(props: { sides: Side[]; slug: string; paused: boolean; onPulled: () => void }) {
  const status=useServerFn(getPaymentStatus);
  const [configuration,setConfiguration]=useState<Awaited<ReturnType<typeof getPaymentStatus>>|null>(null);
  useEffect(()=>{status().then(setConfiguration).catch(()=>setConfiguration(null));},[status]);
  return <ImmediatePullPanel {...props} paused={props.paused || !!configuration?.paused} provider={configuration?.provider || "dodo"} ready={!!configuration?.ready} message={configuration?.message || "Dodo checkout is not configured yet. No payment has been taken. Please try again later."}/>;
}

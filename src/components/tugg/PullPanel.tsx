import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getPaymentStatus } from "@/lib/payments.functions";
import type { Side } from "@/lib/tugg.functions";
import { ImmediatePullPanel } from "./ImmediatePullPanel";
import { BasketPullPanel } from "./BasketPullPanel";

export function PullPanel(props: { matchupId: string; title: string; sides: Side[]; slug: string; paused: boolean; onPulled: () => void }) {
  const status=useServerFn(getPaymentStatus);
  const [configuration,setConfiguration]=useState<Awaited<ReturnType<typeof getPaymentStatus>>|null>(null);
  useEffect(()=>{status().then(setConfiguration).catch(()=>setConfiguration(null));},[status]);
  const message = configuration?.message || "Dodo checkout is not configured yet. No payment has been taken. Please try again later.";
  const paused = props.paused || !!configuration?.paused;
  // PULL_BASKET_ENABLED (server-side, Dodo only) switches to the basket; otherwise the fixed 5/10/25 bundles.
  if (configuration?.basket) return <BasketPullPanel {...props} paused={paused} ready={configuration.ready} message={message}/>;
  const { sides, slug, onPulled } = props;
  return <ImmediatePullPanel sides={sides} slug={slug} onPulled={onPulled} paused={paused} provider={configuration?.provider || "dodo"} ready={!!configuration?.ready} message={message}/>;
}

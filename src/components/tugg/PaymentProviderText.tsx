import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getPaymentStatus } from "@/lib/payments.functions";
import { paymentProviderText, pullOfferFooter } from "@/lib/payments/copy";
export function PaymentProviderText() {
  const read = useServerFn(getPaymentStatus);
  const [provider,setProvider] = useState("dodo");
  useEffect(() => { void read().then(s=>setProvider(s.provider)).catch(()=>{}); },[read]);
  return <>{paymentProviderText(provider)}</>;
}
/** Footer offer line; follows PULL_BASKET_ENABLED. The no-credits/no-payouts sentence stays static beside it. */
export function PullOfferText() {
  const read = useServerFn(getPaymentStatus);
  const [basket,setBasket] = useState(false);
  useEffect(() => { void read().then(s=>setBasket(!!s.basket)).catch(()=>{}); },[read]);
  return <>{pullOfferFooter(basket)}</>;
}

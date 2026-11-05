import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getPaymentStatus } from "@/lib/payments.functions";
import { paymentProviderText } from "@/lib/payments/copy";
export function PaymentProviderText() {
  const read = useServerFn(getPaymentStatus);
  const [provider,setProvider] = useState("dodo");
  useEffect(() => { void read().then(s=>setProvider(s.provider)).catch(()=>{}); },[read]);
  return <>{paymentProviderText(provider)}</>;
}
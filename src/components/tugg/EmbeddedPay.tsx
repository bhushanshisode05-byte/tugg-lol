import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { useMemo } from "react";
import { getStripe } from "@/lib/stripe";

export function EmbeddedPay({ fetchClientSecret }: { fetchClientSecret: () => Promise<string> }) {
  const options = useMemo(() => ({ fetchClientSecret }), []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="overflow-hidden rounded-xl bg-foreground p-1">
      <EmbeddedCheckoutProvider stripe={getStripe()} options={options}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}

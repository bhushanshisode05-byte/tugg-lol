import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getPaymentStatus } from "@/lib/payments.functions";

export function PaymentTestModeBanner() {
  const getStatus = useServerFn(getPaymentStatus);
  const [status, setStatus] = useState<Awaited<ReturnType<typeof getPaymentStatus>> | null>(null);
  useEffect(() => {
    getStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [getStatus]);
  if (!status?.ready) {
    return (
      <div className="w-full border-b border-destructive bg-destructive/20 px-4 py-2 text-center text-sm">
        {status?.message || "PayGlocal checkout is not configured yet. No new payments can be taken."}
      </div>
    );
  }
  if (status.environment === "sandbox") {
    return (
      <div className="w-full border-b border-primary/40 bg-primary/15 px-4 py-2 text-center text-xs font-semibold">
        {status.provider === "payglocal" ? "PayGlocal test mode: 4111 1111 1111 1111 · any future expiry · any 3-digit CVV. Reference card—confirm for your merchant account. No real money moves." : "Dodo test mode: 4242 4242 4242 4242 · expiry 06/32 · CVV 123. No real money moves."}{" "}
        <a
          href={status.provider === "payglocal" ? "https://payglocal.in/docs/guides/testing" : "https://docs.dodopayments.com/miscellaneous/testing-process"}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          Read more
        </a>
      </div>
    );
  }
  return null;
}

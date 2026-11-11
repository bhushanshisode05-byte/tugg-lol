import { useEffect, useRef, useState } from "react";
import { createConfirmationPoller, type ConfirmSignal, type ConfirmState, type PaymentResult } from "@/lib/payments/confirmation";

/** Tracks one stored order until a real end state; calls onPaid once per order when it is confirmed. */
export function usePaymentConfirmation(read: (orderId: string) => Promise<PaymentResult | null | undefined>, onPaid: (result: PaymentResult) => void) {
  const [state, setState] = useState<ConfirmState>({ phase: "idle" });
  const readRef = useRef(read), paidRef = useRef(onPaid), notified = useRef("");
  const orderRef = useRef("");
  useEffect(() => { readRef.current = read; paidRef.current = onPaid; }, [read, onPaid]);
  const poller = useRef<ReturnType<typeof createConfirmationPoller> | null>(null);
  if (!poller.current && typeof window !== "undefined") {
    poller.current = createConfirmationPoller({
      read: (id) => readRef.current(id),
      onChange: (next) => {
        setState(next);
        if (next.phase === "paid" && next.result && notified.current !== orderRef.current) { notified.current = orderRef.current; paidRef.current(next.result); }
      },
    });
  }
  useEffect(() => {
    const p = poller.current; if (!p) return;
    // Phones pause timers in background tabs; check as soon as the buyer comes back.
    const visible = () => { if (document.visibilityState === "visible") p.checkAgain(); };
    document.addEventListener("visibilitychange", visible);
    return () => { document.removeEventListener("visibilitychange", visible); };
  }, []);
  useEffect(() => () => poller.current?.stop(), []);
  return {
    state,
    track: (orderId: string) => { orderRef.current = orderId; poller.current?.track(orderId); },
    signal: (kind: ConfirmSignal) => poller.current?.signal(kind),
    checkAgain: () => poller.current?.checkAgain(),
  };
}

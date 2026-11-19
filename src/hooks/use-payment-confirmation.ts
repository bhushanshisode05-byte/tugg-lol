import { useEffect, useRef, useState } from "react";
import { createConfirmationPoller, type ConfirmPhase, type ConfirmSignal, type ConfirmState, type PaymentResult } from "@/lib/payments/confirmation";

type Options<R> = {
  /** Called once per order when it reaches the "paid" end phase. */
  onPaid?: (result: R) => void;
  phaseFor?: (result: R) => ConfirmPhase | null;
  confirmed?: (result: R) => boolean;
  /** An order to track from the first render (a return from checkout), so the page never flashes its idle state. */
  initialOrderId?: string | undefined;
};

/** Tracks one stored order until a real end state with the shared post-payment poller. */
export function useOrderConfirmation<R extends { status?: string | null | undefined }>(read: (orderId: string) => Promise<R | null | undefined>, options: Options<R> = {}) {
  const [state, setState] = useState<ConfirmState<R>>({ phase: options.initialOrderId ? "checking" : "idle" });
  const readRef = useRef(read), optsRef = useRef(options), notified = useRef(""), orderRef = useRef(options.initialOrderId ?? "");
  const poller = useRef<ReturnType<typeof createConfirmationPoller<R>> | null>(null);
  useEffect(() => { readRef.current = read; optsRef.current = options; });
  useEffect(() => {
    const p = createConfirmationPoller<R>({
      read: (id) => readRef.current(id),
      phaseFor: optsRef.current.phaseFor ? (r) => optsRef.current.phaseFor!(r) : undefined,
      confirmed: (r) => optsRef.current.confirmed?.(r) ?? false,
      onChange: (next) => {
        setState(next);
        if (next.phase === "paid" && next.result && notified.current !== orderRef.current) { notified.current = orderRef.current; optsRef.current.onPaid?.(next.result); }
      },
    });
    poller.current = p;
    if (orderRef.current) p.track(orderRef.current);
    // Phones pause timers in background tabs; check as soon as the buyer comes back.
    const visible = () => { if (document.visibilityState === "visible") p.checkAgain(); };
    document.addEventListener("visibilitychange", visible);
    return () => { document.removeEventListener("visibilitychange", visible); p.stop(); if (poller.current === p) poller.current = null; };
  }, []);
  return {
    state,
    track: (orderId: string) => { orderRef.current = orderId; poller.current?.track(orderId); },
    signal: (kind: ConfirmSignal) => poller.current?.signal(kind),
    checkAgain: () => poller.current?.checkAgain(),
  };
}

/** Tracks one pull order until a real end state; calls onPaid once per order when it is confirmed. */
export function usePaymentConfirmation(read: (orderId: string) => Promise<PaymentResult | null | undefined>, onPaid: (result: PaymentResult) => void) {
  return useOrderConfirmation<PaymentResult>(read, { onPaid });
}

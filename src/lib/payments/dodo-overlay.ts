import type { PaymentsEnv } from "./catalog";
/** closed: buyer closed the window; status: Dodo reported progress; completed: Dodo handed control back after paying. */
export type DodoOverlayEvent = "closed" | "status" | "completed";
let initialized: PaymentsEnv | undefined;
let notify: (event: DodoOverlayEvent) => void = () => {};
let fallback: () => void = () => {};
let close: () => void = () => {};
let handedBack = false;

const reportedStatus = (data: Record<string, unknown> | undefined) => {
  const message = data?.["message"];
  const nested = message && typeof message === "object" ? (message as Record<string, unknown>)["status"] : undefined;
  const value = data?.["status"] ?? nested;
  return typeof value === "string" ? value : "";
};

/** Browser callbacks prompt reads only; never prove payment. Loaded on payment intent.
 *  With manualRedirect Dodo waits for us to navigate after paying, so we close its window
 *  ourselves and let the stored order decide what the buyer sees. */
export async function openDodoOverlay(url: string, environment: PaymentsEnv, onEvent: typeof notify) {
  const destination = new URL(url);
  if (destination.protocol !== "https:" || !destination.hostname.endsWith(".dodopayments.com")) return false;
  try {
    const { DodoPayments } = await import("dodopayments-checkout");
    notify = onEvent;
    handedBack = false;
    fallback = () => window.location.assign(url);
    close = () => { try { if (DodoPayments.Checkout.isOpen()) DodoPayments.Checkout.close(); } catch { /* the stored order still decides */ } };
    if (initialized !== environment) {
      DodoPayments.Initialize({ mode: environment === "sandbox" ? "test" : "live", displayType: "overlay", onEvent: event => {
        if (event.event_type === "checkout.error" || event.event_type === "checkout.link_expired") fallback();
        if (event.event_type === "checkout.closed") { notify(handedBack ? "completed" : "closed"); return; }
        const succeeded = event.event_type === "checkout.status" && reportedStatus(event.data) === "succeeded";
        if (event.event_type === "checkout.redirect_requested" || succeeded) {
          if (!handedBack) { handedBack = true; notify("completed"); }
          close();
          return;
        }
        if (event.event_type === "checkout.status") notify("status");
      }});
      initialized = environment;
    }
    DodoPayments.Checkout.open({ checkoutUrl: url, options: { manualRedirect: true } });
    return DodoPayments.Checkout.isOpen();
  } catch { return false; }
}

import type { PaymentsEnv } from "./catalog";
let initialized: PaymentsEnv | undefined;
let notify: (event: "closed" | "status") => void = () => {};
let fallback: () => void = () => {};

/** Browser callbacks prompt reads only; never prove payment. Loaded on payment intent. */
export async function openDodoOverlay(url: string, environment: PaymentsEnv, onEvent: typeof notify) {
  const destination = new URL(url);
  if (destination.protocol !== "https:" || !destination.hostname.endsWith(".dodopayments.com")) return false;
  try {
    const { DodoPayments } = await import("dodopayments-checkout");
    notify = onEvent;
    fallback = () => window.location.assign(url);
    if (initialized !== environment) {
      DodoPayments.Initialize({ mode: environment === "sandbox" ? "test" : "live", displayType: "overlay", onEvent: event => {
        if (event.event_type === "checkout.error" || event.event_type === "checkout.link_expired") fallback();
        if (event.event_type === "checkout.closed") notify("closed");
        if (event.event_type === "checkout.status" || event.event_type === "checkout.redirect_requested") notify("status");
      }});
      initialized = environment;
    }
    DodoPayments.Checkout.open({ checkoutUrl: url, options: { manualRedirect: true } });
    return DodoPayments.Checkout.isOpen();
  } catch { return false; }
}
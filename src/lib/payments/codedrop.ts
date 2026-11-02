export type DrawerResult = "completed" | "cancelled" | "abandoned" | "failed" | "pending";
declare global {
  interface Window {
    PGPay?: { launchPayment: (data: { redirectUrl: string }, callback: (data: { status?: string }) => void) => void };
  }
}
export function drawerResult(status?: string): DrawerResult {
  if (status === "SENT_FOR_CAPTURE") return "completed";
  if (status === "CUSTOMER_CANCELLED") return "cancelled";
  if (status === "ABANDONED") return "abandoned";
  if (["ISSUER_DECLINE","GENERAL_DECLINE","REQUEST_ERROR","FAILED"].includes(status ?? "")) return "failed";
  return "pending";
}
export async function openCodeDrop(input: { codedropId: string; environment: "sandbox" | "live"; redirectUrl: string }, callback: (result: DrawerResult) => void): Promise<boolean> {
  if (!input.codedropId) return false;
  const url = new URL(input.redirectUrl);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".payglocal.in")) return false;
  const src = input.environment === "live" ? "https://codedrop.payglocal.in/simple.js" : "https://codedrop.uat.payglocal.in/simple.js";
  let script = document.querySelector<HTMLScriptElement>('script[data-tugg-codedrop]');
  if (script && (script.src !== src || script.dataset["cdId"] !== input.codedropId)) { script.remove(); script = null; delete window.PGPay; }
  if (!window.PGPay) {
    const loaded = await new Promise<boolean>((resolve) => {
      const element = script ?? document.createElement("script");
      const finish = (ok: boolean) => { clearTimeout(timer); element.onload = null; element.onerror = null; if (!ok) element.remove(); resolve(ok); };
      const timer = setTimeout(() => finish(false), 5000);
      element.onload = () => finish(!!window.PGPay);
      element.onerror = () => finish(false);
      if (!script) {
        element.src = src; element.defer = true;
        element.dataset["tuggCodedrop"] = "true"; element.dataset["displayMode"] = "drawer"; element.dataset["cdId"] = input.codedropId;
        document.head.appendChild(element);
      }
    });
    if (!loaded) return false;
  }
  try {
    if (!window.PGPay) return false;
    window.PGPay.launchPayment({ redirectUrl: input.redirectUrl }, (data) => callback(drawerResult(data.status)));
    return true;
  } catch { return false; }
}
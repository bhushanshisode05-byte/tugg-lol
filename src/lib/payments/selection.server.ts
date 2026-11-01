import { config } from "../server-utils.server";
import { createDodoProvider, dodoSettings, productId } from "./dodo.server";
import { createPayglocalProvider, payglocalSettings } from "./payglocal.server";
import type { ProductKind } from "./catalog";
export function selectedProvider() {
  const p = config().paymentProvider;
  if (p === "payglocal") return createPayglocalProvider();
  if (p === "dodo") return createDodoProvider();
  throw new Error("Payment provider is unavailable. No payment has been taken.");
}
export function selectedProduct(kind: ProductKind) { return config().paymentProvider === "dodo" ? productId(kind) : kind; }
export function paymentReadiness() {
  const c = config();
  if (c.paymentProvider === "payglocal") {
    if (c.pullMode !== "immediate") throw new Error("PayGlocal requires immediate bundles.");
    payglocalSettings();
    if (!c.ownerName || !c.ownerEmail) throw new Error("Checkout is unavailable while merchant contact details are being configured. No payment has been taken.");
  } else if (c.paymentProvider === "dodo" && c.pullMode === "wallet") {
    dodoSettings(); for (const kind of ["pull_5","pull_10","pull_25","standard","featured"] as const) productId(kind);
  } else throw new Error("Payment provider and pull mode are unavailable. No payment has been taken.");
}
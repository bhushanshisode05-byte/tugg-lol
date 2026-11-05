export const paymentProviderName = (provider: string = "dodo") => provider === "payglocal" ? "PayGlocal" : "Dodo Payments";
export const paymentProviderText = (provider: string = "dodo") => provider === "payglocal" ? "PayGlocal (RBI-authorised) processes payments." : "Payments are processed by Dodo Payments as merchant of record.";
export function activePaymentCopy(text: string, provider = "dodo") {
  if (provider === "payglocal") return text;
  return text.replaceAll("PayGlocal (RBI-authorised) processes payments", "Dodo Payments processes payments as merchant of record")
    .replaceAll("PayGlocal", "Dodo Payments");
}
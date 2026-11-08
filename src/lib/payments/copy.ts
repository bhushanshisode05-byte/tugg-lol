// Visitor-facing payment wording. Shared policy text uses {{tokens}} instead of a hardcoded
// provider name so every page follows the active PAYMENT_PROVIDER.
type ProviderCopy = { name: string; sentence: string; processes: string; billingPrivacy: string };
const COPY: Record<"dodo" | "payglocal", ProviderCopy> = {
  dodo: {
    name: "Dodo Payments",
    sentence: "Payments are processed by Dodo Payments as merchant of record.",
    processes: "Dodo Payments, as merchant of record, processes payments",
    billingPrivacy:
      "Dodo Payments, as merchant of record, collects billing and card details on its hosted checkout to process digital purchases, taxes and risk checks; card data never touches Tugg servers.",
  },
  payglocal: {
    name: "PayGlocal",
    sentence: "PayGlocal (RBI-authorised) processes payments.",
    processes: "PayGlocal (RBI-authorised) processes payments",
    billingPrivacy:
      "Billing name, email and address are sent securely to PayGlocal to process digital purchases and risk checks. PayGlocal handles card details on its hosted checkout; card data never touches Tugg servers.",
  },
};
const copyFor = (provider: string = "dodo") => (provider === "payglocal" ? COPY.payglocal : COPY.dodo);
export const paymentProviderName = (provider: string = "dodo") => copyFor(provider).name;
export const paymentProviderText = (provider: string = "dodo") => copyFor(provider).sentence;
/** Resolves {{provider}}, {{providerSentence}}, {{providerProcesses}} and {{billingPrivacy}}. */
export function activePaymentCopy(text: string, provider: string = "dodo") {
  const c = copyFor(provider);
  return text
    .replaceAll("{{providerSentence}}", c.sentence)
    .replaceAll("{{providerProcesses}}", c.processes)
    .replaceAll("{{billingPrivacy}}", c.billingPrivacy)
    .replaceAll("{{provider}}", c.name);
}

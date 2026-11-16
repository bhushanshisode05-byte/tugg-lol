// Visitor-facing payment wording. Shared policy text uses {{tokens}} instead of a hardcoded
// provider name so every page follows the active PAYMENT_PROVIDER.
type ProviderCopy = { name: string; sentence: string; processes: string; billingPrivacy: string; buyerEmail: string; refundTiming: string };
const COPY: Record<"dodo" | "payglocal", ProviderCopy> = {
  dodo: {
    name: "Dodo Payments",
    sentence: "Payments are processed by Dodo Payments as merchant of record.",
    processes: "Dodo Payments, as merchant of record, processes payments",
    billingPrivacy:
      "Dodo Payments, as merchant of record, collects billing and card details on its hosted checkout to process digital purchases, taxes and risk checks; card data never touches Tugg servers.",
    buyerEmail:
      "When you pay, Dodo Payments shares the email address you entered at its checkout with Tugg, and we store it privately with your order.",
    refundTiming:
      "Refunds are issued by Dodo Payments, our merchant of record, to the original payment method. How long it takes to appear depends on Dodo Payments and your bank; Tugg cannot promise an exact date.",
  },
  payglocal: {
    name: "PayGlocal",
    sentence: "PayGlocal (RBI-authorised) processes payments.",
    processes: "PayGlocal (RBI-authorised) processes payments",
    billingPrivacy:
      "Billing name, email and address are sent securely to PayGlocal to process digital purchases and risk checks. PayGlocal handles card details on its hosted checkout; card data never touches Tugg servers.",
    buyerEmail: "We store the email address you enter at checkout privately with your order.",
    refundTiming:
      "Refunds return to the original payment method. The time to appear depends on PayGlocal and your bank; Tugg cannot promise an exact date.",
  },
};
const copyFor = (provider: string = "dodo") => (provider === "payglocal" ? COPY.payglocal : COPY.dodo);
export const paymentProviderName = (provider: string = "dodo") => copyFor(provider).name;
export const paymentProviderText = (provider: string = "dodo") => copyFor(provider).sentence;
/** Refund-timing sentence for customer emails, worded for the provider that took that order's payment. */
export const refundTimingText = (provider: string = "dodo") => copyFor(provider).refundTiming;
// Pull offer wording. "bundles" is the exact pre-basket text; "basket" applies only with PULL_BASKET_ENABLED on Dodo.
const OFFER = {
  bundles: {
    long: "Buy a one-time bundle of 5 pulls for $5, 10 for $10, or 25 for $25, in US dollars only. Choose a side before paying. After verified payment, the entire bundle is applied immediately to that side;",
    short: "Buy one-time bundles of 5/$5, 10/$10 or 25/$25 in USD. All pulls are applied immediately to your selected side after verified payment.",
    footer: "$1 per pull. One-time bundles of 5, 10 or 25 applied immediately after verified payment.",
  },
  basket: {
    long: "Pay once for any whole number of pulls from 5 ($5) to 500 ($500), in US dollars only, split across up to 10 different matchups with one side each. After verified payment, all pulls are applied immediately to the sides you chose, and if a matchup stops taking pulls before your payment is applied, that part is refunded automatically;",
    short: "Pay once for $5 to $500 in USD, split across up to 10 different matchups with one side each. All pulls are applied immediately to your selected sides after verified payment.",
    footer: "From $5 · $1 per pull. One-time payments of $5 to $500, split across up to 10 matchups and applied immediately after verified payment.",
  },
} as const;
export const pullOfferFooter = (basket = false) => OFFER[basket ? "basket" : "bundles"].footer;
/** Resolves {{provider}}, {{providerSentence}}, {{providerProcesses}}, {{billingPrivacy}}, {{buyerEmailPrivacy}}, {{pullOffer}} and {{pullOfferShort}}. */
export function activePaymentCopy(text: string, provider: string = "dodo", basket = false) {
  const c = copyFor(provider);
  const offer = OFFER[basket && provider !== "payglocal" ? "basket" : "bundles"];
  return text
    .replaceAll("{{pullOfferShort}}", offer.short)
    .replaceAll("{{pullOffer}}", offer.long)
    .replaceAll("{{providerSentence}}", c.sentence)
    .replaceAll("{{providerProcesses}}", c.processes)
    .replaceAll("{{billingPrivacy}}", c.billingPrivacy)
    .replaceAll("{{buyerEmailPrivacy}}", c.buyerEmail)
    .replaceAll("{{provider}}", c.name);
}

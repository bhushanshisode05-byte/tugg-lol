export type PaymentsEnv = "sandbox" | "live";
export const PRODUCTS = {
  pull_5: { pricing: "fixed", name: "Tugg — 5 Pulls", cents: 500, pulls: 5 },
  pull_10: { pricing: "fixed", name: "Tugg — 10 Pulls", cents: 1000, pulls: 10 },
  pull_25: { pricing: "fixed", name: "Tugg — 25 Pulls", cents: 2500, pulls: 25 },
  pull_custom: { pricing: "custom", name: "Tugg — Custom Pulls", minCents: 500, maxCents: 100000, stepCents: 100, suggestedCents: 1000 },
  standard: { pricing: "fixed", name: "Tugg — Standard Matchup", cents: 900, pulls: 0 },
  featured: { pricing: "fixed", name: "Tugg — Featured Matchup", cents: 2900, pulls: 0 },
} as const;
export type ProductKind = keyof typeof PRODUCTS;
export const CUSTOM_AMOUNT_ERROR = "Enter a whole dollar amount from $5 to $1,000.";
export function isCustomPullCents(cents: number) {
  const p = PRODUCTS.pull_custom;
  return Number.isInteger(cents) && cents >= p.minCents && cents <= p.maxCents && cents % p.stepCents === 0;
}
export function fixedProductCents(kind: string): number | undefined {
  const product = Object.entries(PRODUCTS).find(([key]) => key === kind)?.[1];
  return product?.pricing === "fixed" ? product.cents : undefined;
}
export function orderPriceMatches(kind: string, cents: number, quantity: number) {
  return kind === "pull_custom" ? isCustomPullCents(cents) && quantity === cents / 100 : fixedProductCents(kind) === cents;
}
export const DODO_NOT_READY =
  "Dodo checkout is not configured yet. No payment has been taken. Please try again later.";
export const spendOptions = (balance: number) => [1, 5, 10].filter((n) => n <= balance);

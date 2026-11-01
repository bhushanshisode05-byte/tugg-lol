export type PaymentsEnv = "sandbox" | "live";
export const PRODUCTS = {
  pull_5: { name: "Tugg — 5 Pulls", cents: 500, pulls: 5 },
  pull_10: { name: "Tugg — 10 Pulls", cents: 1000, pulls: 10 },
  pull_25: { name: "Tugg — 25 Pulls", cents: 2500, pulls: 25 },
  standard: { name: "Tugg — Standard Matchup", cents: 900, pulls: 0 },
  featured: { name: "Tugg — Featured Matchup", cents: 2900, pulls: 0 },
} as const;
export type ProductKind = keyof typeof PRODUCTS;
export const DODO_NOT_READY = "Dodo checkout is not configured yet. No payment has been taken. Please try again later.";
export const spendOptions = (balance: number) => [1, 5, 10].filter((n) => n <= balance);
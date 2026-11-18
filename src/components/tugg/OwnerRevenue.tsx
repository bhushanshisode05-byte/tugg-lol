type ProviderSummary = {
  environment: string;
  revenue_cents: number;
  bundles_sold: number;
  pulls_applied: number;
  refunds: number;
  refund_reviews: number;
  pending: number;
  expired: number;
  reconcile_checks: number;
  reconciled_paid: number;
  reconciled_expired: number;
  baskets_sold?: number;
  basket_refund_cents?: number;
  basket_reviews?: number;
};
export type OwnerRevenueProps = {
  provider: string;
  dodo: { environments: ProviderSummary[] };
  payglocal: { environments: ProviderSummary[] };
  creationRevenue: { live: number; sandbox: number };
};

const dollars = (cents: unknown) => `$${(Number(cents ?? 0) / 100).toFixed(2)}`;

/** Shown beside every gross money figure; never hidden in a tooltip. */
export function grossLabel(provider: string) {
  return provider === "dodo"
    ? "Gross revenue: before payment-processing fees and before tax collected by the merchant of record (Dodo Payments). Not an accounting figure."
    : "Gross revenue: before payment-processing fees and before any tax due on the sale. Not an accounting figure.";
}

export function OwnerRevenue({ provider, dodo, payglocal, creationRevenue }: OwnerRevenueProps) {
  const providerName = provider === "dodo" ? "Dodo Payments" : "PayGlocal";
  return (
    <section className="border-b border-border py-6">
      <h2 className="text-2xl font-bold">Revenue</h2>
      <div className="mt-4 grid gap-6 sm:grid-cols-2">
        {(["live", "sandbox"] as const).map((env) => {
          const active = (provider === "dodo" ? dodo : payglocal).environments.find((r) => r.environment === env);
          const basket = dodo.environments.find((r) => r.environment === env);
          return (
            <div key={env}>
              <h3 className="font-bold">{env === "live" ? "Live payments" : "Test payments (sandbox, no real money)"}</h3>
              <p className="mt-2 font-mono text-3xl">{dollars(active?.revenue_cents)}</p>
              <p className="text-sm">
                What buyers paid on confirmed {providerName} payments, including payments later refunded.
                <br />
                {grossLabel(provider)}
              </p>
              <p className="mt-3 font-mono text-xl">{dollars(creationRevenue[env])}</p>
              <p className="text-sm">
                Matchup creation fees: the actual amounts paid for matchups that went live, leaving out refunds and
                Tugg's own matchups. Part of the total above.
                <br />
                {grossLabel(provider)}
              </p>
              <p className="mt-3 text-muted-foreground">
                {providerName} bundles: {active?.bundles_sold ?? 0} · Pulls applied: {active?.pulls_applied ?? 0}<br />
                Refund requests: {active?.refunds ?? 0} · Refund reviews: {active?.refund_reviews ?? 0}<br />
                Pending: {active?.pending ?? 0} · Expired: {active?.expired ?? 0}<br />
                Reconcile checks: {active?.reconcile_checks ?? 0} · Paid: {active?.reconciled_paid ?? 0} · Expired: {active?.reconciled_expired ?? 0}<br />
                {provider === "dodo" && (
                  <>
                    Baskets: {basket?.baskets_sold ?? 0} · Held for review: {basket?.basket_reviews ?? 0} · Basket partial refunds (owed or issued): {dollars(basket?.basket_refund_cents)}
                    <br />
                  </>
                )}
              </p>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        Amounts come from stored payment records; a payment only counts as confirmed when the amount {providerName} charged matches the order. These are not settlement balances or payouts. Historical purchases remain in the records below.
      </p>
    </section>
  );
}

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, within } from "@testing-library/react";
import { OwnerRevenue, type OwnerRevenueProps } from "@/components/tugg/OwnerRevenue";

const summary = (environment: string, revenue_cents: number) => ({
  environment, revenue_cents, bundles_sold: 1, pulls_applied: 5, refunds: 0, refund_reviews: 0, pending: 0, expired: 0,
  reconcile_checks: 0, reconciled_paid: 0, reconciled_expired: 0, baskets_sold: 0, basket_refund_cents: 0, basket_reviews: 0,
});
const props: OwnerRevenueProps = {
  provider: "dodo",
  dodo: { environments: [summary("live", 1734), summary("sandbox", 0)] },
  payglocal: { environments: [] },
  // An unexpected actual amount: neither $9 nor $29.
  creationRevenue: { live: 1234, sandbox: 0 },
};
afterEach(() => cleanup());

describe("owner revenue labels", () => {
  it("shows the actual creation amount paid, not a published price", () => {
    const view = render(<OwnerRevenue {...props} />);
    expect(view.getAllByText("$12.34")).toHaveLength(1);
    expect(view.queryByText("$9.00")).toBeNull();
    expect(view.queryByText("$29.00")).toBeNull();
  });
  it("labels every money figure as gross, before fees and merchant-of-record tax, and not an accounting figure, beside the number", () => {
    const view = render(<OwnerRevenue {...props} />);
    const live = view.getByText("Live payments").parentElement!;
    for (const figure of ["$17.34", "$12.34"]) {
      const label = within(live).getByText(figure).nextElementSibling!;
      expect(label.textContent).toContain("Gross revenue: before payment-processing fees and before tax collected by the merchant of record (Dodo Payments).");
      expect(label.textContent).toContain("Not an accounting figure.");
    }
    expect(within(live).getByText("$12.34").nextElementSibling!.textContent).toContain("leaving out refunds and Tugg's own matchups");
    expect(live.querySelector("[title]")).toBeNull();
  });
  it("names test money as not real", () => {
    const view = render(<OwnerRevenue {...props} />);
    expect(view.getByText("Test payments (sandbox, no real money)")).toBeTruthy();
  });
});

import { describe, expect, it } from "vitest";
import { activePaymentCopy, paymentProviderText } from "@/lib/payments/copy";
import { approvedAnswer, policySections, supportAnswers } from "@/lib/policies";

const allPolicyText = () => [
  ...supportAnswers.map((a) => a.text),
  ...Object.values(policySections).flatMap((p) => p.sections.map((s) => s.text)),
];

describe("provider-aware visitor copy", () => {
  it("no policy source text hardcodes a provider name", () => {
    for (const text of allPolicyText()) expect(text).not.toMatch(/PayGlocal|Dodo/);
  });
  it("Dodo active: every policy reads Dodo Payments and never PayGlocal or a raw token", () => {
    for (const text of allPolicyText()) {
      const out = activePaymentCopy(text, "dodo");
      expect(out).not.toMatch(/PayGlocal|RBI|\{\{/);
    }
    expect(activePaymentCopy(policySections["refund-policy"].sections[3]!.text, "dodo")).toContain("Dodo Payments, as merchant of record, processes payments and refunds for Tugg.");
    expect(approvedAnswer("rejected", "dodo")).toContain("through Dodo Payments");
    expect(paymentProviderText("dodo")).toBe("Payments are processed by Dodo Payments as merchant of record.");
  });
  it("PayGlocal selected: the original PayGlocal wording is restored", () => {
    expect(approvedAnswer("payment", "payglocal")).toMatch(/^PayGlocal \(RBI-authorised\) processes payments through a hosted checkout\./);
    expect(approvedAnswer("payment", "payglocal")).toContain("checkout email and PayGlocal payment reference");
    expect(approvedAnswer("privacy", "payglocal")).toContain("Billing name, email and address are sent securely to PayGlocal");
    expect(activePaymentCopy(policySections["about-legal"].sections[1]!.text, "payglocal")).toMatch(/^PayGlocal \(RBI-authorised\) processes payments for Tugg\./);
    for (const text of allPolicyText()) expect(activePaymentCopy(text, "payglocal")).not.toMatch(/Dodo|\{\{/);
  });
  it("rules refund line follows the active provider", () => {
    const line = "Bundles are non-refundable except where required by law. {{providerSentence}} Genuine payment errors must be verified through support.";
    expect(activePaymentCopy(line, "dodo")).toContain("Payments are processed by Dodo Payments as merchant of record.");
    expect(activePaymentCopy(line, "payglocal")).toContain("PayGlocal (RBI-authorised) processes payments.");
  });
});

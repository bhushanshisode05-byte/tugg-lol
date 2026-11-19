// The statement descriptor line (beside the pay button and in the rules) and the stated support route.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
const mocks = vi.hoisted(() => ({ loader: { provider: "dodo", basket: false } as { provider: string; basket: boolean } }));
vi.mock("@tanstack/react-start", async (orig) => ({ ...(await orig<typeof import("@tanstack/react-start")>()), useServerFn: (f: unknown) => f }));
vi.mock("@tanstack/react-router", async (orig) => ({
  ...(await orig<typeof import("@tanstack/react-router")>()),
  createFileRoute: () => (opts: any) => ({ options: opts, useLoaderData: () => mocks.loader }),
}));
vi.mock("@/lib/support.functions", () => ({ getPublicContact: vi.fn() }));
vi.mock("@/components/tugg/Shell", () => ({ Shell: ({ children }: any) => <>{children}</> }));
vi.mock("@/lib/immediate-payments.functions", () => ({ buyImmediateBundle: vi.fn(), getImmediatePayment: vi.fn(), recordPaymentFunnel: vi.fn(async () => {}), getCodeDropConfig: vi.fn(async () => ({ environment: "sandbox", codedropId: "" })) }));
vi.mock("@/lib/payments/dodo-overlay", () => ({ openDodoOverlay: vi.fn() }));
vi.mock("@/components/tugg/SideAvatar", () => ({ SideAvatar: () => null }));
vi.mock("@/components/tugg/Turnstile", () => ({ Turnstile: () => null }));
import { Route as RulesRoute } from "@/routes/rules";
import { ImmediatePullPanel } from "@/components/tugg/ImmediatePullPanel";
import { ALLOWED_SUBJECT_LIST, ALLOWED_SUBJECTS, NOT_ALLOWED_SUBJECT_LIST, NOT_ALLOWED_SUBJECTS, REAL_PERSON_RULE_PUBLIC, moderationRules } from "@/lib/content-policy";
import { supportAnswers } from "@/lib/policies";

const DESCRIPTOR = "Payments are processed by Dodo Payments as merchant of record. Your card or bank statement will show the charge from Dodo Payments, not Tugg.";
const SUPPORT = "Questions about a payment? Email hello@tugg.lol and we'll reply within 2 business days.";
const sides: any[] = [
  { id: "12345678-1234-4234-8234-123456789abc", position: 0, name: "Notion", emoji: "📝", all_time_cents: 0 },
  { id: "22345678-1234-4234-8234-123456789abc", position: 1, name: "Obsidian", emoji: "💎", all_time_cents: 0 },
];
afterEach(() => cleanup());

describe("rules page", () => {
  const renderRules = () => { const Rules = (RulesRoute as any).options.component; return render(<Rules />); };
  it("states the descriptor in the refunds and payments section", () => {
    const view = renderRules();
    const section = view.getByRole("heading", { name: "Refunds and payments" }).closest("section")!;
    expect([...section.querySelectorAll("li")].map((li) => li.textContent)).toContain(DESCRIPTOR);
  });
  it("lists athletes and entertainers and the real-person rule, from the same policy moderation enforces", () => {
    const view = renderRules();
    const items = (name: string) => [...view.getByRole("heading", { name }).closest("section")!.querySelectorAll("li")].map((li) => li.textContent ?? "");
    const allowed = items("Allowed matchups").join(" ");
    expect(allowed).toContain("famous athletes");
    expect(allowed).toContain("well-known public entertainers");
    expect(items("Allowed matchups")).toContain(REAL_PERSON_RULE_PUBLIC);
    expect(allowed).toMatch(/preference or merit/);
    for (const word of ["an accusation", "a legal matter", "a death", "an illness"]) expect(allowed).toContain(word);
    for (const subject of ALLOWED_SUBJECT_LIST) expect(allowed.toLowerCase()).toContain(subject);
    const banned = items("Not allowed").join(" ").toLowerCase();
    for (const subject of NOT_ALLOWED_SUBJECT_LIST) expect(banned).toContain(subject.toLowerCase());
    // The classifier gets the same rule, so the page cannot promise less or more than is enforced.
    expect(moderationRules("matchup")).toContain(REAL_PERSON_RULE_PUBLIC);
    expect(moderationRules("matchup")).toContain(ALLOWED_SUBJECTS);
  });
  it("support's \"What is allowed?\" answer carries the same policy", () => {
    const answer = supportAnswers.find((a) => a.id === "moderation")!.text;
    expect(answer).toContain(ALLOWED_SUBJECTS);
    expect(answer).toContain(NOT_ALLOWED_SUBJECTS);
    expect(answer).toContain(REAL_PERSON_RULE_PUBLIC);
  });
  it("states the support route and response time in its own support section", () => {
    const view = renderRules();
    const section = view.getByRole("heading", { name: "Support" }).closest("section")!;
    expect(section.textContent).toContain(SUPPORT);
  });
});

describe("pull panel", () => {
  it("shows the descriptor line, visible text near the pay button", () => {
    vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
    const view = render(<ImmediatePullPanel sides={sides} slug="notion-vs-obsidian" paused={false} onPulled={() => {}} ready message="" provider="dodo" />);
    const line = view.container.querySelector("[data-payment-descriptor]")!;
    expect(line.textContent).toBe(DESCRIPTOR);
    const pay = view.getByRole("button", { name: /^Pay \$/ });
    // Directly after the pay button, not in a tooltip or collapsed section.
    expect(pay.nextElementSibling).toBe(line);
    expect(line.closest("details,[role=tooltip]")).toBeNull();
  });
});

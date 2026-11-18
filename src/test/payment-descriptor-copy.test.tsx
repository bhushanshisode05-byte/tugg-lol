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

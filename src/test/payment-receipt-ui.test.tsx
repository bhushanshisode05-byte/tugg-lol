import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
const mocks = vi.hoisted(() => ({ buy: vi.fn(), read: vi.fn(), overlay: { cb: null as null | ((e: string) => void) } }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (f: unknown) => f }));
vi.mock("@/components/tugg/ShareButton", () => ({ ShareButton: ({ m }: any) => <button>Share {m.title}</button> }));
vi.mock("@/lib/immediate-payments.functions", () => ({ buyImmediateBundle: mocks.buy, getImmediatePayment: mocks.read, recordPaymentFunnel: vi.fn(async () => {}), getCodeDropConfig: vi.fn(async () => ({ environment: "sandbox", codedropId: "" })) }));
vi.mock("@/lib/payments/dodo-overlay", () => ({ openDodoOverlay: vi.fn(async (_u: string, _e: string, cb: (e: string) => void) => { mocks.overlay.cb = cb; return true; }) }));
vi.mock("@/components/tugg/SideAvatar", () => ({ SideAvatar: () => null }));
vi.mock("@/components/tugg/Turnstile", () => ({ Turnstile: ({ onToken }: any) => <button onClick={() => onToken("fixture")}>Security passed</button> }));
import { ImmediatePullPanel } from "@/components/tugg/ImmediatePullPanel";

const order = "acfa7a89-1bcd-465f-9b6c-3e2d2319dd03";
const sides: any[] = [
  { id: "12345678-1234-4234-8234-123456789abc", position: 0, name: "Notion", emoji: "📝", all_time_cents: 4500 },
  { id: "22345678-1234-4234-8234-123456789abc", position: 1, name: "Obsidian", emoji: "💎", all_time_cents: 1200 },
];
const receipt = { amountCents: 2500, pulls: 25, refundedPulls: 0, siteUrl: "https://tugg.lol", lines: [{ matchupId: "m1", slug: "notion-vs-obsidian", title: "Notion vs Obsidian", sides, sideId: sides[0].id, pulls: 25, totalA: 3000, totalB: 500 }] };
const flush = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const pulled = vi.fn();
const FAILURE = /failed|expired|could not|error/i;

beforeEach(() => {
  vi.useFakeTimers();
  history.replaceState(null, "", "/");
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
  pulled.mockClear(); mocks.read.mockReset(); mocks.overlay.cb = null;
  mocks.buy.mockResolvedValue({ url: "https://test.checkout.dodopayments.com/session/cks_x", orderId: order, environment: "sandbox", provider: "dodo", codedropId: "" });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

async function pay() {
  render(<ImmediatePullPanel sides={sides} slug="notion-vs-obsidian" paused={false} onPulled={pulled} status="ready" message="" onRetry={() => {}} provider="dodo" />);
  fireEvent.click(screen.getByText("Security passed"));
  fireEvent.click(screen.getByRole("button", { name: "$25 25 pulls" }));
  fireEvent.click(screen.getByRole("button", { name: "Pay $25 · 25 pulls for Notion" }));
  await flush();
}

it("confirmation arriving 79 seconds late recovers to the receipt, never an error, and closing Dodo's window afterwards keeps it", async () => {
  const start = Date.now();
  mocks.read.mockImplementation(async () => (Date.now() - start >= 79000 ? { status: "paid", quantity: 25, refundedPulls: 0, receipt } : { status: "pending", quantity: 25, refundedPulls: 0 }));
  await pay();
  expect(screen.getByRole("status")).toHaveTextContent("Please don't pay again");
  for (let t = 0; t < 78; t += 6) { await flush(6000); expect(screen.queryByText(FAILURE)).toBeNull(); expect(pulled).not.toHaveBeenCalled(); }
  await flush(20000);
  expect(screen.getByText("Payment confirmed")).toBeInTheDocument();
  expect(screen.getByText("You pulled 25 for Notion!")).toBeInTheDocument();
  expect(screen.getByText("$25 USD")).toBeInTheDocument();
  expect(screen.getByText("Notion now $30")).toBeInTheDocument();
  expect(screen.getByText(/all-time \$45/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Share Notion vs Obsidian" })).toBeInTheDocument();
  expect(pulled).toHaveBeenCalledTimes(1);
  // The buyer then closes Dodo's window: the receipt must stay (this is what used to revert to "pending" forever).
  act(() => { mocks.overlay.cb?.("closed"); });
  await flush(60000);
  expect(screen.getByText("Payment confirmed")).toBeInTheDocument();
  expect(screen.queryByText(/Confirming your payment|confirmation pending/i)).toBeNull();
  expect(pulled).toHaveBeenCalledTimes(1);
});

it("the rope starts where it was before this payment and moves to its new position", async () => {
  mocks.read.mockResolvedValue({ status: "paid", quantity: 25, refundedPulls: 0, receipt });
  await pay();
  const rope = () => screen.getAllByRole("img").at(-1)!;
  expect(rope()).toHaveAttribute("aria-label", "Notion $5 versus Obsidian $5");
  await flush(200);
  expect(rope()).toHaveAttribute("aria-label", "Notion $30 versus Obsidian $5");
});

it("still unconfirmed after 10 minutes: calm don't-pay-again note with Check again, never a failure", async () => {
  let ok = false;
  mocks.read.mockImplementation(async () => (ok ? { status: "paid", quantity: 25, refundedPulls: 0, receipt } : { status: "pending", quantity: 25, refundedPulls: 0 }));
  await pay();
  await flush(10 * 60000 + 20000);
  expect(screen.getByText(/still being confirmed.*you don't need to pay again/i)).toBeInTheDocument();
  expect(screen.queryByText(FAILURE)).toBeNull();
  ok = true;
  fireEvent.click(screen.getByRole("button", { name: "Check again" }));
  await flush();
  expect(screen.getByText("Payment confirmed")).toBeInTheDocument();
});

it("a genuinely expired order shows the failure", async () => {
  mocks.read.mockResolvedValue({ status: "expired", quantity: 25, refundedPulls: 0 });
  await pay();
  expect(screen.getByText("Payment failed or expired. No pulls were applied.")).toBeInTheDocument();
  expect(pulled).not.toHaveBeenCalled();
});

it("returning from Dodo's redirect with ?payment= resumes checking that order", async () => {
  history.replaceState(null, "", `/m/notion-vs-obsidian?payment=${order}`);
  mocks.read.mockResolvedValueOnce({ status: "pending", quantity: 25, refundedPulls: 0 }).mockResolvedValue({ status: "paid", quantity: 25, refundedPulls: 0, receipt });
  render(<ImmediatePullPanel sides={sides} slug="notion-vs-obsidian" paused={false} onPulled={pulled} status="ready" message="" onRetry={() => {}} provider="dodo" />);
  await flush(3000);
  expect(mocks.read).toHaveBeenCalledWith({ data: { orderId: order } });
  expect(screen.getByText("Payment confirmed")).toBeInTheDocument();
});

it("closing Dodo's window without paying shows the honest note; Dismiss hides it, and a payment landing later still shows the receipt", async () => {
  let ok = false;
  mocks.read.mockImplementation(async () => (ok ? { status: "paid", quantity: 25, refundedPulls: 0, receipt } : { status: "pending", quantity: 25, refundedPulls: 0 }));
  await pay();
  act(() => { mocks.overlay.cb?.("closed"); });
  await flush();
  expect(screen.getByRole("status")).toHaveTextContent("Checkout closed. Nothing was charged. If you did pay, your pulls will appear here in a moment.");
  expect(screen.getByRole("button", { name: /^Pay \$25/ })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  expect(screen.queryByText(/Checkout closed/)).toBeNull();
  ok = true;
  await flush(5000);
  expect(screen.getByText("Payment confirmed")).toBeInTheDocument();
  expect(pulled).toHaveBeenCalledTimes(1);
});

it("closing without paying and waiting: the note disappears after about 90 seconds, never 'still being confirmed'", async () => {
  mocks.read.mockResolvedValue({ status: "pending", quantity: 25, refundedPulls: 0 });
  await pay();
  act(() => { mocks.overlay.cb?.("closed"); });
  await flush(60000);
  expect(screen.getByText(/Nothing was charged/)).toBeInTheDocument();
  await flush(60000);
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.queryByText(/still being confirmed/)).toBeNull();
});

it("a dismissal does not carry into the next checkout", async () => {
  mocks.read.mockResolvedValue({ status: "pending", quantity: 25, refundedPulls: 0 });
  await pay();
  fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  expect(screen.queryByText(/Confirming your payment/)).toBeNull();
  mocks.buy.mockResolvedValue({ url: "https://test.checkout.dodopayments.com/session/cks_y", orderId: "bcfa7a89-1bcd-465f-9b6c-3e2d2319dd04", environment: "sandbox", provider: "dodo", codedropId: "" });
  fireEvent.click(screen.getByText("Security passed"));
  fireEvent.click(screen.getByRole("button", { name: /^Pay \$25/ }));
  await flush();
  expect(screen.getByText(/Confirming your payment/)).toBeInTheDocument();
});

it("Other defaults to 10 and shows exact 17 pulls, with accessible amount errors",async()=>{
 render(<ImmediatePullPanel sides={sides} slug="notion-vs-obsidian" paused={false} onPulled={pulled} status="ready" message="" onRetry={()=>{}} customAvailable/>);
 fireEvent.click(screen.getByRole("button",{name:/Other/}));
 const input=screen.getByLabelText("Amount in US dollars");
 expect(input).toHaveValue(10);expect(input).toHaveAttribute("inputmode","numeric");
 for (const value of ["4","0","-1","1001","7.50","15.5",""]) {
  fireEvent.change(input,{target:{value}});
  expect(input).toHaveAttribute("aria-invalid","true");
  expect(screen.getByRole("alert")).toHaveTextContent("Enter a whole dollar amount from $5 to $1,000.");
  expect(screen.getByRole("button",{name:/^Pay/})).toBeDisabled();
 }
 fireEvent.change(input,{target:{value:"17"}});
 expect(input).toHaveAttribute("aria-invalid","false");expect(screen.getByRole("status")).toHaveTextContent("17 pulls");
 fireEvent.click(screen.getByText("Security passed"));fireEvent.click(screen.getByRole("button",{name:"Pay $17 · 17 pulls for Notion"}));await flush();
 expect(mocks.buy).toHaveBeenCalledWith({data:expect.objectContaining({pack:"custom",customCents:1700})});
});

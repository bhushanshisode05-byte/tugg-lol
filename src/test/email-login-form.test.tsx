import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EmailLoginForm } from "@/components/tugg/EmailLoginForm";
import { AUTH_ACKNOWLEDGEMENT } from "@/lib/email-auth-schema";
const mocks = vi.hoisted(() => ({ call: vi.fn(), session: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => mocks.call }));
vi.mock("@/lib/email-auth.functions", () => ({ emailSignIn: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { setSession: mocks.session } } }));
vi.mock("@/components/tugg/Turnstile", () => ({ Turnstile: ({ onToken }: { onToken: (token: string) => void }) => <button type="button" onClick={() => onToken("mock-challenge")}>Complete test security check</button> }));
beforeEach(() => { vi.resetAllMocks(); mocks.session.mockResolvedValue({ error: null }); });
afterEach(cleanup);
function fill() { fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "hello@tugg.lol" } }); fireEvent.change(screen.getByLabelText("Password", { exact: true }), { target: { value: "example-password-123" } }); fireEvent.click(screen.getByText("Complete test security check")); }
describe("email form submission states", () => {
  it("wrong password never sets a browser session or opens records", async () => {
    const done = vi.fn(); mocks.call.mockResolvedValue({ ok: false, message: "Unable to sign in. Check your details and try again." });
    render(<EmailLoginForm onSignedIn={done} />); fill(); fireEvent.submit(screen.getByRole("form"));
    await waitFor(() => expect(mocks.call).toHaveBeenCalled());
    expect(mocks.session).not.toHaveBeenCalled(); expect(done).not.toHaveBeenCalled();
  });
  it("right password establishes session before opening the owner-gated route", async () => {
    const done = vi.fn(); mocks.call.mockResolvedValue({ ok: true, session: { access_token: "fake", refresh_token: "fake" } });
    render(<EmailLoginForm onSignedIn={done} />); fill(); fireEvent.submit(screen.getByRole("form"));
    await waitFor(() => expect(done).toHaveBeenCalledOnce()); expect(mocks.session).toHaveBeenCalledWith({ access_token: "fake", refresh_token: "fake" });
  });
  it("password reset sends the entered email and does not sign in", async () => {
    const done = vi.fn(); mocks.call.mockResolvedValue({ ok: true, message: AUTH_ACKNOWLEDGEMENT });
    render(<EmailLoginForm onSignedIn={done} />);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "unknown@example.com" } });
    fireEvent.click(screen.getByText("Forgot password?")); fireEvent.click(screen.getByText("Complete test security check")); fireEvent.submit(screen.getByRole("form"));
    await waitFor(() => expect(mocks.call).toHaveBeenCalledWith({ data: { operation: "reset", email: "unknown@example.com", turnstileToken: "mock-challenge" } }));
    expect(done).not.toHaveBeenCalled(); expect(mocks.session).not.toHaveBeenCalled();
  });
  it("missing security check cannot reach the server", async () => {
    render(<EmailLoginForm onSignedIn={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "hello@tugg.lol" } });
    fireEvent.submit(screen.getByRole("form"));
    expect(mocks.call).not.toHaveBeenCalled();
  });
});
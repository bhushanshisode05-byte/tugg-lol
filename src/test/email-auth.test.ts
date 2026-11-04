import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_ACKNOWLEDGEMENT, AUTH_LIMITS, MIN_PASSWORD_LENGTH, authReturnUrl, emailAuthSchema, recoveryEmailUrl, recoveryHash, resetPasswordSchema } from "@/lib/email-auth-schema";
import { executeEmailAuth, executePasswordReset, takeAuthLimits } from "@/lib/email-auth.server";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), rpc: vi.fn(), password: vi.fn(), reset: vi.fn(), otp: vi.fn(), verifyOtp: vi.fn(), update: vi.fn(), signOut: vi.fn() }));
vi.mock("@/lib/turnstile.server", () => ({ verifyTurnstileForRequest: mocks.verify }));
vi.mock("@/lib/server-utils.server", () => ({ config: () => ({ siteUrl: "https://tugg.lol" }), publicDb: () => ({ auth: { signInWithPassword: mocks.password, resetPasswordForEmail: mocks.reset, signInWithOtp: mocks.otp, verifyOtp: mocks.verifyOtp, updateUser: mocks.update, signOut: mocks.signOut } }) }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: mocks.rpc } }));
const request = () => new Request("https://tugg.lol/_serverFn/test", { headers: { origin: "https://tugg.lol", "cf-connecting-ip": "192.0.2.1" } });
const input = { operation: "password" as const, email: "hello@tugg.lol", password: "long-password-123", turnstileToken: "test-challenge" };
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("TURNSTILE_SECRET_KEY", "test-only-secret"); mocks.verify.mockResolvedValue(undefined); mocks.rpc.mockResolvedValue({ data: true, error: null }); });

describe("email authentication rules", () => {
  it("requires 12 characters for sign-in and new passwords", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(12);
    expect(emailAuthSchema.safeParse({ ...input, password: "a".repeat(11) }).success).toBe(false);
    expect(emailAuthSchema.safeParse({ ...input, password: "a".repeat(12) }).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ password: "a".repeat(11), tokenHash: "test", turnstileToken: "test" }).success).toBe(false);
  });
  it("rejects signup operation", () => { expect(emailAuthSchema.safeParse({ ...input, operation: "signup" }).success).toBe(false); });
  it("rejects wrong password generically", async () => {
    mocks.password.mockResolvedValue({ data: { session: null }, error: new Error("sensitive provider detail") });
    expect(await executeEmailAuth(input, request())).toEqual({ ok: false, message: "Unable to sign in. Check your details and try again." });
  });
  it("right password returns only session credentials, not private records", async () => {
    mocks.password.mockResolvedValue({ data: { user: { email_confirmed_at: "2026-11-04" }, session: { access_token: "fake-access", refresh_token: "fake-refresh", user: { private: "no" } } }, error: null });
    expect(await executeEmailAuth(input, request())).toEqual({ ok: true, message: "Signed in.", session: { access_token: "fake-access", refresh_token: "fake-refresh" } });
  });
  it("Turnstile rejection prevents login and limiter side effects", async () => {
    mocks.verify.mockRejectedValue(new Error("failure"));
    expect((await executeEmailAuth(input, request())).ok).toBe(false);
    expect(mocks.password).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rate limit rejection prevents login", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    expect((await executeEmailAuth(input, request())).ok).toBe(false); expect(mocks.password).not.toHaveBeenCalled();
  });
  it("password windows are 10/IP and 5/email per 15 minutes with no raw identifiers stored", async () => {
    expect(AUTH_LIMITS.password).toEqual({ ip: 10, email: 5, minutes: 15 });
    await takeAuthLimits(request(), input.email, "password");
    expect(mocks.rpc.mock.calls.map(([, args]) => [args.p_max, args.p_window_minutes])).toEqual([[10, 15], [5, 15]]);
    for (const [, args] of mocks.rpc.mock.calls) expect(args.p_ip).toMatch(/^[a-f0-9]{64}$/);
  });
  it("reset/link share 5/IP and 3/email per hour limits", async () => {
    expect(AUTH_LIMITS.mail).toEqual({ ip: 5, email: 3, minutes: 60 });
    await takeAuthLimits(request(), input.email, "mail");
    expect(mocks.rpc.mock.calls.map(([, args]) => [args.p_max, args.p_window_minutes])).toEqual([[5, 60], [3, 60]]);
  });
  it("limiter database failure fails closed", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "down" } });
    expect(await takeAuthLimits(request(), input.email, "mail")).toBe(false);
  });
  it.each([null, new Error("not found")])("reset acknowledgement cannot reveal account existence", async error => {
    mocks.reset.mockResolvedValue({ error });
    expect(await executeEmailAuth({ operation: "reset", email: input.email, turnstileToken: "test" }, request())).toEqual({ ok: true, message: AUTH_ACKNOWLEDGEMENT });
    expect(mocks.reset).toHaveBeenCalledWith(input.email, { redirectTo: "https://tugg.lol/reset-password" });
    expect(mocks.verify).toHaveBeenCalledWith("test", "owner_password_reset", expect.any(Request));
  });
  it("magic link cannot create an account and returns to live domain", async () => {
    mocks.otp.mockResolvedValue({ error: new Error("no account") });
    expect(await executeEmailAuth({ operation: "link", email: input.email, turnstileToken: "test" }, request())).toEqual({ ok: true, message: AUTH_ACKNOWLEDGEMENT });
    expect(mocks.otp).toHaveBeenCalledWith({ email: input.email, options: { shouldCreateUser: false, emailRedirectTo: "https://tugg.lol/auth" } });
  });
  it("cross-site requests never reach authentication", async () => {
    expect((await executeEmailAuth(input, new Request("https://tugg.lol/test", { headers: { origin: "https://evil.example" } }))).ok).toBe(false);
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it("reset verifies recovery token before update and invalidates sessions after success", async () => {
    mocks.verifyOtp.mockResolvedValue({ data: { session: {}, user: { email_confirmed_at: "2026-11-04" } }, error: null });
    mocks.update.mockResolvedValue({ error: null });
    expect((await executePasswordReset({ password: input.password, tokenHash: "test-hash", turnstileToken: "test" }, request())).ok).toBe(true);
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: "test-hash", type: "recovery" });
    expect(mocks.update).toHaveBeenCalledWith({ password: input.password });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "global" });
  });
  it("expired or reused recovery token cannot update password", async () => {
    mocks.verifyOtp.mockResolvedValue({ data: { session: null }, error: new Error("expired") });
    expect((await executePasswordReset({ password: input.password, tokenHash: "used", turnstileToken: "test" }, request())).ok).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("invalid Turnstile cannot consume recovery token", async () => {
    mocks.verify.mockRejectedValue(new Error("invalid"));
    await executePasswordReset({ password: input.password, tokenHash: "test", turnstileToken: "test" }, request());
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });
  it("email link puts recovery token only in fragment and rejects ordinary session fragments", () => {
    const url = recoveryEmailUrl("https://auth.example/verify?token=test-hash&type=recovery&redirect_to=https%3A%2F%2Ftugg.lol");
    expect(url).toBe("https://tugg.lol/reset-password#token_hash=test-hash&type=recovery");
    expect(recoveryHash(new URL(url).hash)).toBe("test-hash");
    expect(recoveryHash("#type=signup&token_hash=test-hash")).toBe(null);
    expect(recoveryHash("#access_token=ordinary-session")).toBe(null);
  });
  it("return URLs reject previews and foreign domains", () => {
    expect(authReturnUrl("https://tugg.lol", "/auth")).toBe("https://tugg.lol/auth");
    expect(() => authReturnUrl("https://preview.lovable.app", "/auth")).toThrow();
  });
});
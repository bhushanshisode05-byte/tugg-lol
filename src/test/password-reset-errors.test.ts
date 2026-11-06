import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeEmailAuth, executePasswordReset } from "@/lib/email-auth.server";
import { mapPasswordUpdateError } from "@/lib/auth-diagnostics";
import { resetPasswordSchema } from "@/lib/email-auth-schema";

const m = vi.hoisted(() => ({ verify: vi.fn(), rpc: vi.fn(), verifyOtp: vi.fn(), setSession: vi.fn(), update: vi.fn(), signOut: vi.fn(), reset: vi.fn(), log: vi.fn() }));
vi.mock("@/lib/turnstile.server", async o => ({ ...await o<typeof import("@/lib/turnstile.server")>(), verifyTurnstileForRequest: m.verify }));
vi.mock("@/lib/auth-diagnostics.server", () => ({ logAuthDiagnostic: m.log }));
vi.mock("@/lib/server-utils.server", () => ({ config: () => ({ siteUrl: "https://tugg.lol" }), publicDb: () => ({ auth: { verifyOtp: m.verifyOtp, setSession: m.setSession, updateUser: m.update, signOut: m.signOut, resetPasswordForEmail: m.reset } }) }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: m.rpc } }));
const req = () => new Request("https://tugg.lol/_serverFn/x", { headers: { origin: "https://tugg.lol", "cf-connecting-ip": "192.0.2.1" } });
const session = { access_token: "fake-access", refresh_token: "fake-refresh" };
const ok = { data: { session, user: { email_confirmed_at: "2026-11-01" } }, error: null };
const PASSWORD = "Thirteen-char";
const err = (code: string, status = 422, extra: object = {}) => Object.assign(new Error("provider text that must not leak"), { code, status, ...extra });
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("TURNSTILE_SECRET_KEY", "test-only"); m.verify.mockResolvedValue(undefined); m.rpc.mockResolvedValue({ data: true, error: null }); m.verifyOtp.mockResolvedValue(ok); m.setSession.mockResolvedValue(ok); });

const run = () => executePasswordReset({ password: PASSWORD, tokenHash: "hash", turnstileToken: "t" }, req());

describe("password update error mapping", () => {
  it.each([
    [err("weak_password", 422, { reasons: ["pwned"] }), "password_pwned", "That password appears in known data breaches. Choose a different one.", true],
    [err("weak_password", 422, { reasons: ["length"] }), "password_too_weak", "Use at least 12 characters. Longer, unique passphrases work best.", true],
    [err("same_password"), "password_same", "New password must differ from your current one.", true],
    [err("session_not_found", 403), "recovery_expired", "This reset link expired or was already used. Request a new one.", false],
    [err("over_request_rate_limit", 429), "provider_rate_limited", "Too many attempts. Wait a minute and try again.", true],
    [err("something_new", 500), "auth_provider_error", "Password could not be updated. Request a new reset link and try again.", false],
  ])("maps %#", async (providerError, reason, message, retry) => {
    m.update.mockResolvedValue({ error: providerError });
    const result = await run();
    expect(result).toMatchObject({ ok: false, reason, message });
    expect("recovery" in result).toBe(retry);
    expect(JSON.stringify(result)).not.toContain("provider text");
    const logged = m.log.mock.calls[0][0];
    expect(logged.reason).toBe(reason);
    expect(logged.providerCode).toBe(reason === "auth_provider_error" ? "unknown" : (providerError as { code: string }).code);
    expect(JSON.stringify(logged)).not.toMatch(/Thirteen|hash|fake-|hello@/);
    expect(m.signOut).not.toHaveBeenCalled();
  });
  it("reads weak reasons from the nested shape too", () => {
    expect(mapPasswordUpdateError({ code: "weak_password", weak_password: { reasons: ["pwned", "evil"] } })).toMatchObject({ reason: "password_pwned", weakReasons: ["pwned"] });
  });
  it("expired or reused link maps to recovery_expired and logs otp_expired", async () => {
    m.verifyOtp.mockResolvedValue({ data: { session: null }, error: err("otp_expired", 403) });
    expect(await run()).toMatchObject({ ok: false, reason: "recovery_expired" });
    expect(m.update).not.toHaveBeenCalled();
    expect(m.log.mock.calls[0][0]).toMatchObject({ reason: "recovery_expired", providerCode: "otp_expired" });
  });
  it("retry after a rejected password reuses the in-memory recovery session, not the burned link", async () => {
    m.update.mockResolvedValue({ error: null });
    const result = await executePasswordReset({ password: PASSWORD, recovery: session, turnstileToken: "t2" }, req());
    expect(result.ok).toBe(true);
    expect(m.verifyOtp).not.toHaveBeenCalled();
    expect(m.setSession).toHaveBeenCalledWith(session);
  });
  it("success updates once and signs out other sessions", async () => {
    m.update.mockResolvedValue({ error: null });
    expect(await run()).toEqual({ ok: true, message: "Password updated. Sign in with your new password." });
    expect(m.update).toHaveBeenCalledWith({ password: PASSWORD });
    expect(m.signOut).toHaveBeenCalledWith({ scope: "global" });
  });
  it("schema requires exactly one recovery credential", () => {
    expect(resetPasswordSchema.safeParse({ password: PASSWORD, turnstileToken: "t" }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ password: PASSWORD, tokenHash: "h", recovery: session, turnstileToken: "t" }).success).toBe(false);
  });
  it("reset-email cooldown is logged as provider_rate_limited with its code but acknowledgement stays generic", async () => {
    m.reset.mockResolvedValue({ error: err("over_email_send_rate_limit", 429) });
    expect((await executeEmailAuth({ operation: "reset", email: "hello@tugg.lol", turnstileToken: "t" }, req())).ok).toBe(true);
    expect(m.log.mock.calls[0][0]).toMatchObject({ reason: "provider_rate_limited", providerCode: "over_email_send_rate_limit", operation: "owner_password_reset" });
  });
});

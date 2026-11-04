import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_REASON_CODES, authReference } from "@/lib/auth-diagnostics";
import { logAuthDiagnostic } from "@/lib/auth-diagnostics.server";
import { verifyTurnstile } from "@/lib/turnstile.server";
import { executeEmailAuth, executePasswordReset } from "@/lib/email-auth.server";

const m = vi.hoisted(() => ({ insert: vi.fn(), rpc: vi.fn(), password: vi.fn(), reset: vi.fn(), otp: vi.fn(), verifyOtp: vi.fn(), update: vi.fn(), site: "https://tugg.lol", publicFailure: false }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: m.rpc, from: () => ({ insert: m.insert }) } }));
vi.mock("@/lib/server-utils.server", () => ({ config: () => ({ siteUrl: m.site }), publicDb: () => {
  if (m.publicFailure) throw new Error("private-provider-detail");
  return { auth: { signInWithPassword: m.password, resetPasswordForEmail: m.reset, signInWithOtp: m.otp, verifyOtp: m.verifyOtp, updateUser: m.update, signOut: vi.fn() } };
} }));
const req = (origin = "https://tugg.lol") => new Request("https://tugg.lol/auth", { headers: { origin } });
const input = { operation: "password" as const, email: "private@example.com", password: "private-password-123", turnstileToken: "private-token" };
const resetInput = { password: input.password, tokenHash: "private-recovery", turnstileToken: input.turnstileToken };
const response = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body)));
let consoleSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.resetAllMocks(); m.site = "https://tugg.lol"; m.publicFailure = false;
  vi.stubEnv("TURNSTILE_SECRET_KEY", "private-secret");
  consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  m.insert.mockResolvedValue({ error: null }); m.rpc.mockResolvedValue({ data: true, error: null });
  vi.stubGlobal("fetch", response({ success: true, action: "owner_login", hostname: "tugg.lol" }));
});

describe("safe authentication diagnostics", () => {
  it.each([
    ["invalid-input-secret", "turnstile_invalid_secret"],
    ["invalid-input-response", "turnstile_invalid_response"],
    ["timeout-or-duplicate", "turnstile_timeout_or_duplicate"],
    ["hostname-mismatch", "turnstile_hostname_mismatch"],
    ["internal-error", "turnstile_unreachable"],
  ])("classifies %s without leaking input", async (code, reason) => {
    vi.stubGlobal("fetch", response({ success: false, "error-codes": [code], hostname: "tugg.lol", action: "owner_login" }));
    const result = await executeEmailAuth(input, req());
    expect(result).toMatchObject({ ok: false, reason });
    expect(m.insert).toHaveBeenCalledWith({ kind: "auth_diagnostic", detail: { reason, operation: "owner_login", errorCodes: [code], hostname: "tugg.lol", action: "owner_login", expectedAction: "owner_login" } });
    const output = JSON.stringify([result, m.insert.mock.calls, consoleSpy.mock.calls]);
    for (const value of [input.email, input.password, input.turnstileToken, "private-secret"]) expect(output).not.toContain(value);
  });
  it("records action mismatch", async () => {
    vi.stubGlobal("fetch", response({ success: true, action: "owner_email_link", hostname: "tugg.lol" }));
    expect(await executeEmailAuth(input, req())).toMatchObject({ reason: "turnstile_action_mismatch" });
  });
  it("records missing secret", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    expect(await executeEmailAuth(input, req())).toMatchObject({ reason: "turnstile_secret_missing" });
  });
  it("records unreachable siteverify without exception text", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error(input.email + input.turnstileToken)));
    expect(await executeEmailAuth(input, req())).toMatchObject({ reason: "turnstile_unreachable" });
    expect(JSON.stringify(consoleSpy.mock.calls)).not.toContain(input.email);
  });
  it("records limiter errors separately from exhausted limits", async () => {
    m.rpc.mockResolvedValue({ error: { message: input.email }, data: null });
    expect(await executeEmailAuth(input, req())).toMatchObject({ reason: "rate_limiter_error" });
    m.rpc.mockResolvedValue({ error: null, data: false });
    expect(await executeEmailAuth(input, req())).toMatchObject({ reason: "rate_limited" });
  });
  it("records origin rejection for both forms before verification", async () => {
    expect(await executeEmailAuth(input, req("https://evil.example"))).toMatchObject({ reason: "origin_check_failed" });
    expect(await executePasswordReset(resetInput, req("https://evil.example"))).toMatchObject({ reason: "origin_check_failed" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("records invalid return URL", async () => {
    m.site = "https://preview.example";
    vi.stubGlobal("fetch", response({ success: true, action: "owner_password_reset" }));
    expect(await executeEmailAuth({ operation: "reset", email: input.email, turnstileToken: input.turnstileToken }, req())).toMatchObject({ reason: "return_url_error" });
    expect(m.reset).not.toHaveBeenCalled();
  });
  it("records thrown provider failures", async () => {
    m.password.mockRejectedValue(new Error(input.email + input.password));
    expect(await executeEmailAuth(input, req())).toMatchObject({ reason: "auth_provider_error" });
    expect(JSON.stringify(consoleSpy.mock.calls)).not.toContain(input.email);
  });
  it("records unexpected verification exceptions", async () => {
    const module = await import("@/lib/turnstile.server");
    const spy = vi.spyOn(module, "verifyTurnstileForRequest").mockRejectedValueOnce(new Error(input.email));
    expect(await executeEmailAuth(input, req())).toMatchObject({ reason: "unexpected_error" });
    spy.mockRestore();
  });
  it("reset completion records diagnostic and never consumes recovery on verification failure", async () => {
    vi.stubGlobal("fetch", response({ success: false, "error-codes": ["invalid-input-response"] }));
    expect(await executePasswordReset(resetInput, req())).toMatchObject({ reason: "turnstile_invalid_response" });
    expect(m.verifyOtp).not.toHaveBeenCalled();
    expect(m.insert.mock.calls[0]?.[0].detail.operation).toBe("owner_password_update");
  });
  it("only exposes fixed references and sanitizes malicious provider fields", async () => {
    expect(authReference(input.email)).toBeUndefined();
    for (const code of AUTH_REASON_CODES) expect(authReference(code)).toBe(code);
    await logAuthDiagnostic({ reason: "unexpected_error", operation: input.email, action: input.turnstileToken, hostname: input.email, errorCodes: [input.password], expectedAction: input.email });
    const output = JSON.stringify([m.insert.mock.calls, consoleSpy.mock.calls]);
    for (const value of Object.values(input)) expect(output).not.toContain(value);
  });
  it("diagnostic storage failure preserves closed verification and emits no raw error", async () => {
    m.insert.mockRejectedValue(new Error(input.email));
    await expect(verifyTurnstile("", "owner_login")).rejects.toMatchObject({ diagnostic: { reason: "turnstile_invalid_response" } });
    expect(JSON.stringify(consoleSpy.mock.calls)).not.toContain(input.email);
  });
});
import { publicDb, config } from "./server-utils.server";
import { TurnstileError, verifyTurnstileForRequest } from "./turnstile.server";
import { TURNSTILE_ACTIONS } from "./turnstile";
import { AUTH_ACKNOWLEDGEMENT, AUTH_FAILURE, AUTH_LIMITS, authReturnUrl, emailAuthSchema, resetPasswordSchema, type EmailAuthInput, type ResetPasswordInput } from "./email-auth-schema";

import { AuthDiagnosticError, type AuthReasonCode } from "./auth-diagnostics";
import { logAuthDiagnostic } from "./auth-diagnostics.server";

type Result = { ok: false; message: string; reason?: AuthReasonCode } | { ok: true; message: string; session?: { access_token: string; refresh_token: string } };
const denied = (message = AUTH_FAILURE): Result => ({ ok: false, message });

function sameOrigin(request: Request) {
  return request.headers.get("origin") === new URL(request.url).origin;
}

export async function takeAuthLimits(request: Request, identifier: string, group: "password" | "mail") {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const secret = process.env["TURNSTILE_SECRET_KEY"];
  if (!secret) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const hash = async (scope: string, value: string) => {
    const bytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`auth:${group}:${scope}:${value}`));
    return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, "0")).join("");
  };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const limits = AUTH_LIMITS[group];
  const slots = await Promise.all([
    supabaseAdmin.rpc("take_checkout_slot", { p_ip: await hash("ip", ip), p_max: limits.ip, p_window_minutes: limits.minutes }),
    supabaseAdmin.rpc("take_checkout_slot", { p_ip: await hash("email", identifier.toLowerCase()), p_max: limits.email, p_window_minutes: limits.minutes }),
  ]);
  if (slots.some(slot => slot.error)) throw new AuthDiagnosticError({ reason: "rate_limiter_error", operation: "email_auth" });
  return slots.every(slot => slot.data === true);
}

async function failure(error: unknown, operation: string, reason: AuthReasonCode, message: string): Promise<Result> {
  const diagnostic = error instanceof TurnstileError ? error.diagnostic : error instanceof AuthDiagnosticError ? error.diagnostic : undefined;
  const code = diagnostic?.reason ?? reason;
  if (!(error instanceof TurnstileError && diagnostic)) await logAuthDiagnostic({ reason: code, operation });
  return { ok: false, message, reason: code };
}

export async function executeEmailAuth(input: EmailAuthInput, request: Request): Promise<Result> {
  const parsed = emailAuthSchema.safeParse(input);
  if (!parsed.success) return denied();
  const data = parsed.data;
  const operation = data.operation === "password" ? TURNSTILE_ACTIONS.login : data.operation === "reset" ? TURNSTILE_ACTIONS.passwordReset : TURNSTILE_ACTIONS.emailLink;
  let stage: AuthReasonCode = "origin_check_failed";
  try {
    if (!sameOrigin(request)) return failure(null, operation, stage, AUTH_FAILURE);
    stage = "unexpected_error";
    await verifyTurnstileForRequest(data.turnstileToken, data.operation === "password" ? TURNSTILE_ACTIONS.login : data.operation === "reset" ? TURNSTILE_ACTIONS.passwordReset : TURNSTILE_ACTIONS.emailLink, request);
    stage = "rate_limiter_error";
    if (!await takeAuthLimits(request, data.email, data.operation === "password" ? "password" : "mail")) return failure(null, operation, "rate_limited", "Too many attempts. Please try again later.");
    stage = "auth_provider_error";
    // New isolated client for each request; never reuse an authenticated server client.
    const db = publicDb();
    if (data.operation === "password") {
      const { data: result, error } = await db.auth.signInWithPassword({ email: data.email, password: data.password });
      if (error || !result.session || !result.user?.email_confirmed_at) return denied();
      return { ok: true, message: "Signed in.", session: { access_token: result.session.access_token, refresh_token: result.session.refresh_token } };
    }
    stage = "return_url_error";
    const site = config().siteUrl;
    const returnUrl = authReturnUrl(site, data.operation === "reset" ? "/reset-password" : "/auth");
    stage = "auth_provider_error";
    // Provider/account errors deliberately receive identical acknowledgements.
    if (data.operation === "reset") {
      const result = await db.auth.resetPasswordForEmail(data.email, { redirectTo: returnUrl });
      if (result.error) await logAuthDiagnostic({ reason: "auth_provider_error", operation });
    } else {
      const result = await db.auth.signInWithOtp({ email: data.email, options: { shouldCreateUser: false, emailRedirectTo: returnUrl } });
      if (result.error) await logAuthDiagnostic({ reason: "auth_provider_error", operation });
    }
    return { ok: true, message: AUTH_ACKNOWLEDGEMENT };
  } catch (error) {
    return failure(error, operation, stage, "Unable to complete this request. Please retry the security check and try again.");
  }
}

export async function executePasswordReset(input: ResetPasswordInput, request: Request): Promise<Result> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return denied("Unable to reset your password. Request a new reset link.");
  const operation = TURNSTILE_ACTIONS.passwordUpdate;
  let stage: AuthReasonCode = "origin_check_failed";
  try {
    if (!sameOrigin(request)) return failure(null, operation, stage, "Unable to reset your password. Request a new reset link.");
    stage = "unexpected_error";
    const data = parsed.data;
    await verifyTurnstileForRequest(data.turnstileToken, TURNSTILE_ACTIONS.passwordUpdate, request);
    stage = "rate_limiter_error";
    if (!await takeAuthLimits(request, `recovery:${data.tokenHash}`, "password")) return failure(null, operation, "rate_limited", "Too many attempts. Please try again later.");
    stage = "auth_provider_error";
    const db = publicDb();
    // Only a real, unused recovery token can establish this client session.
    const { data: verified, error } = await db.auth.verifyOtp({ token_hash: data.tokenHash, type: "recovery" });
    if (error || !verified.session || !verified.user?.email_confirmed_at) return denied("This reset link is invalid or expired. Request a new reset link.");
    const { error: updateError } = await db.auth.updateUser({ password: data.password });
    if (updateError) return denied("Password could not be updated. Choose a different password and request a new reset link.");
    await db.auth.signOut({ scope: "global" });
    return { ok: true, message: "Password updated. Sign in with your new password." };
  } catch (error) {
    return failure(error, operation, stage, "Unable to reset your password. Please retry or request a new link.");
  }
}
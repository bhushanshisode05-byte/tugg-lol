import { publicDb, config } from "./server-utils.server";
import { verifyTurnstileForRequest } from "./turnstile.server";
import { TURNSTILE_ACTIONS } from "./turnstile";
import { AUTH_ACKNOWLEDGEMENT, AUTH_FAILURE, AUTH_LIMITS, authReturnUrl, emailAuthSchema, resetPasswordSchema, type EmailAuthInput, type ResetPasswordInput } from "./email-auth-schema";

type Result = { ok: false; message: string } | { ok: true; message: string; session?: { access_token: string; refresh_token: string } };
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
  return slots.every(slot => !slot.error && slot.data === true);
}

export async function executeEmailAuth(input: EmailAuthInput, request: Request): Promise<Result> {
  const parsed = emailAuthSchema.safeParse(input);
  if (!parsed.success || !sameOrigin(request)) return denied();
  const data = parsed.data;
  try {
    await verifyTurnstileForRequest(data.turnstileToken, data.operation === "password" ? TURNSTILE_ACTIONS.login : data.operation === "reset" ? TURNSTILE_ACTIONS.passwordReset : TURNSTILE_ACTIONS.emailLink, request);
    if (!await takeAuthLimits(request, data.email, data.operation === "password" ? "password" : "mail")) return denied("Too many attempts. Please try again later.");
    // New isolated client for each request; never reuse an authenticated server client.
    const db = publicDb();
    if (data.operation === "password") {
      const { data: result, error } = await db.auth.signInWithPassword({ email: data.email, password: data.password });
      if (error || !result.session || !result.user?.email_confirmed_at) return denied();
      return { ok: true, message: "Signed in.", session: { access_token: result.session.access_token, refresh_token: result.session.refresh_token } };
    }
    const site = config().siteUrl;
    // Provider/account errors deliberately receive identical acknowledgements.
    if (data.operation === "reset") {
      await db.auth.resetPasswordForEmail(data.email, { redirectTo: authReturnUrl(site, "/reset-password") });
    } else {
      await db.auth.signInWithOtp({ email: data.email, options: { shouldCreateUser: false, emailRedirectTo: authReturnUrl(site, "/auth") } });
    }
    return { ok: true, message: AUTH_ACKNOWLEDGEMENT };
  } catch {
    return denied("Unable to complete this request. Please retry the security check and try again.");
  }
}

export async function executePasswordReset(input: ResetPasswordInput, request: Request): Promise<Result> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success || !sameOrigin(request)) return denied("Unable to reset your password. Request a new reset link.");
  try {
    const data = parsed.data;
    await verifyTurnstileForRequest(data.turnstileToken, TURNSTILE_ACTIONS.passwordUpdate, request);
    if (!await takeAuthLimits(request, `recovery:${data.tokenHash}`, "password")) return denied("Too many attempts. Please try again later.");
    const db = publicDb();
    // Only a real, unused recovery token can establish this client session.
    const { data: verified, error } = await db.auth.verifyOtp({ token_hash: data.tokenHash, type: "recovery" });
    if (error || !verified.session || !verified.user?.email_confirmed_at) return denied("This reset link is invalid or expired. Request a new reset link.");
    const { error: updateError } = await db.auth.updateUser({ password: data.password });
    if (updateError) return denied("Password could not be updated. Choose a different password and request a new reset link.");
    await db.auth.signOut({ scope: "global" });
    return { ok: true, message: "Password updated. Sign in with your new password." };
  } catch {
    return denied("Unable to reset your password. Please retry or request a new link.");
  }
}
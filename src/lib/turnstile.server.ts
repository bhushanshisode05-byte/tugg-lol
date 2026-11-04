import type { TurnstileAction } from "./turnstile";
import type { AuthDiagnostic, AuthReasonCode } from "./auth-diagnostics";
import { logAuthDiagnostic } from "./auth-diagnostics.server";

export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileFailure = "missing" | "invalid" | "expired" | "action" | "unavailable";

export class TurnstileError extends Error {
  constructor(
    public reason: TurnstileFailure,
    public status: number,
    message: string,
    public diagnostic?: AuthDiagnostic,
  ) {
    super(message);
  }
}

const MESSAGES: Record<TurnstileFailure, [number, string]> = {
  missing: [403, "Please complete the security check."],
  invalid: [403, "The security check failed. Please try again."],
  expired: [403, "The security check expired or was already used. Please complete it again."],
  action: [403, "The security check failed. Please try again."],
  unavailable: [503, "The security check is unavailable right now. Please try again shortly."],
};

export const turnstileError = (r: TurnstileFailure) => new TurnstileError(r, ...MESSAGES[r]);

type Opts = {
  secret?: string | undefined;
  remoteip?: string | undefined;
  fetchImpl?: typeof fetch | undefined;
};

/**
 * Verifies a Turnstile token with Cloudflare Siteverify. Fails closed.
 * Siteverify rejects reused tokens (timeout-or-duplicate); the action check stops
 * a token issued for one protected operation from being spent on another.
 */
export async function verifyTurnstile(
  token: string | undefined | null,
  expectedAction: TurnstileAction,
  opts: Opts = {},
): Promise<void> {
  let result: { success?: boolean; action?: string; hostname?: string; "error-codes"?: string[] } = {};
  const fail = async (failure: TurnstileFailure, reason: AuthReasonCode): Promise<never> => {
    const diagnostic: AuthDiagnostic = { reason, operation: expectedAction, expectedAction,
      errorCodes: Array.isArray(result["error-codes"]) ? result["error-codes"].filter((code): code is string => typeof code === "string") : [],
      hostname: typeof result.hostname === "string" && ![token, opts.secret ?? process.env["TURNSTILE_SECRET_KEY"]].some(value => value && result.hostname?.includes(value)) ? result.hostname : null,
      action: result.action ?? null };
    await logAuthDiagnostic(diagnostic);
    throw new TurnstileError(failure, ...MESSAGES[failure], diagnostic);
  };
  if (!token || !token.trim()) return fail("missing", "turnstile_invalid_response");
  if (token.length > 2048) return fail("invalid", "turnstile_invalid_response");
  const secret = opts.secret ?? process.env["TURNSTILE_SECRET_KEY"];
  if (!secret) {
    return fail("unavailable", "turnstile_secret_missing");
  }
  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  if (opts.remoteip) body.append("remoteip", opts.remoteip);
  try {
    const res = await (opts.fetchImpl ?? fetch)(SITEVERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const payload = await res.json();
    if (!payload || typeof payload !== "object") return fail("unavailable", "turnstile_unreachable");
    result = payload;
  } catch {
    return fail("unavailable", "turnstile_unreachable");
  }
  const codes = Array.isArray(result["error-codes"]) ? result["error-codes"] : [];
  if (result.success !== true) {
    if (codes.includes("timeout-or-duplicate")) return fail("expired", "turnstile_timeout_or_duplicate");
    if (codes.includes("invalid-input-secret") || codes.includes("missing-input-secret")) return fail("unavailable", "turnstile_invalid_secret");
    if (codes.includes("internal-error")) return fail("unavailable", "turnstile_unreachable");
    if (codes.includes("hostname-mismatch")) return fail("invalid", "turnstile_hostname_mismatch");
    return fail("invalid", "turnstile_invalid_response");
  }
  if (result.action !== expectedAction) return fail("action", "turnstile_action_mismatch");
}

/** Verifies using the current request's client IP (Cloudflare header) when present. */
export async function verifyTurnstileForRequest(
  token: string | undefined | null,
  action: TurnstileAction,
  request?: Request,
) {
  let ip = request?.headers.get("cf-connecting-ip") || undefined;
  if (!request) {
    try {
      const { getRequestHeader } = await import("@tanstack/react-start/server");
      ip = getRequestHeader("cf-connecting-ip") || undefined;
    } catch {
      ip = undefined;
    }
  }
  return verifyTurnstile(token, action, { remoteip: ip });
}

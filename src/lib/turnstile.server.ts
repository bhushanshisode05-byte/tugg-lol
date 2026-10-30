import type { TurnstileAction } from "./turnstile";

export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileFailure = "missing" | "invalid" | "expired" | "action" | "unavailable";

export class TurnstileError extends Error {
  constructor(
    public reason: TurnstileFailure,
    public status: number,
    message: string,
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
  secret?: string;
  remoteip?: string;
  fetchImpl?: typeof fetch;
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
  if (!token || !token.trim()) throw turnstileError("missing");
  if (token.length > 2048) throw turnstileError("invalid");
  const secret = opts.secret ?? process.env["TURNSTILE_SECRET_KEY"];
  if (!secret) {
    console.error("Turnstile: server secret is not configured");
    throw turnstileError("unavailable");
  }
  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  if (opts.remoteip) body.append("remoteip", opts.remoteip);
  let result: { success?: boolean; action?: string; "error-codes"?: string[] };
  try {
    const res = await (opts.fetchImpl ?? fetch)(SITEVERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    result = await res.json();
  } catch (e) {
    console.error("Turnstile: siteverify unavailable", e instanceof Error ? e.message : "");
    throw turnstileError("unavailable");
  }
  const codes = result["error-codes"] ?? [];
  if (result.success !== true) {
    if (codes.includes("timeout-or-duplicate")) throw turnstileError("expired");
    if (codes.some((c) => c.startsWith("missing-input-secret") || c.startsWith("invalid-input-secret") || c === "internal-error")) {
      console.error("Turnstile: siteverify rejected configuration", codes.join(","));
      throw turnstileError("unavailable");
    }
    throw turnstileError("invalid");
  }
  if (result.action !== expectedAction) throw turnstileError("action");
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

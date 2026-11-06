/** Public references are a closed vocabulary, never provider text. */
export const AUTH_REASON_CODES = [
  "turnstile_invalid_secret", "turnstile_invalid_response", "turnstile_timeout_or_duplicate",
  "turnstile_action_mismatch", "turnstile_hostname_mismatch", "turnstile_unreachable",
  "turnstile_secret_missing", "rate_limiter_error", "rate_limited", "origin_check_failed",
  "return_url_error", "auth_provider_error", "unexpected_error",
  "password_pwned", "password_too_weak", "password_same", "recovery_expired", "provider_rate_limited",
] as const;
export type AuthReasonCode = typeof AUTH_REASON_CODES[number];
export function authReference(value: unknown): AuthReasonCode | undefined {
  return AUTH_REASON_CODES.find(reason => reason === value);
}
/** Provider error codes that may be stored privately; anything else becomes "unknown". */
export const PROVIDER_ERROR_CODES = [
  "weak_password", "same_password", "otp_expired", "otp_disabled", "session_not_found", "session_expired",
  "bad_jwt", "user_not_found", "over_email_send_rate_limit", "over_request_rate_limit", "validation_failed",
  "reauthentication_needed", "current_password_required", "unexpected_failure",
] as const;
export const PROVIDER_WEAK_REASONS = ["length", "characters", "pwned"] as const;
export type AuthDiagnostic = {
  reason: AuthReasonCode;
  operation: string;
  errorCodes?: string[];
  hostname?: string | null;
  action?: string | null;
  expectedAction?: string;
  providerCode?: string | null;
  providerStatus?: number | null;
  weakReasons?: string[];
};
export class AuthDiagnosticError extends Error {
  constructor(public diagnostic: AuthDiagnostic) { super("Authentication operation failed"); }
}

export const PASSWORD_MESSAGES = {
  password_pwned: "That password appears in known data breaches. Choose a different one.",
  password_too_weak: "Use at least 12 characters. Longer, unique passphrases work best.",
  password_same: "New password must differ from your current one.",
  recovery_expired: "This reset link expired or was already used. Request a new one.",
  provider_rate_limited: "Too many attempts. Wait a minute and try again.",
  auth_provider_error: "Password could not be updated. Request a new reset link and try again.",
} as const;

type ProviderError = { code?: unknown; status?: unknown; reasons?: unknown; weak_password?: { reasons?: unknown } | null; message?: unknown };
/** Map a provider error to a safe reason; never return provider text. */
export function mapPasswordUpdateError(error: unknown): { reason: keyof typeof PASSWORD_MESSAGES; providerCode: string; providerStatus: number | null; weakReasons: string[]; retryable: boolean } {
  const e = (error ?? {}) as ProviderError;
  const rawCode = typeof e.code === "string" ? e.code : "";
  const providerCode = (PROVIDER_ERROR_CODES as readonly string[]).includes(rawCode) ? rawCode : rawCode ? "unknown" : "none";
  const providerStatus = typeof e.status === "number" ? e.status : null;
  const rawReasons = Array.isArray(e.reasons) ? e.reasons : Array.isArray(e.weak_password?.reasons) ? e.weak_password!.reasons as unknown[] : [];
  const weakReasons = rawReasons.filter((r): r is string => typeof r === "string" && (PROVIDER_WEAK_REASONS as readonly string[]).includes(r));
  if (rawCode === "weak_password") {
    if (weakReasons.includes("pwned")) return { reason: "password_pwned", providerCode, providerStatus, weakReasons, retryable: true };
    return { reason: "password_too_weak", providerCode, providerStatus, weakReasons, retryable: true };
  }
  if (rawCode === "same_password") return { reason: "password_same", providerCode, providerStatus, weakReasons, retryable: true };
  if (["otp_expired", "session_not_found", "session_expired", "bad_jwt", "user_not_found"].includes(rawCode)) return { reason: "recovery_expired", providerCode, providerStatus, weakReasons, retryable: false };
  if (rawCode.startsWith("over_") || providerStatus === 429) return { reason: "provider_rate_limited", providerCode, providerStatus, weakReasons, retryable: true };
  return { reason: "auth_provider_error", providerCode, providerStatus, weakReasons, retryable: false };
}

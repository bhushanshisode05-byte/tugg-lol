/** Public references are a closed vocabulary, never provider text. */
export const AUTH_REASON_CODES = [
  "turnstile_invalid_secret", "turnstile_invalid_response", "turnstile_timeout_or_duplicate",
  "turnstile_action_mismatch", "turnstile_hostname_mismatch", "turnstile_unreachable",
  "turnstile_secret_missing", "rate_limiter_error", "rate_limited", "origin_check_failed",
  "return_url_error", "auth_provider_error", "unexpected_error",
] as const;
export type AuthReasonCode = typeof AUTH_REASON_CODES[number];
export function authReference(value: unknown): AuthReasonCode | undefined {
  return AUTH_REASON_CODES.find(reason => reason === value);
}
export type AuthDiagnostic = {
  reason: AuthReasonCode;
  operation: string;
  errorCodes?: string[];
  hostname?: string | null;
  action?: string | null;
  expectedAction?: string;
};
export class AuthDiagnosticError extends Error {
  constructor(public diagnostic: AuthDiagnostic) { super("Authentication operation failed"); }
}
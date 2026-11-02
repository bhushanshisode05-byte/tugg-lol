/** Public browser configuration, not a credential. VITE_TURNSTILE_SITE_KEY may override it. */
export const PUBLIC_TURNSTILE_SITE_KEY = "0x4AAAAAAFsDBwWWCHBKJ2qf";

export function turnstileConfigurationError(code: string): boolean {
  return ["110100", "110110", "110200"].includes(code);
}
import { z } from "zod";

export const MIN_PASSWORD_LENGTH = 12;
export const AUTH_ACKNOWLEDGEMENT = "If this address can sign in, an email will arrive shortly. Check your inbox and spam folder.";
export const AUTH_FAILURE = "Unable to sign in. Check your details and try again.";
export const AUTH_LIMITS = {
  password: { ip: 10, email: 5, minutes: 15 },
  mail: { ip: 5, email: 3, minutes: 60 },
} as const;
const email = z.string().trim().email().max(254).transform(value => value.toLowerCase());
const password = z.string().min(MIN_PASSWORD_LENGTH).max(256);
const token = z.string().min(1).max(2048);
export const emailAuthSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("password"), email, password, turnstileToken: token }),
  z.object({ operation: z.literal("reset"), email, turnstileToken: token }),
  z.object({ operation: z.literal("link"), email, turnstileToken: token }),
]);
export type EmailAuthInput = z.infer<typeof emailAuthSchema>;
export const resetPasswordSchema = z.object({ password, tokenHash: z.string().min(1).max(512), turnstileToken: token });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** Explicit live domain: email return URLs never depend on the preview origin. */
export function authReturnUrl(siteUrl: string, path: "/auth" | "/reset-password") {
  const url = new URL(siteUrl || "https://tugg.lol");
  if (url.protocol !== "https:" || !["tugg.lol", "www.tugg.lol"].includes(url.hostname)) {
    throw new Error("Authentication return domain is not configured.");
  }
  return new URL(path, url.origin).href;
}

/** Keep the one-time secret in a fragment, not request URLs or access logs. */
export function recoveryEmailUrl(verificationUrl: string) {
  const url = new URL(verificationUrl);
  const hash = url.searchParams.get("token") || url.searchParams.get("token_hash");
  if (!hash || url.searchParams.get("type") !== "recovery") return verificationUrl;
  const fragment = new URLSearchParams({ token_hash: hash, type: "recovery" });
  return `https://tugg.lol/reset-password#${fragment}`;
}

export function recoveryHash(fragment: string): string | null {
  const params = new URLSearchParams(fragment.replace(/^#/, ""));
  const value = params.get("token_hash");
  return params.get("type") === "recovery" && value && value.length <= 512 ? value : null;
}
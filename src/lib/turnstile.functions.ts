import { createServerFn } from "@tanstack/react-start";

/** Public site key fallback for builds where VITE_TURNSTILE_SITE_KEY was not embedded. Never returns the secret. */
export const getTurnstileSiteKey = createServerFn({ method: "GET" }).handler(async () => {
  const key = process.env["VITE_TURNSTILE_SITE_KEY"] || process.env["TURNSTILE_SITE_KEY"] || "";
  return { siteKey: /^[0-9a-zA-Z_-]{8,100}$/.test(key) ? key : "" };
});

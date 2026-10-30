import { z } from "zod";

/** Each protected operation has its own Turnstile action; tokens are bound to it server-side. */
export const TURNSTILE_ACTIONS = {
  pull: "pull_checkout",
  matchup: "matchup_checkout",
  contact: "support_contact",
  chat: "support_chat",
  digest: "digest_signup",
} as const;
export type TurnstileAction = (typeof TURNSTILE_ACTIONS)[keyof typeof TURNSTILE_ACTIONS];

/** Token field accepted by protected endpoints. Empty is allowed here so the server can reply "missing". */
export const turnstileTokenSchema = z.string().max(2048).optional();

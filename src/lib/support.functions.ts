import { createServerFn } from "@tanstack/react-start";
export const getPublicContact = createServerFn({ method: "GET" }).handler(async () => {
  const { config } = await import("./server-utils.server");
  const { z } = await import("zod");
  // Public business inbox is deliberately separate from the configured admin login.
  const email = 'hello@tugg.lol';
  const { basketActive } = await import("./payments/selection.server");
  return { provider: config().paymentProvider, basket: basketActive(), operator: config().ownerName || null, email: z.string().email().safeParse(email).success ? email : null };
});

import { createServerFn } from "@tanstack/react-start";
export const getPublicContact = createServerFn({ method: "GET" }).handler(async () => {
  const { config } = await import("./server-utils.server");
  const { z } = await import("zod");
  const email = config().ownerEmail;
  return { email: z.string().email().safeParse(email).success ? email : null };
});
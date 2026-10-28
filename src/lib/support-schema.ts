import { z } from "zod";
export const contactSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  message: z.string().trim().min(1).max(3000),
  sessionId: z
    .string()
    .regex(/^cs_(test_|live_)?[A-Za-z0-9]+$/)
    .max(200)
    .or(z.literal(""))
    .default(""),
});
export function ownerMatches(actual: string | undefined, expected: string) {
  return !!expected && !!actual && actual.toLowerCase() === expected.toLowerCase();
}
export const SUPPORT_LIMIT = 10;

import { z } from "zod";
export const billingSchema = z.object({
  firstName: z.string().trim().min(1).max(50), lastName: z.string().trim().min(1).max(50), emailId: z.string().email().max(254),
  addressCountry: z.string().regex(/^[A-Z]{3}$/), addressStreet1: z.string().trim().min(1).max(100), addressCity: z.string().trim().min(1).max(50), addressState: z.string().trim().min(1).max(50), addressPostalCode: z.string().trim().min(1).max(20),
});
export type Billing = z.infer<typeof billingSchema>;
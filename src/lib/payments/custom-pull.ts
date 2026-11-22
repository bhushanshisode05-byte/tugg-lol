import { z } from "zod";
import { CUSTOM_AMOUNT_ERROR, isCustomPullCents } from "./catalog";

export const immediateAmountSchema = z.discriminatedUnion("pack", [
  z.object({ pack: z.literal(5) }).strict(),
  z.object({ pack: z.literal(10) }).strict(),
  z.object({ pack: z.literal(25) }).strict(),
  z.object({ pack: z.literal("custom"), customCents: z.number().refine(isCustomPullCents, CUSTOM_AMOUNT_ERROR) }).strict(),
]);
export function immediatePurchase(input: z.infer<typeof immediateAmountSchema>) {
  const checked = immediateAmountSchema.parse(input);
  if (checked.pack === "custom") return { kind: "pull_custom" as const, cents: checked.customCents, pulls: checked.customCents / 100 };
  const kind = checked.pack === 5 ? "pull_5" as const : checked.pack === 10 ? "pull_10" as const : "pull_25" as const;
  return { kind, cents: checked.pack * 100, pulls: checked.pack };
}
export function customDollarsError(value: string) {
  return value.trim() && isCustomPullCents(Number(value) * 100) ? "" : CUSTOM_AMOUNT_ERROR;
}
import { z } from "zod";
// Client-safe pull-basket rules. The server and SQL (create_dodo_basket/apply_dodo_basket) re-enforce every one.
export const PULL_UNIT_CENTS = 100;
export const BASKET_MIN_PULLS = 5;
export const BASKET_MAX_PULLS = 500;
/** Dodo metadata allows 50 keys of <=40 chars with <=500-char values; 10 lines use 15 keys of <=78 chars. */
export const BASKET_MAX_MATCHUPS = 10;
export const BASKET_QUICK_PICKS = [5, 10, 25] as const;
export const DODO_METADATA_LIMITS = { keys: 50, keyLength: 40, valueLength: 500 } as const;

const uuid = z.string().uuid().transform((v) => v.toLowerCase());
export const basketLineSchema = z.object({
  matchupId: uuid,
  sideId: uuid,
  pulls: z.number().int().min(1).max(BASKET_MAX_PULLS),
});
export type BasketLine = z.infer<typeof basketLineSchema>;
export const basketLinesSchema = z
  .array(basketLineSchema)
  .min(1)
  .max(BASKET_MAX_MATCHUPS, `A basket can include at most ${BASKET_MAX_MATCHUPS} matchups.`)
  .superRefine((lines, ctx) => {
    if (new Set(lines.map((l) => l.matchupId)).size !== lines.length)
      ctx.addIssue({ code: "custom", message: "Each matchup can appear only once, with one side." });
    const total = basketTotal(lines);
    if (total < BASKET_MIN_PULLS || total > BASKET_MAX_PULLS)
      ctx.addIssue({ code: "custom", message: `Choose between $${BASKET_MIN_PULLS} and $${BASKET_MAX_PULLS}.` });
  });
export const basketTotal = (lines: { pulls: number }[]) => lines.reduce((sum, l) => sum + l.pulls, 0);
export const isWholeBasketAmount = (n: number) => Number.isInteger(n) && n >= BASKET_MIN_PULLS && n <= BASKET_MAX_PULLS;

/** Splits a total evenly across lines, extra pulls to the first lines. Every line gets at least one. */
export function splitPulls(total: number, count: number) {
  if (count < 1) return [];
  const base = Math.floor(total / count), extra = total % count;
  return Array.from({ length: count }, (_, i) => Math.max(1, base + (i < extra ? 1 : 0)));
}

/** Allocation sent to Dodo as checkout metadata (Dodo's cart has no per-line destination). */
export function encodeBasketMetadata(orderId: string, environment: string, lines: BasketLine[]) {
  const meta: Record<string, string> = {
    tugg_order_id: orderId,
    tugg_environment: environment,
    tugg_kind: "basket",
    tugg_pulls: String(basketTotal(lines)),
    tugg_lines: String(lines.length),
  };
  lines.forEach((l, i) => { meta[`tugg_l${i}`] = `${l.matchupId}:${l.sideId}:${l.pulls}`; });
  return meta;
}

const linePattern = /^([0-9a-f-]{36}):([0-9a-f-]{36}):([1-9][0-9]{0,2})$/;
/**
 * Reads the allocation from Dodo-verified payment metadata. Returns null when malformed;
 * the SQL apply step then holds the payment for review instead of applying anything.
 */
export function parseBasketMetadata(meta: Record<string, unknown>) {
  const count = Number(meta["tugg_lines"]);
  const pulls = Number(meta["tugg_pulls"]);
  if (!Number.isInteger(count) || count < 1 || count > BASKET_MAX_MATCHUPS || !Number.isInteger(pulls)) return null;
  const lines: { matchup_id: string; side_id: string; quantity: number }[] = [];
  for (let i = 0; i < count; i++) {
    const match = linePattern.exec(String(meta[`tugg_l${i}`] ?? "").toLowerCase());
    if (!match) return null;
    lines.push({ matchup_id: match[1]!, side_id: match[2]!, quantity: Number(match[3]) });
  }
  if (meta[`tugg_l${count}`] !== undefined) return null;
  return { pulls, lines };
}

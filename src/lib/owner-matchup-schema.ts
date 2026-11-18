// Client-safe rules for owner-created matchups. Limits match the daily AI generator.
import { z } from "zod";

export const AI_CATEGORIES = ["Tech", "Sports", "Entertainment", "Food", "Cities"] as const;
export const SIDE_NAME_MAX = 40;
export const DESCRIPTION_MAX = 280;
export const EMOJI_MAX = 8;
/** Two maximum side names joined by " vs ". */
export const TITLE_MAX = SIDE_NAME_MAX * 2 + 4;

// One or more emoji (flags, keycaps-free sequences, skin tones, ZWJ joins); no letters, so nothing slips past moderation.
const EMOJI = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|\u200d|\ufe0f)+$/u;
const HAS_PICTURE = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

const text = (label: string, max: number) =>
  z.string().trim().min(1, `${label} is required.`).max(max, `${label} must be ${max} characters or fewer.`);
const emoji = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(EMOJI_MAX, `${label} must be ${EMOJI_MAX} characters or fewer.`)
    .refine((s) => EMOJI.test(s) && HAS_PICTURE.test(s), `${label} must be an emoji.`);

export const ownerMatchupSchema = z.object({
  title: text("Title", TITLE_MAX),
  a: text("Side A name", SIDE_NAME_MAX),
  aEmoji: emoji("Side A emoji"),
  b: text("Side B name", SIDE_NAME_MAX),
  bEmoji: emoji("Side B emoji"),
  category: z.enum(AI_CATEGORIES, { message: "Pick a category." }),
  description: z.string().trim().max(DESCRIPTION_MAX, `Description must be ${DESCRIPTION_MAX} characters or fewer.`),
});
export type OwnerMatchupInput = z.infer<typeof ownerMatchupSchema>;

/** The text moderation sees — identical in shape to the AI generator's. */
export const moderationText = (m: Pick<OwnerMatchupInput, "title" | "a" | "b" | "description">) =>
  `Title: ${m.title}\nSide A: ${m.a}\nSide B: ${m.b}\nDescription: ${m.description}`;

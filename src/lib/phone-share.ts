import { z } from "zod";
import { SHARE_CHANNELS } from "./share";

export type PhonePlatform = "instagram" | "tiktok";
export const PHONE_SAVE_NOTICES = {
  instagram: "Image saved and link copied. In Instagram: tap + > Story > choose the saved image > add a Link sticker and paste.",
  tiktok: "Image saved and link copied. In TikTok: tap + > Upload > choose the image, then paste the link in your caption or bio.",
  image: "Image saved and link copied. Open your app > add a story or post > choose the saved image > paste the link (in Instagram, use a Link sticker).",
} as const;

// Only standard names can reach the private log; never send messages, stacks or arbitrary strings.
const errorNames = ["Error", "TypeError", "NotAllowedError", "NotSupportedError", "SecurityError", "DataError", "NetworkError", "InvalidStateError", "NotFoundError", "UnknownError", "OperationError", "QuotaExceededError", "TimeoutError"] as const;
export const shareFailureName = (error: unknown): typeof errorNames[number] => {
  const name = typeof error === "object" && error !== null && "name" in error ? error.name : undefined;
  return errorNames.find((allowed) => allowed === name) ?? "Error";
};
export const isShareCancelled = (error: unknown) => typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
export const shareEventSchema = z.object({
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  channel: z.enum(SHARE_CHANNELS),
  errorName: z.enum(errorNames).optional(),
}).superRefine((data, ctx) => {
  if ((data.channel === "share_error") !== Boolean(data.errorName)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Error name required only for share_error" });
});

/** Called directly from the tap handler: start copying before any image work. */
export async function sharePhoneImage(input: {
  slug: string; title: string; text: string; url: string;
  copy: (text: string) => Promise<void>;
  image: () => Promise<Blob>;
  canShare: (data: ShareData) => boolean;
  share: (data: ShareData) => Promise<void>;
  save: (blob: Blob, filename: string) => void;
  failure: (name: string) => void;
}): Promise<"shared" | "saved" | "cancelled" | "failed"> {
  try { await input.copy(`${input.text} ${input.url}`); }
  catch (error) { if (!isShareCancelled(error)) input.failure(shareFailureName(error)); return "failed"; }
  let blob: Blob;
  try { blob = await input.image(); }
  catch (error) { if (!isShareCancelled(error)) input.failure(shareFailureName(error)); return isShareCancelled(error) ? "cancelled" : "failed"; }
  const filename = `tugg-${input.slug}.png`;
  try {
    const file = new File([blob], filename, { type: "image/png" });
    if (input.canShare({ files: [file] })) {
      await input.share({ files: [file], title: input.title, text: `${input.text} ${input.url}`, url: input.url });
      return "shared";
    }
    input.failure("NotSupportedError");
  } catch (error) {
    if (isShareCancelled(error)) return "cancelled";
    input.failure(shareFailureName(error));
  }
  try { input.save(blob, filename); return "saved"; }
  catch (error) { if (!isShareCancelled(error)) input.failure(shareFailureName(error)); return isShareCancelled(error) ? "cancelled" : "failed"; }
}
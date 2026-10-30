import { z } from "zod";
import { SHARE_CHANNELS } from "./share";

export const PHONE_SAVE_NOTICE = "Image saved and link copied. Open your app > add a story or post > choose the saved image > paste the link (in Instagram, use a Link sticker).";

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

/** Invoke from the tap: clipboard starts first, but never await it before the native sheet. */
export async function sharePhoneImage(input: {
  slug: string; title: string; text: string; url: string;
  copy: (text: string) => Promise<void>;
  image: Blob | null;
  loadImage: () => Promise<Blob>;
  canShare: (data: ShareData) => boolean;
  share: (data: ShareData) => Promise<void>;
  save: (blob: Blob, filename: string) => void;
  failure: (name: string) => void;
}): Promise<"shared" | "saved" | "cancelled" | "failed"> {
  let copied: Promise<boolean>;
  try { copied = input.copy(`${input.text} ${input.url}`).then(() => true, () => false); }
  catch { copied = Promise.resolve(false); }
  const filename = `tugg-${input.slug}.png`;
  try {
    const data: ShareData = { title: input.title, text: input.text, url: input.url };
    if (input.image) {
      const file = new File([input.image], filename, { type: "image/png" });
      // Unsupported files are normal: still open the same sheet with text and URL.
      let supported = false;
      try { supported = input.canShare({ files: [file] }); } catch { /* text-only sheet */ }
      if (supported) data.files = [file];
    }
    await input.share(data);
    return "shared";
  } catch (error) {
    if (isShareCancelled(error)) return "cancelled";
    input.failure(shareFailureName(error));
  }
  try {
    const blob = input.image ?? await input.loadImage();
    input.save(blob, filename);
    // Never falsely claim the link was copied when the browser refused clipboard access.
    return await copied ? "saved" : "failed";
  } catch (error) {
    if (isShareCancelled(error)) return "cancelled";
    input.failure(shareFailureName(error));
    return "failed";
  }
}

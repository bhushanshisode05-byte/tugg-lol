import { describe, expect, it, vi } from "vitest";
import { sharePhoneImage, shareEventSchema, shareFailureName } from "@/lib/phone-share";

const setup = () => ({
  slug: "pizza-vs-burgers", title: "Pizza vs Burgers",
  text: "Pizza vs Burgers is live on Tugg: Pizza $42 vs Burgers $58. Pull your side.",
  url: "https://tugg.lol/m/pizza-vs-burgers",
  copy: vi.fn(async (_text: string) => {}),
  image: new Blob(["PNG"], { type: "image/png" }),
  loadImage: vi.fn(async () => new Blob(["PNG"], { type: "image/png" })),
  canShare: vi.fn((_data: ShareData) => true),
  share: vi.fn(async (_data: ShareData) => {}),
  save: vi.fn(), failure: vi.fn(),
});

describe("phone picture sharing", () => {
  it("copies text/link and invokes sharing synchronously without awaiting clipboard", async () => {
    const input = setup();
    const pending = sharePhoneImage(input);
    expect(input.copy).toHaveBeenCalledWith(`${input.text} ${input.url}`);
    expect(input.loadImage).not.toHaveBeenCalled();
    expect(input.share).toHaveBeenCalledTimes(1);
    expect(await pending).toBe("shared");
    const file = input.canShare.mock.calls[0]?.[0].files?.[0];
    expect(file?.name).toBe("tugg-pizza-vs-burgers.png");
    expect(file?.type).toBe("image/png");
    expect(input.share.mock.calls[0]?.[0].files?.[0]).toBe(file);
    expect(input.share.mock.calls[0]?.[0].url).toBe(input.url);
    expect(input.save).not.toHaveBeenCalled();
    expect(input.failure).not.toHaveBeenCalled();
  });
  it("shares text and URL through the sheet when files are unsupported", async () => {
    const input = setup(); input.canShare.mockReturnValue(false);
    expect(await sharePhoneImage(input)).toBe("shared");
    expect(input.share).toHaveBeenCalledWith({ title: input.title, text: input.text, url: input.url });
    expect(input.save).not.toHaveBeenCalled();
    expect(input.failure).not.toHaveBeenCalled();
  });
  it("opens immediately even while clipboard remains pending", async () => {
    const input = setup(); input.copy.mockImplementation(() => new Promise(() => {}));
    const pending = sharePhoneImage(input);
    expect(input.share).toHaveBeenCalledTimes(1);
    expect(await pending).toBe("shared");
  });
  it("uses text-only sharing if the preload is not ready", async () => {
    const input = { ...setup(), image: null };
    expect(await sharePhoneImage(input)).toBe("shared");
    expect(input.share.mock.calls[0]?.[0].files).toBeUndefined();
    expect(input.loadImage).not.toHaveBeenCalled();
  });
  it("does nothing else and logs no failure after AbortError", async () => {
    const input = setup(); input.share.mockRejectedValue({ name: "AbortError" });
    expect(await sharePhoneImage(input)).toBe("cancelled");
    expect(input.save).not.toHaveBeenCalled();
    expect(input.failure).not.toHaveBeenCalled();
  });
  it("logs only the error name and saves after a share failure", async () => {
    const input = setup(); input.share.mockRejectedValue(new DOMException("private data", "NotAllowedError"));
    expect(await sharePhoneImage(input)).toBe("saved");
    expect(input.failure.mock.calls).toEqual([["NotAllowedError"]]);
    expect(input.save).toHaveBeenCalledTimes(1);
  });
  it("uses text-only sharing when canShare throws", async () => {
    const input = setup(); input.canShare.mockImplementation(() => { throw new TypeError("private"); });
    expect(await sharePhoneImage(input)).toBe("shared");
    expect(input.share.mock.calls[0]?.[0].files).toBeUndefined();
    expect(input.failure).not.toHaveBeenCalled();
  });
  it("clipboard refusal does not block the sheet", async () => {
    const input = setup(); input.copy.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    expect(await sharePhoneImage(input)).toBe("shared");
    expect(input.share).toHaveBeenCalledTimes(1);
  });
  it("loads the fallback image after a text-only share error", async () => {
    const input = { ...setup(), image: null }; input.share.mockRejectedValue({ name: "NotAllowedError" });
    expect(await sharePhoneImage(input)).toBe("saved");
    expect(input.loadImage).toHaveBeenCalledTimes(1);
    expect(input.save).toHaveBeenCalledWith(await input.loadImage.mock.results[0]?.value, "tugg-pizza-vs-burgers.png");
  });

});

describe("private share error validation", () => {
  it("allows share_error with a standard name and strips unapproved fields", () => {
    expect(shareEventSchema.parse({ slug: "pizza-vs-burgers", channel: "share_error", errorName: "NotAllowedError", message: "personal data" })).toEqual({ slug: "pizza-vs-burgers", channel: "share_error", errorName: "NotAllowedError" });
  });
  it("rejects cancellation, missing names and arbitrary name strings", () => {
    for (const errorName of [undefined, "AbortError", "personal data"]) expect(shareEventSchema.safeParse({ slug: "pizza-vs-burgers", channel: "share_error", errorName }).success).toBe(false);
  });
  it("does not allow error names on normal click events", () => {
    expect(shareEventSchema.safeParse({ slug: "pizza-vs-burgers", channel: "native", errorName: "Error" }).success).toBe(false);
    expect(shareFailureName({ name: "personal data", message: "private" })).toBe("Error");
  });
});
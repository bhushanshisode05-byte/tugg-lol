import { describe, expect, it, vi } from "vitest";
import { sharePhoneImage, shareEventSchema, shareFailureName } from "@/lib/phone-share";

const setup = () => ({
  slug: "pizza-vs-burgers", title: "Pizza vs Burgers",
  text: "Pizza vs Burgers is live on Tugg: Pizza $42 vs Burgers $58. Pull your side.",
  url: "https://tugg.lol/m/pizza-vs-burgers",
  copy: vi.fn(async (_text: string) => {}),
  image: vi.fn(async () => new Blob(["PNG"], { type: "image/png" })),
  canShare: vi.fn((_data: ShareData) => true),
  share: vi.fn(async (_data: ShareData) => {}),
  save: vi.fn(), failure: vi.fn(),
});

describe("phone picture sharing", () => {
  it("copies text and link immediately before loading or sharing the PNG", async () => {
    const input = setup();
    const pending = sharePhoneImage(input);
    expect(input.copy).toHaveBeenCalledWith(`${input.text} ${input.url}`);
    expect(input.image).not.toHaveBeenCalled();
    expect(await pending).toBe("shared");
    const file = input.canShare.mock.calls[0][0].files?.[0];
    expect(file?.name).toBe("tugg-pizza-vs-burgers.png");
    expect(file?.type).toBe("image/png");
    expect(input.share.mock.calls[0][0].files?.[0]).toBe(file);
    expect(input.share.mock.calls[0][0].url).toBe(input.url);
    expect(input.save).not.toHaveBeenCalled();
    expect(input.failure).not.toHaveBeenCalled();
  });
  it("saves the same image with a PNG filename when files are unsupported", async () => {
    const input = setup(); input.canShare.mockReturnValue(false);
    expect(await sharePhoneImage(input)).toBe("saved");
    expect(input.copy).toHaveBeenCalledWith(`${input.text} ${input.url}`);
    expect(input.share).not.toHaveBeenCalled();
    expect(input.save).toHaveBeenCalledWith(await input.image.mock.results[0].value, "tugg-pizza-vs-burgers.png");
    expect(input.failure).toHaveBeenCalledWith("NotSupportedError");
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
  it("logs canShare exceptions and still saves", async () => {
    const input = setup(); input.canShare.mockImplementation(() => { throw new TypeError("private data"); });
    expect(await sharePhoneImage(input)).toBe("saved");
    expect(input.failure).toHaveBeenCalledWith("TypeError");
    expect(input.share).not.toHaveBeenCalled();
  });
  it("reports clipboard failure without falsely claiming a copied link", async () => {
    const input = setup(); input.copy.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    expect(await sharePhoneImage(input)).toBe("failed");
    expect(input.failure).toHaveBeenCalledWith("NotAllowedError");
    expect(input.image).not.toHaveBeenCalled();
  });
  it("reports an image fetch failure without opening an empty share sheet", async () => {
    const input = setup(); input.image.mockRejectedValue(new TypeError("network"));
    expect(await sharePhoneImage(input)).toBe("failed");
    expect(input.failure).toHaveBeenCalledWith("TypeError");
    expect(input.share).not.toHaveBeenCalled();
    expect(input.save).not.toHaveBeenCalled();
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
    expect(shareEventSchema.safeParse({ slug: "pizza-vs-burgers", channel: "instagram", errorName: "Error" }).success).toBe(false);
    expect(shareFailureName({ name: "personal data", message: "private" })).toBe("Error");
  });
});
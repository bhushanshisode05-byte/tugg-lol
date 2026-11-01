import { describe, expect, it } from "vitest";
import { SIDE_IMAGES_ENABLED } from "@/lib/feature-flags";

describe("dormant side pictures", () => {
  it("disables unfinished side-picture entry points", () => {
    expect(SIDE_IMAGES_ENABLED).toBe(false);
  });
});
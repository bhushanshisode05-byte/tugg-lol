import { afterEach, expect, it, vi } from "vitest";
import { config } from "@/lib/server-utils.server";
afterEach(() => vi.unstubAllEnvs());
it("TREND_SCOUT_ENABLED defaults false and requires explicit enabling", () => {
  vi.stubEnv("TREND_SCOUT_ENABLED", "");
  expect(config().trendScout).toBe(false);
  vi.stubEnv("TREND_SCOUT_ENABLED", "false");
  expect(config().trendScout).toBe(false);
  vi.stubEnv("TREND_SCOUT_ENABLED", "true");
  expect(config().trendScout).toBe(true);
});
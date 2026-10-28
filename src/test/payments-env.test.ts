import { describe, it, expect, afterEach } from "vitest";
import { resolvePaymentsEnv, config, liveOnly } from "@/lib/server-utils.server";

afterEach(() => { delete process.env["PAYMENTS_ENV"]; });

describe("payments environment", () => {
  it("live server refuses a sandbox checkout", () => {
    expect(resolvePaymentsEnv("live", "sandbox")).toHaveProperty("error");
  });
  it("browser cannot upgrade a sandbox server to live", () => {
    expect(resolvePaymentsEnv("sandbox", "live")).toEqual({ env: "sandbox" });
  });
  it("live server with no hint uses live", () => {
    expect(resolvePaymentsEnv("live")).toEqual({ env: "live" });
  });
  it("PAYMENTS_ENV defaults to sandbox and only 'live' enables live-only totals", () => {
    expect(config().paymentsEnv).toBe("sandbox");
    expect(liveOnly()).toBe(false);
    process.env["PAYMENTS_ENV"] = "live";
    expect(liveOnly()).toBe(true);
  });
});

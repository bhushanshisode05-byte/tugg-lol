import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PRODUCTS } from "@/lib/payments/catalog";

// public/llms.txt is static text that AI search engines quote as fact; the catalog is code. Every price the file states
// must come from PRODUCTS, and every product must be described, so a catalog change fails here until the file is updated.
const llms = readFileSync(resolve(__dirname, "../../public/llms.txt"), "utf8");
const dollars = (cents: number) => `$${cents / 100}`;
const pullProducts = Object.entries(PRODUCTS)
  .filter(([kind]) => /^pull_\d+$/.test(kind))
  .map(([, p]) => p)
  .filter((p) => p.pricing === "fixed")
  .sort((a, b) => a.pulls - b.pulls);
const list = (xs: (string | number)[]) => (xs.length < 2 ? `${xs[0]}` : `${xs.slice(0, -1).join(", ")} or ${xs.at(-1)}`);

describe("llms.txt pricing matches the payment catalog", () => {
  it("knows exactly the products it describes", () => {
    expect(Object.keys(PRODUCTS).sort()).toEqual(["featured", "pull_10", "pull_25", "pull_5", "pull_custom", "standard"]);
  });

  it("describes every pull bundle at the catalog's per-pull price", () => {
    const unit = new Set(pullProducts.map((p) => p.cents / p.pulls));
    expect(unit.size).toBe(1);
    const [perPull] = [...unit];
    expect(llms).toContain(`bundles of ${list(pullProducts.map((p) => p.pulls))} pulls at ${dollars(perPull ?? NaN)} per pull`);
    expect(llms).toContain(`(${list(pullProducts.map((p) => dollars(p.cents)))}, in whole US dollars)`);
  });

  it("states the matchup prices from the catalog", () => {
    expect(llms).toContain(`${dollars(PRODUCTS.standard.cents)} standard`);
    expect(llms).toContain(`${dollars(PRODUCTS.featured.cents)} featured`);
  });

  it("states no dollar amount or price range the catalog cannot charge", () => {
    const allowed = new Set<string>(Object.values(PRODUCTS).filter(p => p.pricing === "fixed").map((p) => dollars(p.cents)));
    allowed.add(dollars(PRODUCTS.pull_custom.minCents));
    allowed.add("$1,000");
    for (const p of pullProducts) allowed.add(dollars(p.cents / p.pulls));
    const stated = llms.match(/\$\d+(?:,\d{3})*(?:\.\d+)?/g) ?? [];
    expect(stated.length).toBeGreaterThan(0);
    for (const amount of stated) expect(allowed, `llms.txt states ${amount}`).toContain(amount);
    expect(llms).toContain(`custom whole-dollar amounts from ${dollars(PRODUCTS.pull_custom.minCents)} to $${(PRODUCTS.pull_custom.maxCents / 100).toLocaleString("en-US")}`);
  });

  it("keeps the entertainment-only framing", () => {
    expect(llms).toContain("whole US dollars");
    expect(llms).toContain("no prizes, payouts or winnings");
  });
});

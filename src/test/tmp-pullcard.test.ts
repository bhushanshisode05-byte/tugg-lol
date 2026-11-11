import { it, expect } from "vitest";
import { writeFileSync } from "node:fs";
import { renderCard } from "@/lib/og/render.server";
import { renderCard as oldRender } from "@/lib/og/old-render-tmp.server";
const messi = { name: "Messi", emoji: "🐐", color: "#60a5fa" };
const ronaldo = { name: "Ronaldo", emoji: "👑", color: "#ef4444" };
const same = (x: Uint8Array, y: Uint8Array) => x.length === y.length && x.every((v, i) => v === y[i]);
it("live and result cards are byte-identical to before", async () => {
  for (const size of ["link", "square", "story"] as const) {
    const live = { kind: "live" as const, day: "2026-11-11", a: { ...messi, cents: 2500 }, b: { ...ronaldo, cents: 2500 } };
    const result = { ...live, kind: "result" as const, winner: 1 as const, pullers: 3 };
    expect(same(await renderCard(live, size), await oldRender(live, size))).toBe(true);
    expect(same(await renderCard(result, size), await oldRender(result, size))).toBe(true);
  }
}, 60000);
it("variants", async () => {
  const out = "/tmp/browser/pullcard/variants";
  const v = [
    ["harry", { a: { ...messi, cents: 900 }, b: { ...ronaldo, cents: 2500 }, pull: { side: 1, count: 25, by: "Harry", title: "Messi vs Ronaldo", allTimeCents: 12500 } }],
    ["long", { a: { name: "The Extraordinarily Long Side Name FC", emoji: "🦄", color: "#a855f7", cents: 123400 }, b: { name: "Another Very Long Opponent Name United", emoji: "🐉", color: "#22c55e", cents: 98700 }, pull: { side: 0, count: 500, by: "Bartholomew Montgomery-Smythe III", title: "The Extraordinarily Long Side Name FC vs Another Very Long Opponent Name United", allTimeCents: 4567800 } }],
    ["one", { a: { ...messi, cents: 100 }, b: { ...ronaldo, cents: 0 }, pull: { side: 0, count: 1, by: null, title: "Messi vs Ronaldo", allTimeCents: 100 } }],
  ] as const;
  for (const [n, x] of v) for (const size of ["link", "square", "story"] as const)
    writeFileSync(`${out}/${n}-${size}.png`, await renderCard({ kind: "pull", day: "2026-11-11", ...(x as any) }, size));
}, 60000);

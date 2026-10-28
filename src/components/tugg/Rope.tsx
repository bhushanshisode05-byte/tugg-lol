import type { Side } from "@/lib/tugg.functions";

export const usd = (cents: number) =>
  "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: cents % 100 ? 2 : 0 });

/** Position of the flag: 0 = fully side A, 100 = fully side B, 50 = center. */
export function ropePosition(a: number, b: number) {
  if (a + b === 0) return 50;
  // Net dollars, softened so small leads still move visibly but never hit the edge.
  const share = b / (a + b);
  return 8 + share * 84;
}

export function Rope({ sides, a, b, size = "lg" }: { sides: Side[]; a: number; b: number; size?: "lg" | "sm" }) {
  const pos = 100 - ropePosition(a, b); // leading side pulls flag toward itself
  const [A, B] = sides;
  const big = size === "lg";
  return (
    <div className="w-full" role="img" aria-label={`${A?.name} ${usd(a)} versus ${B?.name} ${usd(b)}`}>
      <div className={`relative flex items-center ${big ? "h-20" : "h-10"}`}>
        <div className={`absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-full rope-texture ${big ? "h-4" : "h-2"}`} />
        <div className="absolute inset-y-0 left-1/2 w-px border-l-2 border-dashed border-muted-foreground/50" />
        <div
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-[left] duration-[1200ms] ease-[cubic-bezier(.2,1.4,.4,1)]"
          style={{ left: `${pos}%` }}
        >
          <div className={`animate-wiggle flex flex-col items-center ${big ? "" : "scale-75"}`}>
            <div className="h-0 w-0 border-y-[10px] border-l-[18px] border-y-transparent border-l-accent" />
            <div className={`w-1 rounded bg-foreground ${big ? "h-10" : "h-6"}`} />
          </div>
        </div>
        {big && (
          <>
            <span className="absolute left-0 -translate-x-1 text-4xl">{A?.emoji}</span>
            <span className="absolute right-0 translate-x-1 text-4xl">{B?.emoji}</span>
          </>
        )}
      </div>
    </div>
  );
}

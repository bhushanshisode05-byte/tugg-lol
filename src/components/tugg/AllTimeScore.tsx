import type { Matchup } from "@/lib/tugg.functions";
import { lastRound, recordText } from "@/lib/matchup-facts";
import { SideAvatar } from "./SideAvatar";
import { usd } from "./Rope";

/**
 * The permanent score: each side's all-time total and the round record. Deliberately not a rope, so it never reads as
 * a second live contest. `lead` places it above the live round (empty rounds lead with history).
 */
export function AllTimeScore({ m, lead = false }: { m: Pick<Matchup, "sides" | "round" | "history">; lead?: boolean }) {
  const [A, B] = m.sides;
  if (!A || !B) return null;
  const record = recordText(m);
  const last = lastRound(m);
  return (
    <section
      aria-labelledby="all-time-title"
      data-all-time
      className="rounded-2xl border border-dashed border-border bg-background p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="all-time-title" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          All-time score · never resets
        </h2>
        <p className="text-xs text-muted-foreground">
          {lead ? "The live round is below" : "Separate from the live round above"}
        </p>
      </div>
      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-end gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold" style={{ color: A.color }}>
            <SideAvatar side={A} /> {A.name}
          </p>
          <p className="font-mono text-2xl font-extrabold">{usd(A.all_time_cents)}</p>
        </div>
        <p className="pb-1 text-center text-xs text-muted-foreground">pulled all-time</p>
        <div className="min-w-0 text-right">
          <p className="truncate text-sm font-semibold" style={{ color: B.color }}>
            {B.name} <SideAvatar side={B} />
          </p>
          <p className="font-mono text-2xl font-extrabold">{usd(B.all_time_cents)}</p>
        </div>
      </div>
      <p className="mt-3 text-sm">
        <span className="text-muted-foreground">Rounds won: </span>
        {record ? <strong>{record}</strong> : <span>no rounds completed yet</span>}
      </p>
      {last && (
        <p className="mt-1 text-sm text-muted-foreground">
          Last round ({last.name}): <span className="text-foreground">{last.result}</span>
        </p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        Every dollar ever pulled stays counted here after each round resets.
      </p>
    </section>
  );
}

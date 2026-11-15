import { useEffect, useState, type ReactNode } from "react";
import { pullerLabel, relativeTime, visibleRecentPulls, type RecentPull } from "@/lib/recent-pulls";

/** Re-reads the clock often enough that relative times and the 48-hour cut-off stay honest. */
function useNow(ms = 5000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Quiet static list of real recent pulls. Renders nothing at all when there are none in the window. */
export function RecentPulls({
  pulls,
  showMatchup = false,
  className = "",
  aside,
}: {
  pulls: readonly RecentPull[];
  showMatchup?: boolean;
  className?: string;
  /** Optional control shown beside the heading; with no rows only this control remains. */
  aside?: ReactNode;
}) {
  const now = useNow();
  const rows = visibleRecentPulls(pulls, now);
  if (!rows.length) return aside ? <div className={`flex justify-end ${className}`}>{aside}</div> : null;
  return (
    <section aria-label="Recent pulls" data-recent-pulls className={className}>
      <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Recent pulls</h2>
        {aside}
      </div>
      <ol className="mt-2 space-y-1.5 text-sm text-muted-foreground">
        {rows.map((p, i) => (
          <li key={`${p.at}-${i}`} className="flex items-baseline justify-between gap-3">
            <span className="min-w-0">
              <span className="text-foreground">{pullerLabel(p)}</span> pulled{" "}
              <span className="font-mono text-foreground">{p.pulls}</span> for{" "}
              <span className="text-foreground">{p.side}</span>
              {showMatchup && <span> · {p.matchup}</span>}
            </span>
            <time dateTime={p.at} suppressHydrationWarning className="shrink-0 font-mono text-xs tabular-nums">
              {relativeTime(p.at, now)}
            </time>
          </li>
        ))}
      </ol>
    </section>
  );
}

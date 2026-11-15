import { useEffect, useState } from "react";

/** "2d 07:15:09" when more than a day is left (weekly rounds), "07:15:09" otherwise. */
export function countdownText(ms: number) {
  const left = Math.max(0, ms);
  const d = Math.floor(left / 8.64e7);
  const h = Math.floor((left % 8.64e7) / 3.6e6), m = Math.floor((left % 3.6e6) / 6e4), s = Math.floor((left % 6e4) / 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d ? `${d}d ` : ""}${p(h)}:${p(m)}:${p(s)}`;
}

/**
 * The current time, re-read every `intervalMs`. It is null on the server and during hydration (unless `initial` is
 * given by a parent that is already mounted), so time-derived markup never mismatches.
 */
export function useNow(intervalMs: number, initial: number | null = null) {
  const [now, setNow] = useState<number | null>(initial);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function Countdown({
  to,
  format = countdownText,
  className,
  startAt,
}: {
  to: string;
  format?: (ms: number) => string;
  /** Replaces the default "accent under 10 minutes" colouring. */
  className?: string;
  /** Time already known by a mounted parent, so the first frame shows real digits instead of a placeholder. */
  startAt?: number;
}) {
  const now = useNow(1000, startAt ?? null);
  if (now === null) return <span className="font-mono tabular-nums">--:--:--</span>;
  const ms = Math.max(0, new Date(to).getTime() - now);
  return <span className={`font-mono tabular-nums ${className ?? (ms < 6e5 ? "text-accent" : "")}`}>{format(ms)}</span>;
}

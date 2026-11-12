import { useEffect, useState } from "react";

/** "2d 07:15:09" when more than a day is left (weekly rounds), "07:15:09" otherwise. */
export function countdownText(ms: number) {
  const left = Math.max(0, ms);
  const d = Math.floor(left / 8.64e7);
  const h = Math.floor((left % 8.64e7) / 3.6e6), m = Math.floor((left % 3.6e6) / 6e4), s = Math.floor((left % 6e4) / 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d ? `${d}d ` : ""}${p(h)}:${p(m)}:${p(s)}`;
}

export function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return <span className="font-mono tabular-nums">--:--:--</span>;
  const ms = Math.max(0, new Date(to).getTime() - now);
  return <span className={`font-mono tabular-nums ${ms < 6e5 ? "text-accent" : ""}`}>{countdownText(ms)}</span>;
}

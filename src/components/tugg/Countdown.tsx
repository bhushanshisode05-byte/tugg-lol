import { useEffect, useState } from "react";

export function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return <span className="font-mono tabular-nums">--:--:--</span>;
  const ms = Math.max(0, new Date(to).getTime() - now);
  const h = Math.floor(ms / 3.6e6), m = Math.floor((ms % 3.6e6) / 6e4), s = Math.floor((ms % 6e4) / 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return <span className={`font-mono tabular-nums ${ms < 6e5 ? "text-accent" : ""}`}>{p(h)}:{p(m)}:{p(s)}</span>;
}

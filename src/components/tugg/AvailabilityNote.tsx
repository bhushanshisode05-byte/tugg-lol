export type AvailabilityStatus = "loading" | "ready" | "not-ready" | "error";

// Loading and check-failures must never claim checkout is unconfigured; only a resolved not-ready status may.
export function AvailabilityNote({ status, message, onRetry }: { status: AvailabilityStatus; message: string; onRetry: () => void }) {
  if (status === "ready") return null;
  if (status === "loading") return <p className="mt-4 text-sm text-muted-foreground">Checking checkout availability…</p>;
  if (status === "error") return <p className="mt-4 text-sm text-muted-foreground">Couldn't check availability. <button type="button" className="font-semibold underline" onClick={onRetry}>Try again</button></p>;
  return <p className="mt-4 text-sm text-muted-foreground">{message || "Checkout is unavailable. No payment has been taken."}</p>;
}

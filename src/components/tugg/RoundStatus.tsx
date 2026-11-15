import { Countdown, useNow } from "@/components/tugg/Countdown";
import { CurrentRound, roundLengthOf } from "@/lib/rounds";
import { closesInLabel, closesInText, extensionNote, roundUrgency } from "@/lib/round-urgency";

type RoundLike = { ends_at: string; extensions: number; round_length?: string | null };

/**
 * One status line for every rope. Calm: the round's name only. Urgent: a live countdown in the primary colour.
 * Final hour: accent emphasis plus any Final-Hour extension. The server and the hydration pass always render the calm
 * state; the real state resolves after mount. Every state has the same fixed height, so a flip never moves the page.
 * The ticking digits are hidden from assistive tech, which gets a coarse static label instead (no live region).
 */
export function RoundStatus({ round, className = "" }: { round: RoundLike; className?: string }) {
  const now = useNow(15_000);
  const len = roundLengthOf(round.round_length);
  const state = now === null ? "calm" : roundUrgency(len, round.ends_at, now);
  const base = `inline-flex h-5 shrink-0 items-center whitespace-nowrap leading-5 ${className}`;

  if (state === "calm" || now === null) {
    return (
      <span data-round-status="calm" className={base}>
        {CurrentRound(len)}
      </span>
    );
  }

  const left = Date.parse(round.ends_at) - now;
  const note = state === "final" ? extensionNote(round.extensions) : null;
  const label = `${closesInLabel(left)}${note ? `, final hour extended by ${round.extensions * 10} minutes` : ""}`;
  const tone = state === "final" ? "rounded bg-accent px-1.5 text-accent-foreground" : "text-primary";

  return (
    <span data-round-status={state} role="timer" aria-live="off" aria-label={label} className={`${base} gap-2 font-bold tracking-normal ${tone}`}>
      <span aria-hidden="true" data-round-ticker>
        {left <= 0 ? (
          "Closing now"
        ) : (
          <>
            Closes in <Countdown to={round.ends_at} format={closesInText} startAt={now} className="" />
          </>
        )}
      </span>
      {note && (
        <span aria-hidden="true" data-extension-note>
          {note}
        </span>
      )}
    </span>
  );
}

import { SideAvatar } from "./SideAvatar";
import { Link } from "@tanstack/react-router";
import type { ResultCard } from "@/lib/tugg.functions";
import { cardVersion, resultCardInput, resultImagePath } from "@/lib/og/card";
import { usd } from "./Rope";

/** Round result card: the same generated image used for sharing, plus readable text for everyone. */
export function ResultCardView({ c, big }: { c: ResultCard; big?: boolean }) {
  const date = new Date(new Date(c.ends_at).getTime() - 1000).toISOString().slice(0, 10);
  return (
    <figure
      className={`overflow-hidden rounded-2xl border-2 border-foreground bg-card shadow-pop ${big ? "" : ""}`}
    >
      <img
        src={resultImagePath(c.id, "link", cardVersion(resultCardInput(c)))}
        alt={`${c.winner.name} beat ${c.loser.name} ${usd(c.winner_cents)} to ${usd(c.loser_cents)} in ${c.title}, round of ${date} UTC`}
        width={1200}
        height={630}
        loading={big ? "eager" : "lazy"}
        className="block aspect-[1200/630] w-full bg-background"
      />
      <figcaption
        className={`flex flex-wrap items-center justify-between gap-2 ${big ? "p-5" : "p-4"} text-sm`}
      >
        <span>
          <span className="font-bold">
            <SideAvatar side={c.winner} /> {c.winner.name} won
          </span>{" "}
          <span className="text-muted-foreground">
            {usd(c.winner_cents)}–{usd(c.loser_cents)} · {c.pullers} pullers · {date} UTC
            {c.note === "tie" ? " · tie-break" : ""}
          </span>
        </span>
        <span className="flex gap-2">
          <Link to="/m/$slug" params={{ slug: c.slug }} className="font-bold underline">
            {c.title}
          </Link>
          {!big && (
            <Link
              to="/results/$id"
              params={{ id: c.id }}
              className="rounded-full border border-border px-3 py-1 font-bold"
            >
              Share card
            </Link>
          )}
        </span>
      </figcaption>
    </figure>
  );
}

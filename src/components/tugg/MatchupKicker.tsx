import { addedByTugg } from "@/lib/matchup-source";

/** Category line above a matchup title; credits the house when Tugg added the rope. */
export function MatchupKicker({ category, source }: { category: string; source: string }) {
  return (
    <span className="min-w-0 truncate">
      {category}
      {addedByTugg(source) ? " · Added by Tugg" : ""}
    </span>
  );
}

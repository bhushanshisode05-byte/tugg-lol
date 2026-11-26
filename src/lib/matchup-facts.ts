/** Browser-safe, quotable sentences about a matchup's live round and its never-resetting history. */
import { usd } from "@/components/tugg/Rope";
import type { Matchup, Side } from "@/lib/tugg.functions";
import { EMPTY_ROUND_TEXT, closedRoundName, currentRound, type RoundLength } from "@/lib/rounds";

type M = Pick<Matchup, "sides" | "round" | "history">;

/** The open round's own length, or null with no open round (wording then stays neutral instead of guessing "daily"). */
export const roundLength = (m: Pick<Matchup, "round">): RoundLength | null => m.round?.round_length ?? null;
export const roundTotals = (m: Pick<Matchup, "round">) => ({ a: m.round?.total_a_cents ?? 0, b: m.round?.total_b_cents ?? 0 });
export const isEmptyRound = (m: Pick<Matchup, "round">) => { const t = roundTotals(m); return t.a === 0 && t.b === 0; };

/** "Notion 1 — Obsidian 0 over 15 rounds", or null before the first round closes. */
export function recordText(m: M) {
  const [A, B] = m.sides as [Side, Side];
  const n = m.history?.rounds ?? 0;
  if (!A || !B || !n) return null;
  return `${A.name} ${A.wins} — ${B.name} ${B.wins} over ${n} round${n === 1 ? "" : "s"}`;
}

/** Previous round: name and result, or null if no round has closed yet. */
export function lastRound(m: M) {
  const last = m.history?.last;
  if (!last) return null;
  const [A, B] = m.sides;
  // A daily round is labelled by its closing date elsewhere; say "ended" so it never reads as today's round.
  const closed = closedRoundName(last.round_length, last.starts_at, last.ends_at);
  const name = last.round_length === "weekly" ? closed : `ended ${closed}`;
  const a = last.total_a_cents, b = last.total_b_cents;
  const winner = a + b > 0 && last.winner_side_id ? m.sides.find((s) => s.id === last.winner_side_id) : undefined;
  const result = winner
    ? `${winner.name} won ${usd(Math.max(a, b))} to ${usd(Math.min(a, b))}${last.note === "tie" ? " on the tie-break" : ""}`
    : `no pulls (${A?.name} and ${B?.name} stayed at $0)`;
  return { name, result, winner: winner ?? null };
}

/** The live-round sentence, worded for this matchup's round length. */
export function roundSentence(m: M, today: string) {
  const [A, B] = m.sides as [Side, Side];
  const { a, b } = roundTotals(m);
  const noun = currentRound(roundLength(m));
  if (a === 0 && b === 0) {
    const last = lastRound(m);
    return `As of ${today} (UTC): ${EMPTY_ROUND_TEXT}${last ? ` Last round (${last.name}): ${last.result}.` : ""}`;
  }
  if (a === b) return `As of ${today} (UTC), ${A.name} and ${B.name} are tied at ${usd(a)} in ${noun}.`;
  const [lead, trail, hi, lo] = a > b ? [A, B, a, b] : [B, A, b, a];
  return `As of ${today} (UTC), ${lead.name} leads ${trail.name} ${usd(hi)} to ${usd(lo)} in ${noun}.`;
}

/** The never-resetting score in one sentence. */
export function allTimeSentence(m: M) {
  const [A, B] = m.sides as [Side, Side];
  const record = recordText(m);
  return `All-time score (never resets): ${record ? `rounds won ${record}; ` : "no rounds completed yet; "}${A.name} ${usd(A.all_time_cents)} and ${B.name} ${usd(B.all_time_cents)} pulled all-time.`;
}

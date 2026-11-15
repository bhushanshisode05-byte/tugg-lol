import type { PullRow } from "@/lib/tugg.functions";

/** Name shown beside a shout-out; matches the recent-pulls list ("Someone", never "Anonymous"). */
export const shoutOutName = (name: string | null | undefined) => name?.trim() || "Someone";

/** The eight newest shout-outs on a matchup. Renders nothing when there are none. */
export function ShoutOuts({ pulls, sides }: { pulls: PullRow[]; sides: { id: string; name: string }[] }) {
  const rows = pulls.filter((p) => p.shout_out).slice(0, 8);
  if (!rows.length) return null;
  const sideName = new Map(sides.map((s) => [s.id, s.name]));
  return (
    <ul className="space-y-2">
      {rows.map((p) => (
        <li key={p.id}>
          <span className="font-bold">{shoutOutName(p.display_name)}</span>{" "}
          <span className="text-muted-foreground">for {sideName.get(p.side_id)}:</span> {p.shout_out}
        </li>
      ))}
    </ul>
  );
}

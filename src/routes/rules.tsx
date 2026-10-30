import { IMAGE_POLICY } from "@/lib/side-image";
import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/tugg/Shell";

export const Route = createFileRoute("/rules")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Rules, rounds and refunds | Tugg" },
      {
        name: "description",
        content:
          "How Tugg rounds work, ties, empty rounds, the Final-Hour extension, allowed matchups and the refund policy. No prizes, no payouts.",
      },
      { property: "og:title", content: "Tugg rules" },
      {
        property: "og:description",
        content: "24-hour rounds, Final-Hour extensions, and bragging rights only.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Rules,
});

const sections: [string, string[]][] = [
  [
    "Rounds",
    [
      "Every matchup runs in 24-hour rounds that end at 00:00 UTC.",
      "The rope shows net dollars pulled by each side in the current round.",
      "The side with more money when the round closes wins, earns a badge and extends its win streak. Then the rope resets to the center.",
    ],
  ],
  [
    "Ties and empty rounds",
    [
      "Tie: the side that reached the final total first wins.",
      "Empty round (no pulls): no winner, the rope stays centered and streaks are unchanged.",
    ],
  ],
  [
    "Final-Hour rule",
    [
      "A pull in the last 10 minutes that flips the lead extends the round by 10 minutes.",
      "A round can be extended at most 3 times (30 minutes).",
    ],
  ],
  [
    "No prizes, no payouts",
    [
      "Tugg is paid entertainment. Nothing is ever paid out to pullers or creators. It is not gambling: you are buying a pull, not a chance to win money.",
    ],
  ],
  [
    "Allowed matchups",
    ["Brands, products, places, cities, countries, teams, foods, ideas and entertainment."],
  ],
  [
    "Not allowed",
    [
      "Private individuals, political parties or candidates, hate or harassment, sexual content, illegal content and scams.",
      "Every matchup, side name and shout-out is checked automatically. Rejected shout-outs are replaced with a placeholder.",
    ],
  ],
  ["Side pictures and takedowns", [IMAGE_POLICY]],
  [
    "Refund policy",
    [
      "Pulls are non-refundable entertainment purchases once they count on the rope.",
      "If a payment is charged but never counts because of a technical error, it is refunded.",
      "Matchup creation fees are refunded automatically and in full if the matchup is rejected by moderation.",
    ],
  ],
];

function Rules() {
  return (
    <Shell>
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="font-display text-5xl font-extrabold">The rules</h1>
        <div className="mt-8 space-y-6">
          {sections.map(([h, ps]) => (
            <section key={h} className="rounded-2xl border border-border bg-card p-5">
              <h2 className="text-2xl font-extrabold">{h}</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                {ps.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </Shell>
  );
}

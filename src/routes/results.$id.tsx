import { createFileRoute, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Shell } from "@/components/tugg/Shell";
import { RouteError, NotFoundBlock } from "@/components/tugg/RouteError";
import { ResultCardView } from "@/components/tugg/ResultCardView";
import { usd } from "@/components/tugg/Rope";
import { getResult } from "@/lib/tugg.functions";
import { resultImagePath, PUBLIC_SITE } from "@/lib/og/card";

const UUID = /^[0-9a-f-]{36}$/i;
const rq = (id: string) => queryOptions({ queryKey: ["result", id], queryFn: () => (UUID.test(id) ? getResult({ data: { id } }) : null) });

export const Route = createFileRoute("/results/$id")({
  loader: async ({ context, params }) => {
    const c = await context.queryClient.ensureQueryData(rq(params.id));
    if (!c) throw notFound();
    return c;
  },
  head: ({ loaderData: c, params }) => ({
    meta: c
      ? [
          { title: `${c.winner.name} beat ${c.loser.name} ${usd(c.winner_cents)}–${usd(c.loser_cents)} | Tugg` },
          { name: "description", content: `${c.title}: ${c.winner.name} won the Tugg round ending ${c.ends_at.slice(0, 10)} UTC with ${usd(c.winner_cents)} pulled.` },
          { property: "og:title", content: `${c.winner.emoji} ${c.winner.name} won ${c.title}` },
          { property: "og:description", content: `${usd(c.winner_cents)} to ${usd(c.loser_cents)} from ${c.pullers} pullers. Pick your side for the next round.` },
          { property: "og:type", content: "article" },
          { property: "og:url", content: `/results/${params.id}` },
          { property: "og:image", content: `${PUBLIC_SITE}${resultImagePath(c.id, "link")}` },
          { property: "og:image:width", content: "1200" },
          { property: "og:image:height", content: "630" },
          { name: "twitter:card", content: "summary_large_image" },
          { name: "twitter:image", content: `${PUBLIC_SITE}${resultImagePath(c.id, "link")}` },
        ]
      : [{ title: "Result unavailable | Tugg" }, { name: "robots", content: "noindex" }],
    links: [{ rel: "canonical", href: `/results/${params.id}` }],
  }),
  errorComponent: RouteError,
  notFoundComponent: () => <NotFoundBlock text="No result card here." />,
  component: Result,
});

function Result() {
  const { id } = Route.useParams();
  const { data: c } = useSuspenseQuery(rq(id));
  if (!c) return null;
  const text = `${c.winner.emoji} ${c.winner.name} beat ${c.loser.name} ${usd(c.winner_cents)}–${usd(c.loser_cents)} on Tugg!`;
  const url = typeof window !== "undefined" ? window.location.href : "";
  const enc = encodeURIComponent;
  return (
    <Shell>
      <div className="mx-auto max-w-3xl px-4 py-10">
        <ResultCardView c={c} big />
        <div className="mt-6 flex flex-wrap gap-2 text-sm font-bold">
          <a className="rounded-full border border-border px-4 py-2" target="_blank" rel="noopener noreferrer" href={`https://x.com/intent/post?text=${enc(text)}&url=${enc(url)}`}>Share on X</a>
          <a className="rounded-full border border-border px-4 py-2" target="_blank" rel="noopener noreferrer" href={`https://bsky.app/intent/compose?text=${enc(`${text} ${url}`)}`}>Bluesky</a>
          <button className="rounded-full border border-border px-4 py-2" onClick={() => navigator.clipboard.writeText(`${text} ${url}`)}>Copy link</button>
        </div>
      </div>
    </Shell>
  );
}

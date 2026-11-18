import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Shell } from "@/components/tugg/Shell";
import { RouteError, NotFoundBlock } from "@/components/tugg/RouteError";
import { usd } from "@/components/tugg/Rope";
import { getPullCard, type PullCard } from "@/lib/tugg.functions";
import { pullHeadline, pullImagePath, pullPagePath, PUBLIC_SITE } from "@/lib/og/card";

const UUID = /^[0-9a-f-]{36}$/i;
const pq = (id: string) => queryOptions({ queryKey: ["pull-card", id], queryFn: () => (UUID.test(id) ? getPullCard({ data: { id } }) : null) });

/** Public wording for a pull: the moderated display name, or "Someone". */
const headline = (c: PullCard) => pullHeadline(c.by ?? "Someone", c.pulls, c.sides.find((s) => s.id === c.sideId)?.name ?? "their side");

/**
 * One pull's public card: exactly what the share image shows (side, pull count, snapshot totals, display name).
 * Linked from the buyer's receipt, so it must stay safe to forward: no order, payment or contact details ever.
 */
export const Route = createFileRoute("/pull/$id")({
  staticData: { sitemap: false },
  loader: async ({ context, params }) => {
    const c = await context.queryClient.ensureQueryData(pq(params.id));
    if (!c) throw notFound();
    return c;
  },
  head: ({ loaderData: c, params }) => {
    if (!c) return { meta: [{ title: "Pull card unavailable | Tugg" }, { name: "robots", content: "noindex" }] };
    const image = `${PUBLIC_SITE}${pullImagePath(c.id, "link")}`;
    return {
      meta: [
        { title: `${headline(c)} in ${c.title} | Tugg` },
        { name: "description", content: `A pull card from ${c.title} on Tugg. Pick your side and pull.` },
        // Personal snapshots are shareable but not search results.
        { name: "robots", content: "noindex" },
        { property: "og:title", content: `${headline(c)} on Tugg` },
        { property: "og:description", content: `${c.title}: pick your side and pull.` },
        { property: "og:type", content: "article" },
        { property: "og:url", content: `${PUBLIC_SITE}${pullPagePath(params.id)}` },
        { property: "og:image", content: image },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: image },
      ],
    };
  },
  errorComponent: RouteError,
  notFoundComponent: () => <NotFoundBlock text="This pull card isn't available." />,
  component: PullCardPage,
});

function PullCardPage() {
  const { id } = Route.useParams();
  const { data: c } = useSuspenseQuery(pq(id));
  if (!c) return null;
  const [a, b] = c.sides;
  const side = c.sides.find((s) => s.id === c.sideId);
  return (
    <Shell>
      <div className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Pull card · {c.title}</p>
        <h1 className="mt-1 font-display text-3xl font-extrabold leading-tight sm:text-4xl">{headline(c)}</h1>
        <img
          src={pullImagePath(c.id, "link")}
          width={1200}
          height={630}
          alt={`${headline(c)}. Score right after this pull: ${a?.name} ${usd(c.totalA)}, ${b?.name} ${usd(c.totalB)}.`}
          className="mt-6 h-auto w-full rounded-2xl border border-border bg-card"
        />
        <p className="mt-4 text-sm text-muted-foreground">
          Score right after this pull: <strong className="text-foreground">{a?.name} {usd(c.totalA)}</strong> vs{" "}
          <strong className="text-foreground">{b?.name} {usd(c.totalB)}</strong>
          {side ? <> · {side.name} all-time {usd(c.sideAllTime)}</> : null}
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link to="/m/$slug" params={{ slug: c.slug }} className="rounded-full bg-primary px-5 py-2.5 font-bold text-primary-foreground">
            See the live matchup
          </Link>
          <Link to="/" className="rounded-full border border-border px-5 py-2.5 font-bold">
            All matchups
          </Link>
        </div>
      </div>
    </Shell>
  );
}

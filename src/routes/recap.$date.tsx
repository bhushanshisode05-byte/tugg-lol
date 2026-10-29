import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getRecap } from "@/lib/recap.functions";
import { Shell } from "@/components/tugg/Shell";
import { RecapView } from "@/components/tugg/RecapView";

const q = (day: string) => queryOptions({ queryKey: ["recap", day], queryFn: () => getRecap({ data: { day } }) });

export const Route = createFileRoute("/recap/$date")({
  loader: async ({ context, params }) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(params.date)) throw notFound();
    const d = await context.queryClient.ensureQueryData(q(params.date));
    if (!d.recap) throw notFound();
    return d;
  },
  head: ({ loaderData, params }) =>
    loaderData?.recap
      ? {
          meta: [
            { title: `Tugg recap for ${params.date}` },
            { name: "description", content: loaderData.recap.summary },
            { property: "og:title", content: `Yesterday on Tugg — ${params.date}` },
            { property: "og:description", content: loaderData.recap.summary },
            { property: "og:type", content: "article" },
            { name: "twitter:card", content: "summary_large_image" },
          ],
          links: [{ rel: "canonical", href: `https://tugg.lol/recap/${params.date}` }],
        }
      : { meta: [{ title: "Recap unavailable | Tugg" }, { name: "robots", content: "noindex" }] },
  notFoundComponent: () => (
    <Shell>
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <h1 className="font-display text-4xl font-extrabold">No recap for that day.</h1>
        <Link to="/recap" className="mt-4 inline-block text-primary underline">Latest recap</Link>
      </div>
    </Shell>
  ),
  component: () => {
    const { date } = Route.useParams();
    const { data } = useSuspenseQuery(q(date));
    return <Shell><RecapView recap={data.recap} archive={data.archive} /></Shell>;
  },
});

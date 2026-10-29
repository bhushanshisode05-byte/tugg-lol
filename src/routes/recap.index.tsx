import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getRecap } from "@/lib/recap.functions";
import { Shell } from "@/components/tugg/Shell";
import { RecapView } from "@/components/tugg/RecapView";

const q = queryOptions({ queryKey: ["recap", "latest"], queryFn: () => getRecap({ data: {} }) });

export const Route = createFileRoute("/recap/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(q),
  head: ({ loaderData }) => {
    const desc = loaderData?.recap?.summary ?? "A daily, data-only recap of every Tugg rope: winners, the biggest rope, top matchups and countries.";
    return {
      meta: [
        { title: "Yesterday on Tugg — daily rope recap" },
        { name: "description", content: desc },
        { property: "og:title", content: "Yesterday on Tugg" },
        { property: "og:description", content: desc },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: "https://tugg.lol/recap" }],
    };
  },
  component: () => {
    const { data } = useSuspenseQuery(q);
    return <Shell><RecapView recap={data.recap} archive={data.archive} /></Shell>;
  },
});

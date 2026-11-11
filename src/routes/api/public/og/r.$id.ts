import { createFileRoute } from "@tanstack/react-router";
import { getResult } from "@/lib/tugg.functions";
import { isCardSize, resultCardInput, versionedCache } from "@/lib/og/card";

/** Public result card image for a closed round. Final totals never change; ?v= is only a cache key. */
export const Route = createFileRoute("/api/public/og/r/$id")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const search = new URL(request.url).searchParams;
        const sizeParam = search.get("size");
        const size = isCardSize(sizeParam) ? sizeParam : "link";
        if (!/^[0-9a-f-]{36}$/i.test(params.id)) return new Response("Not found", { status: 404 });
        try {
          const c = await getResult({ data: { id: params.id } });
          if (!c)
            return new Response("Not found", {
              status: 404,
              headers: { "Cache-Control": "public, max-age=60" },
            });
          const input = resultCardInput(c);
          const { renderCard } = await import("@/lib/og/render.server");
          const png = await renderCard(input, size);
          return new Response(png as BodyInit, {
            headers: {
              "Content-Type": "image/png",
              // Unversioned result links (recap archive) keep the previous one-hour cache.
              "Cache-Control": versionedCache(input, search.get("v"), "public, max-age=3600, s-maxage=3600"),
              "Content-Disposition": `inline; filename="tugg-result-${size}.png"`,
            },
          });
        } catch (e) {
          console.error("result image failed", e instanceof Error ? e.message : e);
          return new Response("Image unavailable", {
            status: 500,
            headers: { "Cache-Control": "no-store" },
          });
        }
      },
    },
  },
});

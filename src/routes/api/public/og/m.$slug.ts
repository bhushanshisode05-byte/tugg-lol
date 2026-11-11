import { createFileRoute } from "@tanstack/react-router";
import { getMatchup } from "@/lib/tugg.functions";
import { isCardSize, matchupCardInput, versionedCache } from "@/lib/og/card";

/**
 * Public, login-free live share image for a matchup. Always draws current data; the ?v= token
 * (round totals + fingerprint) is only a cache key, so a matching token is cached hard.
 */
export const Route = createFileRoute("/api/public/og/m/$slug")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const search = new URL(request.url).searchParams;
        const sizeParam = search.get("size");
        const size = isCardSize(sizeParam) ? sizeParam : "link";
        if (!/^[a-z0-9-]{1,100}$/.test(params.slug))
          return new Response("Not found", { status: 404 });
        try {
          const d = await getMatchup({ data: { slug: params.slug } });
          const input = d ? matchupCardInput(d.matchup) : null;
          if (!d || !input)
            return new Response("Not found", {
              status: 404,
              headers: { "Cache-Control": "public, max-age=60" },
            });
          const { renderCard } = await import("@/lib/og/render.server");
          const png = await renderCard(input, size);
          return new Response(png as BodyInit, {
            headers: {
              "Content-Type": "image/png",
              "Cache-Control": versionedCache(input, search.get("v")),
              "Content-Disposition": `inline; filename="tugg-${params.slug}-${size}.png"`,
            },
          });
        } catch (e) {
          console.error("share image failed", e instanceof Error ? e.message : e);
          return new Response("Image unavailable", {
            status: 500,
            headers: { "Cache-Control": "no-store" },
          });
        }
      },
    },
  },
});

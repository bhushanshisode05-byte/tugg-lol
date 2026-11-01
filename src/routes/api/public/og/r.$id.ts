import { createFileRoute } from "@tanstack/react-router";
import { getResult } from "@/lib/tugg.functions";
import { isCardSize } from "@/lib/og/card";

/** Public result card image for a closed round (final totals never change). */
export const Route = createFileRoute("/api/public/og/r/$id")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const sizeParam = new URL(request.url).searchParams.get("size");
        const size = isCardSize(sizeParam) ? sizeParam : "link";
        if (!/^[0-9a-f-]{36}$/i.test(params.id)) return new Response("Not found", { status: 404 });
        try {
          const c = await getResult({ data: { id: params.id } });
          if (!c)
            return new Response("Not found", {
              status: 404,
              headers: { "Cache-Control": "public, max-age=60" },
            });
          const winnerIsA = c.winner.position === 0;
          const [a, b] = winnerIsA ? [c.winner, c.loser] : [c.loser, c.winner];
          const { renderCard } = await import("@/lib/og/render.server");
          const png = await renderCard(
            {
              kind: "result",
              day: new Date(new Date(c.ends_at).getTime() - 1000).toISOString().slice(0, 10),
              a: {
                name: a.name,
                emoji: a.emoji,
                color: a.color,
                cents: winnerIsA ? c.winner_cents : c.loser_cents,
              },
              b: {
                name: b.name,
                emoji: b.emoji,
                color: b.color,
                cents: winnerIsA ? c.loser_cents : c.winner_cents,
              },
              winner: winnerIsA ? 0 : 1,
              pullers: c.pullers,
            },
            size,
          );
          return new Response(png as BodyInit, {
            headers: {
              "Content-Type": "image/png",
              "Cache-Control": "public, max-age=3600, s-maxage=3600",
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

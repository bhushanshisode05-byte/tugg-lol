import { createFileRoute } from "@tanstack/react-router";
import { getMatchup } from "@/lib/tugg.functions";
import { isCardSize } from "@/lib/og/card";

/** Public, login-free live share image for a matchup. Cached for 5 minutes so the score stays fresh. */
export const Route = createFileRoute("/api/public/og/m/$slug")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const sizeParam = new URL(request.url).searchParams.get("size");
        const size = isCardSize(sizeParam) ? sizeParam : "link";
        if (!/^[a-z0-9-]{1,100}$/.test(params.slug)) return new Response("Not found", { status: 404 });
        try {
          const d = await getMatchup({ data: { slug: params.slug } });
          const [a, b] = d?.matchup.sides ?? [];
          if (!d || !a || !b) return new Response("Not found", { status: 404, headers: { "Cache-Control": "public, max-age=60" } });
          const { renderCard } = await import("@/lib/og/render.server");
          const png = await renderCard(
            {
              kind: "live",
              day: (d.matchup.round?.starts_at ?? new Date().toISOString()).slice(0, 10),
              a: { name: a.name, emoji: a.emoji, color: a.color, cents: d.matchup.round?.total_a_cents ?? 0 },
              b: { name: b.name, emoji: b.emoji, color: b.color, cents: d.matchup.round?.total_b_cents ?? 0 },
            },
            size,
          );
          return new Response(png as BodyInit, {
            headers: {
              "Content-Type": "image/png",
              "Cache-Control": "public, max-age=300, s-maxage=300",
              "Content-Disposition": `inline; filename="tugg-${params.slug}-${size}.png"`,
            },
          });
        } catch (e) {
          console.error("share image failed", e instanceof Error ? e.message : e);
          return new Response("Image unavailable", { status: 500, headers: { "Cache-Control": "no-store" } });
        }
      },
    },
  },
});

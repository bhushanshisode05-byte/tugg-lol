import { createFileRoute } from "@tanstack/react-router";
import { loadPullCard } from "@/lib/tugg.functions";
import { IMMUTABLE_CACHE, PICTURE_CACHE, drawsPicture, isCardSize, type CardInput } from "@/lib/og/card";

/**
 * Public, login-free personal pull card keyed by the public pull id.
 * It is a permanent snapshot (totals right after that pull), so it is cached for a year.
 */
export const Route = createFileRoute("/api/public/og/p/$id")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const sizeParam = new URL(request.url).searchParams.get("size");
        const size = isCardSize(sizeParam) ? sizeParam : "link";
        if (!/^[0-9a-f-]{36}$/i.test(params.id)) return new Response("Not found", { status: 404 });
        try {
          const c = await loadPullCard(params.id);
          const [a, b] = c?.sides ?? [];
          if (!c || !a || !b)
            return new Response("Not found", {
              status: 404,
              headers: { "Cache-Control": "public, max-age=60" },
            });
          const pulledA = a.id === c.sideId;
          const side = (s: typeof a, cents: number) => ({
            name: s.name,
            emoji: s.emoji,
            color: s.color,
            cents,
            image_id: s.image_id ?? null,
            image_status: s.image_status ?? null,
          });
          const input: CardInput = {
            kind: "pull",
            day: c.day,
            a: side(a, c.totalA),
            b: side(b, c.totalB),
            pull: { side: pulledA ? 0 : 1, count: c.pulls, by: c.by, title: c.title, allTimeCents: c.sideAllTime },
          };
          const { renderCard } = await import("@/lib/og/render.server");
          const png = await renderCard(input, size);
          return new Response(png as BodyInit, {
            headers: {
              "Content-Type": "image/png",
              "Cache-Control": drawsPicture(input) ? PICTURE_CACHE : IMMUTABLE_CACHE,
              "Content-Disposition": `inline; filename="tugg-${c.slug}-pull-${size}.png"`,
            },
          });
        } catch (e) {
          console.error("pull image failed", e instanceof Error ? e.message : e);
          return new Response("Image unavailable", {
            status: 500,
            headers: { "Cache-Control": "no-store" },
          });
        }
      },
    },
  },
});

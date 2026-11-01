import { createFileRoute } from "@tanstack/react-router";
import { SIDE_IMAGES_ENABLED } from "@/lib/feature-flags";
export const Route = createFileRoute("/api/public/side-images/$id")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!SIDE_IMAGES_ENABLED) return new Response("Not found", { status: 404 });
        if (!/^[0-9a-f-]{36}$/i.test(params.id)) return new Response("Not found", { status: 404 });
        const { getPublicSideImage } = await import("@/lib/side-images.server");
        return getPublicSideImage(
          params.id,
          new URL(request.url).searchParams.get("format") === "png",
        );
      },
    },
  },
});

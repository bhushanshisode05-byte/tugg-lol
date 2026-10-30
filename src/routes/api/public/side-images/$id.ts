import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/side-images/$id")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      GET: async ({ request, params }) => {
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

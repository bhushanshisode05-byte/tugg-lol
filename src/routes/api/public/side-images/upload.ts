import { createFileRoute } from "@tanstack/react-router";
import { SIDE_IMAGES_ENABLED } from "@/lib/feature-flags";
export const Route = createFileRoute("/api/public/side-images/upload")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!SIDE_IMAGES_ENABLED) return new Response("Not found", { status: 404 });
        const { uploadSideImage } = await import("@/lib/side-images.server");
        return uploadSideImage(request);
      },
    },
  },
});

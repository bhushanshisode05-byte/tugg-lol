import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
export const Route = createFileRoute("/api/public/side-images/report")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (Number(request.headers.get("content-length")) > 1000)
          return new Response("Too large", { status: 413 });
        const parsed = z
          .object({ id: z.string().uuid() })
          .safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Invalid report", { status: 400 });
        const { reportSideImage } = await import("@/lib/side-images.server");
        return reportSideImage(request, parsed.data.id);
      },
    },
  },
});

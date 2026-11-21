import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { SIDE_IMAGES_ENABLED } from "@/lib/feature-flags";

const body = z.object({ task: z.enum(["generate", "recap", "cleanup_images", "trend_scout"]) });

export const Route = createFileRoute("/api/public/jobs/daily")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const parsed = body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "bad body" }, { status: 400 });
        if (parsed.data.task === "cleanup_images" && !SIDE_IMAGES_ENABLED)
          return Response.json({ ok: true, skipped: "feature dormant" });
        const { runGenerator, runRecap, runTrendScout } = await import("@/lib/jobs.server");
        try {
          // Reuse the existing 01:05 UTC daily schedule; a scout failure must not stop the generator.
          if (parsed.data.task === "generate") {
            const scout = await runTrendScout().catch(() => ({ error: "Scout incomplete; review owner records" }));
            return Response.json({ ok: true, ...await runGenerator(), trendScout: scout });
          }
          const out =
            parsed.data.task === "trend_scout"
              ? await runTrendScout()
              : parsed.data.task === "cleanup_images"
              ? await (await import("@/lib/side-images.server")).cleanupSideImages()
              : await runRecap();
          return Response.json({ ok: true, ...out });
        } catch (e) {
          console.error("daily job", parsed.data.task, e);
          return Response.json({ ok: false, error: "job failed" }, { status: 500 });
        }
      },
    },
  },
});

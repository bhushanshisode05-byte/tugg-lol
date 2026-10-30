import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

const body = z.object({ task: z.enum(["generate", "recap"]) });

export const Route = createFileRoute("/api/public/jobs/daily")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const parsed = body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "bad body" }, { status: 400 });
        const { runGenerator, runRecap } = await import("@/lib/jobs.server");
        try {
          const out = parsed.data.task === "generate" ? await runGenerator() : await runRecap();
          return Response.json({ ok: true, ...out });
        } catch (e) {
          console.error("daily job", parsed.data.task, e);
          return Response.json({ ok: false, error: "job failed" }, { status: 500 });
        }
      },
    },
  },
});

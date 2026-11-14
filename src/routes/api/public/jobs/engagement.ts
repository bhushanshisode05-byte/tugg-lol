import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
export const Route = createFileRoute("/api/public/jobs/engagement")({
  staticData: { sitemap: false },
  server: { handlers: { POST: async ({ request }) => {
    const failure = await authenticateCronRequest(request); if (failure) return failure;
    const result = await (await import("@/lib/engagement/engagement.server")).runEngagement();
    return Response.json(result, { status: result.ok ? 200 : 503 });
  } } },
});

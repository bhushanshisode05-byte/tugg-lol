import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { config } from "@/lib/server-utils.server";
export const Route = createFileRoute("/api/public/jobs/payments")({
  staticData: { sitemap: false },
  server: { handlers: { POST: async ({ request }) => {
    const failure = await authenticateCronRequest(request); if (failure) return failure;
    try { return Response.json(config().paymentProvider === "dodo" ? await (await import("@/lib/payments/dodo-reconcile.server")).reconcileDodo() : await (await import("@/lib/payments/payglocal-fulfillment.server")).reconcilePayglocal()); }
    catch { return Response.json({ error: "Payment reconciliation unavailable" }, { status: 503 }); }
  } } },
});
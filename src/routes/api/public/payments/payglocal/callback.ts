import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/payments/payglocal/callback")({
  staticData: { sitemap: false },
  server: { handlers: { POST: async ({ request }) => (await import("@/lib/payments/payglocal-fulfillment.server")).handlePayglocalCallback(request) } },
});
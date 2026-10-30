import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/admin/data")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      GET: async ({ request }) => (await import("@/lib/admin.server")).getAdminData(request),
    },
  },
});

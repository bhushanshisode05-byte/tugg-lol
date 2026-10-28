import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/admin/data")({
  server: {
    handlers: {
      GET: async ({ request }) => (await import("@/lib/admin.server")).getAdminData(request),
    },
  },
});

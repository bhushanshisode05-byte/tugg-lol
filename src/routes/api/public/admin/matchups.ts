import { createFileRoute } from "@tanstack/react-router";
// Owner-only: the handler runs the same owner check as /api/public/admin/data before reading or writing anything.
export const Route = createFileRoute("/api/public/admin/matchups")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      POST: async ({ request }) => (await import("@/lib/owner-matchups.server")).createOwnerMatchup(request),
    },
  },
});

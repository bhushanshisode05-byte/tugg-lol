import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/admin/drafts")({
  staticData: { sitemap: false },
  server: { handlers: {
    GET: async ({ request }) => (await import("@/lib/trends/admin.server")).ownerDrafts(request),
    PATCH: async ({ request }) => (await import("@/lib/trends/admin.server")).ownerDrafts(request),
  } },
});
import { createFileRoute } from "@tanstack/react-router";
/** IndexNow key file: proves to search engines that pings come from this site. */
export const Route = createFileRoute("/indexnow.txt")({
  staticData: { sitemap: false },
  server: { handlers: { GET: async () => {
    const { indexNowKey } = await import("@/lib/indexnow.server");
    const key = indexNowKey();
    return key ? new Response(key, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } }) : new Response("Not configured", { status: 404 });
  } } },
});

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Engagement-email unsubscribe. POST only changes state: RFC 8058 one-click (mail apps post
 * "List-Unsubscribe=One-Click" to the URL in the header) or the button on /unsubscribe. The signed token is the only
 * credential; it identifies an address hash, never an address. GET never unsubscribes (link scanners prefetch GETs).
 */
const token = z.string().min(80).max(120);
const noStore = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
export const Route = createFileRoute("/api/public/email/unsubscribe")({
  staticData: { sitemap: false },
  server: { handlers: {
    GET: async ({ request }) => {
      const t = new URL(request.url).searchParams.get("t") ?? "";
      return new Response(null, { status: 303, headers: { ...noStore, Location: `/unsubscribe${token.safeParse(t).success ? `#t=${encodeURIComponent(t)}` : ""}` } });
    },
    POST: async ({ request }) => {
      const url = new URL(request.url);
      const raw = (await request.text().catch(() => "")).slice(0, 2000);
      const oneClick = /(^|&)List-Unsubscribe=One-Click(&|$)/.test(raw);
      let t: unknown = url.searchParams.get("t");
      if (!t && !oneClick) { try { t = (JSON.parse(raw) as { t?: unknown }).t; } catch { t = undefined; } }
      const parsed = token.safeParse(t);
      if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400, headers: noStore });
      const { unsubscribeByToken } = await import("@/lib/engagement/engagement.server");
      const result = await unsubscribeByToken(parsed.data, oneClick ? "one_click" : "link");
      if (result === "unsubscribed") return Response.json({ ok: true }, { headers: noStore });
      return Response.json({ error: result }, { status: result === "invalid" ? 400 : 503, headers: noStore });
    },
  } },
});

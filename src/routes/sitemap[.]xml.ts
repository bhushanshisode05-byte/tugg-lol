import { createFileRoute } from "@tanstack/react-router";
import { getRouterInstance } from "@tanstack/react-start";
import { isSitemapRouteIncluded, sitemapPathForLocation, sitemapStaticPaths, sitemapXML, type SitemapEntry } from "@/lib/sitemap";

const BASE_URL = "https://tugg.lol";
const PAGE = 1000;

export const Route = createFileRoute("/sitemap.xml")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      GET: async () => {
        const router = await getRouterInstance();
        const { createClient } = await import("@supabase/supabase-js");
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
        const supabase = createClient(process.env["SUPABASE_URL"]!, key, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: {
            fetch: (input, init) => {
              const headers = new Headers(init?.headers);
              if (key.startsWith("sb_") && headers.get("Authorization") === "Bearer " + key) headers.delete("Authorization");
              headers.set("apikey", key);
              return fetch(input, { ...init, headers });
            },
          },
        });

        // Closed rounds give page-specific lastmod values: a matchup/rivalry page changes when its round closes.
        const lastClose = new Map<string, string>();
        const results: { id: string; ends_at: string }[] = [];
        let newestClose: string | undefined;
        for (let offset = 0; ; ) {
          const { data, error } = await supabase
            .from("rounds")
            .select("id,matchup_id,ends_at,winner_side_id")
            .eq("status", "closed")
            .order("ends_at", { ascending: false })
            .order("id")
            .range(offset, offset + PAGE - 1);
          if (error) throw error;
          if (!data.length) break;
          for (const r of data) {
            newestClose ??= r.ends_at;
            if (!lastClose.has(r.matchup_id)) lastClose.set(r.matchup_id, r.ends_at);
            if (r.winner_side_id) results.push({ id: r.id, ends_at: r.ends_at });
          }
          offset += data.length;
        }

        const roundPages = new Set(["/leaderboards", "/hall-of-fame", "/stats"]);
        const entries: SitemapEntry[] = sitemapStaticPaths(router).map((path) => ({
          path,
          ...(roundPages.has(path) && newestClose ? { lastmod: newestClose } : {}),
        }));
        const add = (to: string, routeId: string, params: Record<string, string>, lastmod?: string) => {
          if (!isSitemapRouteIncluded(router.routesById[routeId as keyof typeof router.routesById] as never)) return;
          const location = router.buildLocation({ to: to as never, params: params as never, search: (() => ({})) as never, hash: "" });
          const path = sitemapPathForLocation(router, location, routeId);
          if (path) entries.push({ path, ...(lastmod ? { lastmod } : {}) });
        };

        for (let offset = 0; ; ) {
          const { data, error } = await supabase
            .from("matchups")
            .select("id,slug,created_at")
            .in("status", ["active", "retired"])
            .order("id")
            .range(offset, offset + PAGE - 1);
          if (error) throw error;
          if (!data.length) break;
          for (const m of data) {
            const lm = lastClose.get(m.id) ?? m.created_at;
            add("/m/$slug", "/m/$slug", { slug: m.slug }, lm);
            add("/rivalries/$slug", "/rivalries/$slug", { slug: m.slug }, lm);
          }
          offset += data.length;
        }
        for (const r of results) add("/results/$id", "/results/$id", { id: r.id }, r.ends_at);

        let newestRecap: string | undefined;
        for (let offset = 0; ; ) {
          const { data, error } = await supabase.from("recaps").select("day,created_at").order("day", { ascending: false }).range(offset, offset + PAGE - 1);
          if (error) throw error;
          if (!data.length) break;
          for (const r of data) {
            newestRecap ??= r.created_at;
            add("/recap/$date", "/recap/$date", { date: r.day }, r.created_at);
          }
          offset += data.length;
        }
        const recapIndex = entries.findIndex((e) => e.path === "/recap");
        // The recap index is listed only once a recap exists; with none it is an empty, noindexed page.
        if (recapIndex >= 0 && newestRecap) entries[recapIndex]!.lastmod = newestRecap;
        else if (recapIndex >= 0) entries.splice(recapIndex, 1);

        return new Response(sitemapXML(BASE_URL, entries), {
          headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" },
        });
      },
    },
  },
});

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export function publicDb() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

const flag = (k: string, def: boolean) => {
  const v = process.env[k];
  if (v == null || v === "") return def;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
};

export const config = () => ({
  siteUrl: (process.env["SITE_URL"] || "").replace(/\/$/, ""),
  pausePulls: flag("PAUSE_PULLS", false),
  testMode: flag("TEST_MODE", true),
  aiGenerator: flag("AI_GENERATOR_ENABLED", true),
  ownerEmail: process.env["OWNER_EMAIL"]?.trim() || "",
  /** Server-only payment environment. Anything but "live" means sandbox. */
  paymentsEnv: ((process.env["PAYMENTS_ENV"] || "").toLowerCase() === "live" ? "live" : "sandbox") as "sandbox" | "live",
});

/** True when only live-money pulls may count in public numbers. */
export const liveOnly = () => config().paymentsEnv === "live";

export type Verdict = { allowed: boolean; reason: string };

/** AI classifier for matchup / side / shout-out text. Fails closed. */
export async function moderate(kind: "matchup" | "shout_out", text: string): Promise<Verdict> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return { allowed: false, reason: "Moderation unavailable" };
  const rules =
    "You moderate content for Tugg, a playful rivalry site. ALLOWED: brands, products, places, cities, countries, sports teams and famous athletes, foods, ideas, hobbies, entertainment franchises and well-known public entertainers. NOT ALLOWED: private individuals, political parties, politicians or candidates, hate, harassment, slurs, sexual content, illegal content, drugs, scams, doxxing, gambling promotion, links/URLs. " +
    (kind === "shout_out"
      ? "This is a short shout-out message attached to a pull. Allow friendly trash talk; reject anything above or personal attacks."
      : "This is a new two-sided matchup (title, sides, description).");
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        reasoning: { effort: "low" },
        instructions: rules,
        input: text.slice(0, 2000),
        text: {
          format: {
            type: "json_schema",
            name: "verdict",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: { allowed: { type: "boolean" }, reason: { type: "string" } },
              required: ["allowed", "reason"],
            },
          },
        },
      }),
    });
    if (!res.ok) {
      console.error("moderation http", res.status, await res.text());
      return { allowed: false, reason: `Moderation error ${res.status}` };
    }
    const j: any = await res.json();
    const out =
      j.output_text ??
      j.output?.flatMap((o: any) => o.content ?? []).find((c: any) => c.type === "output_text")?.text;
    const v = JSON.parse(out);
    return { allowed: !!v.allowed, reason: String(v.reason || "") };
  } catch (e) {
    console.error("moderation failed", e);
    return { allowed: false, reason: "Moderation failed" };
  }
}

export const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 70);

/** Server decides the payment env; in live mode a sandbox hint from the browser is refused. */
export function resolvePaymentsEnv(server: "sandbox" | "live", hint?: "sandbox" | "live"): { env: "sandbox" | "live" } | { error: string } {
  if (server === "live" && hint === "sandbox") return { error: "Test checkouts are disabled. Please refresh the page." };
  return { env: server };
}

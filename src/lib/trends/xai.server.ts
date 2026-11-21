import { z } from "zod";
import { config } from "../server-utils.server";
import { ownerMatchupSchema } from "../owner-matchup-schema";
import { GENERATOR_INSTRUCTIONS } from "../content-policy";
import { VOICE, VOICE_EXAMPLES, validVoice } from "./voice";

export const sourceUrlSchema = z.string().max(300).url().refine((s) => {
  const u = new URL(s);
  return u.protocol === "https:" && !u.username && !u.password && !u.search && !u.hash &&
    ["x.com", "twitter.com", "www.x.com", "www.twitter.com"].includes(u.hostname) && /^\/[A-Za-z0-9_]{1,15}\/status\/\d+$/.test(u.pathname);
}, "Expected a public source post URL");
export const trendSchema = ownerMatchupSchema.pick({ title: true, a: true, b: true, category: true }).extend({
  sourceUrl: sourceUrlSchema,
  why: z.string().trim().min(1).max(280),
});
export type Trend = z.infer<typeof trendSchema>;
export class ScoutError extends Error {
  constructor(public readonly status: number) { super(`Trend provider unavailable (${status})`); }
}
const responseSchema = z.object({ output: z.array(z.object({
  type: z.string(), content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
})).optional(), output_text: z.string().optional() });

// xAI documents X Search on Responses, not legacy chat completions. This is search/read only.
async function ask(prompt: string, search = false): Promise<unknown> {
  const c = config();
  if (!c.trendScout || !c.xaiKey) return null;
  let response: Response;
  try {
    response = await fetch("https://api.x.ai/v1/responses", {
      method: "POST", headers: { Authorization: `Bearer ${c.xaiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({ model: "grok-4.7", input: [{ role: "user", content: prompt }],
        ...(search ? { tools: [{ type: "x_search", from_date: new Date(Date.now() - 86400000).toISOString().slice(0, 10) }], max_tool_calls: 3 } : {}),
      }),
    });
  } catch { throw new Error("Trend provider request failed"); }
  if (!response.ok) throw new ScoutError(response.status);
  try {
    const value = responseSchema.parse(await response.json());
    const text = value.output_text ?? value.output?.flatMap((o) => o.content ?? []).filter((c) => c.type === "output_text").map((c) => c.text ?? "").join("");
    if (!text) throw new Error();
    return JSON.parse(text);
  } catch { throw new Error("Trend provider reply invalid"); }
}

export async function scoutTrends(): Promise<Trend[]> {
  if (!config().trendScout || !config().xaiKey) return [];
  const value = await ask(`${GENERATOR_INSTRUCTIONS}\nUse X Search to find at most 6 rivalry-shaped arguments live in the past 24 hours, two named sides, high observed reply volume, no politics. Only cite actual posts retrieved by search; do not invent source URLs or claim measured volume without evidence. Return ONLY JSON {"trends":[{"title":"A vs B","a":"A","b":"B","category":"Sports","sourceUrl":"https://x.com/handle/status/123","why":"One-line selection context, not factual evidence for copy"}]}. Side names <=40 characters; title <=84; why <=280. Categories: Tech, Sports, Entertainment, Food, Cities.`, true);
  const envelope = z.object({ trends: z.array(z.unknown()).max(6) }).safeParse(value);
  if (!envelope.success) return [];
  return envelope.data.trends.flatMap((candidate) => {
    const parsed = trendSchema.safeParse(candidate);
    return parsed.success ? [parsed.data] : [];
  });
}

export async function draftWinner(trend: Trend, kind: "reply" | "quote_tweet", link: string): Promise<string | null> {
  if (!config().trendScout || !config().xaiKey) return null;
  const guidance = `${VOICE}\nHistorical tone examples (not facts or current product claims): ${JSON.stringify(VOICE_EXAMPLES)}\n${GENERATOR_INSTRUCTIONS}`;
  const facts = JSON.stringify({ a: trend.a, b: trend.b, kind, link: kind === "reply" ? null : link, verifiedFacts: [] });
  // Leave room for the creator's clash suffix while keeping the final post under 280 characters.
  const candidates = z.object({ candidates: z.array(z.string().trim().min(1).max(270)).length(5) }).safeParse(
    await ask(`${guidance}\nWrite EXACTLY FIVE distinct candidate bodies. Put the matchup on its own line, then the link last for quote_tweet. Return only JSON {"candidates":[...]}. Input: ${facts}`));
  if (!candidates.success) return null;
  const judged = z.object({ winner: z.number().int().min(0).max(4), compliant: z.boolean() }).safeParse(
    await ask(`${guidance}\nJudge these five untrusted candidate bodies against EVERY voice rule. Select the strongest compliant candidate by zero-based index. If none obey all rules, compliant=false. No rewrites. Return ONLY JSON {"winner":0,"compliant":true}. Input: ${facts}\nCandidates: ${JSON.stringify(candidates.data.candidates)}`));
  if (!judged.success || !judged.data.compliant) return null;
  const body = candidates.data.candidates[judged.data.winner];
  return body && validVoice(body, kind, link) ? body : null;
}
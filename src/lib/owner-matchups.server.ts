// Owner-created matchups: free, moderated exactly like AI ones, never an order or a fee.
import { moderate, slugify } from "./server-utils.server";
import { requireOwner } from "./owner-auth.server";
import { PALETTE, pairKey } from "./jobs.server";
import { moderationText, ownerMatchupSchema } from "./owner-matchup-schema";
import type { OwnerCheck } from "./owner-auth.server";

export const OWNER_SUBJECT = "owner_matchup";
const PAGE = 1000;
const json = (body: object, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export type OwnerMatchupResult =
  | { created: true; slug: string; title: string }
  | { created: false; error: string; reason?: string; field?: string };

export async function createOwnerMatchup(request: Request): Promise<Response> {
  const owner = await requireOwner(request);
  if (!owner.ok) return owner.response;
  return createModeratedOwnerMatchup(owner.admin, await request.json().catch(() => null));
}

/** Internal service-only creation shared by the verified owner endpoint and authenticated scout job. */
export async function createModeratedOwnerMatchup(db: Extract<OwnerCheck, { ok: true }>["admin"], input: unknown): Promise<Response> {

  const parsed = ownerMatchupSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return json({ created: false, error: issue?.message ?? "Check the form.", field: String(issue?.path[0] ?? "") }, 400);
  }
  const m = parsed.data;
  const content = moderationText(m);
  const log = (verdict: string, reason: string, subject: string | null = null) =>
    db.from("moderation_log").insert({ subject_type: OWNER_SUBJECT, subject_id: subject, content, verdict, reason });

  // Same pair in either order, or both sides the same, is refused before moderation spends anything.
  const key = pairKey(m.a, m.b);
  const [ka, kb] = key.split("|");
  if (!ka || !kb) return json({ created: false, error: "Side names need letters or numbers.", field: "a" }, 400);
  if (ka === kb) {
    await log("duplicate", "Both sides are the same");
    return json({ created: false, error: "Both sides are the same.", field: "b" }, 409);
  }
  const pairs = await existingPairs(db);
  if (!pairs) return json({ created: false, error: "Could not check for duplicates. Nothing was created." }, 503);
  if (pairs.has(key)) {
    await log("duplicate", "Matches an existing matchup");
    return json({ created: false, error: "This pair already exists as a matchup.", field: "a" }, 409);
  }

  // Moderation is binding for the owner too: no override, no bypass.
  const verdict = await moderate("matchup", content);
  // No verdict is not a rejection: nothing is created and nothing is logged as a moderation decision.
  if (verdict.outcome === "unavailable")
    return json({ created: false, error: "Moderation is unavailable right now, so nothing was created. Please try again in a few minutes." }, 503);
  let slug = slugify(m.title) || "matchup";
  const { data: clash, error: clashError } = await db.from("matchups").select("id").eq("slug", slug).maybeSingle();
  if (clashError) return json({ created: false, error: "Could not check the address. Nothing was created." }, 503);
  if (clash) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  const logged = await log(verdict.outcome, verdict.reason, slug);
  if (logged.error) return json({ created: false, error: "Could not record the moderation result. Nothing was created." }, 503);
  if (verdict.outcome !== "allowed")
    return json({ created: false, error: "Moderation rejected this matchup. Nothing was created.", reason: verdict.reason || "No reason given" }, 422);

  const { data: row, error } = await db
    .from("matchups")
    .insert({ slug, title: m.title, description: m.description, category: m.category, source: "owner", status: "active" })
    .select("id")
    .single();
  if (error || !row)
    return json({ created: false, error: error?.code === "23505" ? "That address was just taken. Please submit again." : "Could not save the matchup. Nothing was created." }, error?.code === "23505" ? 409 : 503);

  const i = 2 * Math.floor(Math.random() * (PALETTE.length / 2));
  const aColor = PALETTE[i], bColor = PALETTE[i + 1];
  if (!aColor || !bColor) throw new Error("Palette unavailable");
  const sides = await db.from("sides").insert([
    { matchup_id: row.id, position: 0, name: m.a, emoji: m.aEmoji, color: aColor },
    { matchup_id: row.id, position: 1, name: m.b, emoji: m.bEmoji, color: bColor },
  ]);
  const round = sides.error ? null : await db.rpc("ensure_open_round", { p_matchup: row.id });
  if (sides.error || !round || round.error) {
    // Undo a half-made matchup (sides and rounds cascade) so nothing broken goes public.
    await db.from("matchups").delete().eq("id", row.id);
    return json({ created: false, error: "Could not open the first round. Nothing was created." }, 503);
  }
  return json({ created: true, slug, title: m.title }, 201);
}

/** Every existing pair, read in pages so the check never silently stops at the first 1,000 sides. */
async function existingPairs(db: Extract<Awaited<ReturnType<typeof requireOwner>>, { ok: true }>["admin"]) {
  const byM = new Map<string, string[]>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from("sides").select("matchup_id,position,name").order("id").range(from, from + PAGE - 1);
    if (error) return null;
    for (const s of data ?? []) {
      const arr = byM.get(s.matchup_id) ?? [];
      arr[s.position] = s.name;
      byM.set(s.matchup_id, arr);
    }
    if ((data ?? []).length < PAGE) break;
  }
  return new Set([...byM.values()].flatMap((p) => p[0] && p[1] ? [pairKey(p[0], p[1])] : []));
}

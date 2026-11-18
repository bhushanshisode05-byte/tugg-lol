import { publicDb, config } from "./server-utils.server";
import { ownerMatches } from "./support-schema";

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];
export type OwnerCheck = { ok: true; admin: Admin; userId: string } | { ok: false; response: Response };

/**
 * The single owner check for every admin endpoint: bearer token → verified user → configured OWNER_EMAIL →
 * confirmed address → unique owner role. Nothing private is read or written before it passes.
 */
export async function requireOwner(request: Request): Promise<OwnerCheck> {
  const deny = (error: string, status: number) => ({ ok: false as const, response: Response.json({ error }, { status }) });
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return deny("Owner login required.", 401);
  const db = publicDb();
  const { data: identity, error } = await db.auth.getUser(header.slice(7));
  if (error || !identity.user) return deny("Owner login required.", 401);
  if (!ownerMatches(identity.user.email, config().ownerEmail) || !identity.user.email_confirmed_at)
    return deny("Owner access only.", 403);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: owner, error: roleError } = await supabaseAdmin.rpc("claim_tugg_owner", {
    p_user: identity.user.id,
    p_email: config().ownerEmail,
  });
  if (roleError || !owner) return deny("Owner access only.", 403);
  return { ok: true, admin: supabaseAdmin, userId: identity.user.id };
}

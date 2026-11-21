import { redirect } from "@tanstack/react-router";

export type Draft = { id: string; body: string; kind: string; source_url: string | null; source_context: string | null; expires_at: string; matchups: { slug: string; title: string } | null };
export type DraftData = { drafts: Draft[]; paused: boolean; reason: string | null };
export async function requestDrafts(token: string | undefined, update?: { id: string; status: "posted" | "discarded" }): Promise<DraftData> {
  if (!token) throw redirect({ to: "/auth", search: { denied: false } });
  const response = await fetch("/api/public/admin/drafts", {
    method: update ? "PATCH" : "GET", cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(update ? { body: JSON.stringify(update) } : {}),
  });
  if (response.status === 401 || response.status === 403) throw redirect({ to: "/auth", search: { denied: response.status === 403 } });
  if (!response.ok) throw new Error("Could not load or update drafts. Try again.");
  return response.json();
}
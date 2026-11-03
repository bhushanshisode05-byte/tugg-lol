import { redirect } from "@tanstack/react-router";

/** Authentication failures are navigation states, never private data or page errors. */
export async function loadOwnerRecords<T>(token: string | undefined, request: typeof fetch = fetch): Promise<T> {
  if (!token) throw redirect({ to: "/auth", search: { denied: false } });
  const response = await request("/api/public/admin/data", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (response.status === 401 || response.status === 403) {
    throw redirect({ to: "/auth", search: { denied: response.status === 403 } });
  }
  if (!response.ok) throw new Error("Could not load owner records.");
  return response.json() as Promise<T>;
}
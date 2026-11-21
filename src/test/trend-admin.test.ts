import { describe, expect, it, vi } from "vitest";
const check = vi.hoisted(() => vi.fn());
vi.mock("@/lib/owner-auth.server", () => ({ requireOwner: check }));
import { ownerDrafts } from "@/lib/trends/admin.server";
describe("private draft endpoint", () => {
  it.each([401, 403])("refuses unauthorized owner requests (%s) before any reads or writes", async (status) => {
    check.mockResolvedValue({ ok: false, response: Response.json({ error: "Owner access only" }, { status }) });
    for (const method of ["GET", "PATCH"]) {
      const request = new Request("https://tugg.lol/api/public/admin/drafts", { method });
      expect((await ownerDrafts(request)).status).toBe(status);
      expect(check).toHaveBeenCalledWith(request);
    }
  });
});
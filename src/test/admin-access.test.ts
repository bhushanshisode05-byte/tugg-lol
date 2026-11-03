import { describe, expect, it, vi, beforeEach } from "vitest";
import { isRedirect } from "@tanstack/react-router";
import { loadOwnerRecords } from "@/lib/admin-access";
import { getAdminData } from "@/lib/admin.server";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/server-utils.server", () => ({
  publicDb: () => ({ auth: { getUser: mocks.getUser } }),
  config: () => ({ ownerEmail: "owner@example.com" }),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: mocks.rpc, from: mocks.from },
}));

describe("owner access navigation", () => {
  it("signed-out access redirects without calling the private endpoint", async () => {
    const request = vi.fn();
    const result = await loadOwnerRecords(undefined, request).catch(e => e);
    expect(isRedirect(result)).toBe(true);
    expect(result.options.to).toBe("/auth");
    expect(request).not.toHaveBeenCalled();
  });
  it.each([401, 403])("HTTP %i redirects to sign-in rather than crashing", async status => {
    const request = vi.fn().mockResolvedValue(Response.json({ error: "Denied" }, { status }));
    const result = await loadOwnerRecords("test-token", request).catch(e => e);
    expect(isRedirect(result)).toBe(true);
    expect(result.options.to).toBe("/auth");
    expect(result.options.search.denied).toBe(status === 403);
  });
  it("accepted owner data reads back without changing it", async () => {
    const data = { pulls: [{ amount_cents: 500 }] };
    const request = vi.fn().mockResolvedValue(Response.json(data));
    expect(await loadOwnerRecords("test-token", request)).toEqual(data);
    expect(request).toHaveBeenCalledWith("/api/public/admin/data", {
      headers: { Authorization: "Bearer test-token" }, cache: "no-store",
    });
  });
});

describe("owner endpoint remains anonymous-safe", () => {
  beforeEach(() => vi.resetAllMocks());
  it("anonymous requests return 401 before identity or private reads", async () => {
    const response = await getAdminData(new Request("https://tugg.lol/api/public/admin/data"));
    expect(response.status).toBe(401);
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("invalid tokens return 401 without private reads", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error("Invalid token") });
    const response = await getAdminData(new Request("https://tugg.lol/api/public/admin/data", { headers: { Authorization: "Bearer invalid" } }));
    expect(response.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it.each([
    { email: "visitor@example.com", email_confirmed_at: "2026-11-03" },
    { email: "owner@example.com", email_confirmed_at: null },
  ])("non-owner or unconfirmed account receives no private data", async user => {
    mocks.getUser.mockResolvedValue({ data: { user }, error: null });
    const response = await getAdminData(new Request("https://tugg.lol/api/public/admin/data", { headers: { Authorization: "Bearer test" } }));
    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("a confirmed matching email still needs the unique owner role", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "owner-id", email: "owner@example.com", email_confirmed_at: "2026-11-03" } }, error: null });
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    const response = await getAdminData(new Request("https://tugg.lol/api/public/admin/data", { headers: { Authorization: "Bearer test" } }));
    expect(response.status).toBe(403);
    expect(mocks.rpc).toHaveBeenCalledWith("claim_tugg_owner", { p_user: "owner-id", p_email: "owner@example.com" });
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
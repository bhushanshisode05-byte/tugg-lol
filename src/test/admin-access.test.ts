import { describe, expect, it, vi, beforeEach } from "vitest";
import { isRedirect } from "@tanstack/react-router";
import { loadOwnerRecords } from "@/lib/admin-access";
import { getAdminData } from "@/lib/admin.server";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), from: vi.fn(), ownerEmail: "owner@example.com" }));
vi.mock("@/lib/server-utils.server", () => ({
  publicDb: () => ({ auth: { getUser: mocks.getUser } }),
  config: () => ({ ownerEmail: mocks.ownerEmail }),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: mocks.rpc, from: mocks.from },
}));

describe("owner access navigation", () => {
  it("signed-out access redirects without calling the private endpoint", async () => {
    const request = vi.fn();
    const result = await loadOwnerRecords(undefined, request).catch(e => e);
    expect(isRedirect(result)).toBe(true);
    if (!isRedirect(result)) throw new Error("Expected sign-in redirect");
    expect(result.options.to).toBe("/auth");
    expect(request).not.toHaveBeenCalled();
  });
  it.each([401, 403])("HTTP %i redirects to sign-in rather than crashing", async status => {
    const request = vi.fn().mockResolvedValue(Response.json({ error: "Denied" }, { status }));
    const result = await loadOwnerRecords("test-token", request).catch(e => e);
    expect(isRedirect(result)).toBe(true);
    if (!isRedirect(result)) throw new Error("Expected sign-in redirect");
    expect(result.options.to).toBe("/auth");
    expect(result.options.search).toEqual({ denied: status === 403 });
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
  beforeEach(() => { vi.resetAllMocks(); mocks.ownerEmail = "owner@example.com"; });
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
  it("missing OWNER_EMAIL refuses a signed-in account before role or private reads", async () => {
    mocks.ownerEmail = "";
    mocks.getUser.mockResolvedValue({ data: { user: { id: "owner-id", email: "owner@example.com", email_confirmed_at: "2026-11-04" } }, error: null });
    const response = await getAdminData(new Request("https://tugg.lol/api/public/admin/data", { headers: { Authorization: "Bearer test" } }));
    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("confirmed configured owner with the unique role receives real query results without mutations", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "owner-id", email: "OWNER@example.com", email_confirmed_at: "2026-11-04" } }, error: null });
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "claim_tugg_owner" ? true : name === "tugg_admin_summary" ? { pullRevenue: [], sources: [] } : name === "tugg_creation_revenue" ? { live: 900, sandbox: 2900 } : name === "tugg_payglocal_funnel" ? [] : { environments: [] }, error: null }));
    const rows = [{ id: "stored-pull", amount_cents: 500, environment: "sandbox" }];
    const query = { select: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), limit: vi.fn() };
    mocks.from.mockImplementation((table: string) => ({ ...query, limit: vi.fn().mockResolvedValue({ data: table === "pulls" ? rows : [], error: null }) }));
    const response = await getAdminData(new Request("https://tugg.lol/api/public/admin/data", { headers: { Authorization: "Bearer test" } }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json();
    expect(body.pulls).toEqual(rows);
    expect(body.creationRevenue).toEqual({ live: 900, sandbox: 2900 });
    expect(mocks.rpc).toHaveBeenCalledWith("claim_tugg_owner", { p_user: "owner-id", p_email: "owner@example.com" });
    expect(mocks.from.mock.calls.map(([table]) => table)).toEqual(["pulls", "matchups", "moderation_log", "events", "support_threads", "payglocal_orders", "pull_wallets"]);
  });
});
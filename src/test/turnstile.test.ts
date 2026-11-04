import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { verifyTurnstile, TurnstileError, SITEVERIFY_URL } from "@/lib/turnstile.server";
import { TURNSTILE_ACTIONS } from "@/lib/turnstile";
vi.mock("@/lib/auth-diagnostics.server", () => ({ logAuthDiagnostic: vi.fn() }));

const side = vi.hoisted(() => ({
  limitSupport: vi.fn(),
  saveMessage: vi.fn(async () => "thread-1"),
  answerFromPolicies: vi.fn(async () => "policy"),
  saveReply: vi.fn(),
  checkPaymentError: vi.fn(async () => ""),
}));
vi.mock("@/lib/support.server", () => ({
  ...side,
  SupportError: class SupportError extends Error {
    status = 500;
  },
}));

const reply = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));
const ok = (action: string) => reply({ success: true, action });

async function reason(p: Promise<unknown>) {
  try {
    await p;
    return "passed";
  } catch (e) {
    return e instanceof TurnstileError ? `${e.reason}:${e.status}` : "other";
  }
}

describe("Turnstile siteverify", () => {
  const opts = (fetchImpl: typeof fetch) => ({ secret: "server-secret", fetchImpl });
  it("accepts a valid token for the matching action and posts it to Siteverify", async () => {
    const f = ok(TURNSTILE_ACTIONS.pull);
    await expect(verifyTurnstile("tok", TURNSTILE_ACTIONS.pull, opts(f))).resolves.toBeUndefined();
    expect(f).toHaveBeenCalledWith(SITEVERIFY_URL, expect.objectContaining({ method: "POST" }));
  });
  it("rejects a missing token without calling Siteverify", async () => {
    const f = ok(TURNSTILE_ACTIONS.pull);
    expect(await reason(verifyTurnstile("", TURNSTILE_ACTIONS.pull, opts(f)))).toBe("missing:403");
    expect(await reason(verifyTurnstile(undefined, TURNSTILE_ACTIONS.pull, opts(f)))).toBe("missing:403");
    expect(f).not.toHaveBeenCalled();
  });
  it("rejects an invalid token", async () => {
    const f = reply({ success: false, "error-codes": ["invalid-input-response"] });
    expect(await reason(verifyTurnstile("bad", TURNSTILE_ACTIONS.pull, opts(f)))).toBe("invalid:403");
  });
  it("rejects an expired or reused token", async () => {
    const f = reply({ success: false, "error-codes": ["timeout-or-duplicate"] });
    expect(await reason(verifyTurnstile("old", TURNSTILE_ACTIONS.pull, opts(f)))).toBe("expired:403");
  });
  it("rejects a token issued for a different protected operation", async () => {
    const f = ok(TURNSTILE_ACTIONS.digest);
    expect(await reason(verifyTurnstile("tok", TURNSTILE_ACTIONS.matchup, opts(f)))).toBe("action:403");
  });
  it("fails closed when Siteverify is down, errors, or the secret is missing", async () => {
    const down = vi.fn(async () => {
      throw new Error("network");
    });
    expect(await reason(verifyTurnstile("tok", TURNSTILE_ACTIONS.pull, opts(down as never)))).toBe("unavailable:503");
    expect(await reason(verifyTurnstile("tok", TURNSTILE_ACTIONS.pull, opts(reply({}, 500))))).toBe("unavailable:503");
    const prev = process.env["TURNSTILE_SECRET_KEY"];
    delete process.env["TURNSTILE_SECRET_KEY"];
    const f = ok(TURNSTILE_ACTIONS.pull);
    expect(await reason(verifyTurnstile("tok", TURNSTILE_ACTIONS.pull, { fetchImpl: f }))).toBe("unavailable:503");
    expect(f).not.toHaveBeenCalled();
    if (prev) process.env["TURNSTILE_SECRET_KEY"] = prev;
  });
});

describe("support endpoints enforce Turnstile before side effects", () => {
  beforeEach(() => {
    process.env["TURNSTILE_SECRET_KEY"] = "server-secret";
    Object.values(side).forEach((f) => f.mockClear());
  });
  afterEach(() => vi.unstubAllGlobals());
  const contactBody = (token?: string) =>
    JSON.stringify({ name: "A", email: "a@example.com", message: "Refund?", turnstileToken: token });
  const chatBody = (token?: string) =>
    JSON.stringify({
      messages: [{ id: "1", role: "user", parts: [{ type: "text", text: "Hi" }] }],
      turnstileToken: token,
    });
  const post = async (path: "contact" | "chat", body: string) => {
    const mod = await import(`@/routes/api/public/support/${path}.ts`);
    const handler = (mod.Route.options as any).server.handlers.POST;
    return handler({ request: new Request(`https://tugg.lol/api/public/support/${path}`, { method: "POST", body }) }) as Promise<Response>;
  };
  const noEffects = () => {
    for (const f of Object.values(side)) expect(f).not.toHaveBeenCalled();
  };

  for (const path of ["contact", "chat"] as const) {
    const body = path === "contact" ? contactBody : chatBody;
    it(`${path}: missing token → 403, nothing saved, no AI`, async () => {
      vi.stubGlobal("fetch", ok(TURNSTILE_ACTIONS[path]));
      expect((await post(path, body())).status).toBe(403);
      noEffects();
    });
    it(`${path}: reused token → 403, nothing saved, no AI`, async () => {
      vi.stubGlobal("fetch", reply({ success: false, "error-codes": ["timeout-or-duplicate"] }));
      expect((await post(path, body("used"))).status).toBe(403);
      noEffects();
    });
    it(`${path}: Siteverify unavailable → 503, nothing saved, no AI`, async () => {
      vi.stubGlobal("fetch", reply({}, 502));
      expect((await post(path, body("tok"))).status).toBe(503);
      noEffects();
    });
  }
  it("contact: valid token proceeds to rate limit, save and policy answer", async () => {
    vi.stubGlobal("fetch", ok(TURNSTILE_ACTIONS.contact));
    const res = await post("contact", contactBody("tok"));
    expect(res.status).toBe(200);
    expect(side.limitSupport).toHaveBeenCalled();
    expect(side.saveMessage).toHaveBeenCalled();
    expect(side.answerFromPolicies).toHaveBeenCalled();
  });
  it("contact: a chat token cannot be reused for contact", async () => {
    vi.stubGlobal("fetch", ok(TURNSTILE_ACTIONS.chat));
    expect((await post("contact", contactBody("tok"))).status).toBe(403);
    noEffects();
  });
});

// The generator and moderation share one content policy; real people are compared on preference or merit only.
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
import { GENERATOR_INSTRUCTIONS, moderationRules } from "@/lib/content-policy";
import { moderate } from "@/lib/server-utils.server";

const GUARDRAIL = /real, named person must be about preference or merit only.*never be framed around an accusation, alleged wrongdoing, a legal matter, a death, an illness or a personal controversy/;
const EXCLUSIONS = ["No politics", "no private people", "nothing offensive", "private individuals", "political parties, politicians or candidates", "hate", "harassment", "slurs", "sexual content", "illegal content", "drugs", "scams", "doxxing", "gambling promotion", "links/URLs"];

describe("generator instructions", () => {
  it("allow famous athletes and well-known public entertainers, like moderation", () => {
    expect(GENERATOR_INSTRUCTIONS).toContain("sports teams and famous athletes");
    expect(GENERATOR_INSTRUCTIONS).toContain("well-known public entertainers");
    expect(GENERATOR_INSTRUCTIONS).not.toContain("Only brands, products, cities, sports teams, foods, franchises.");
  });
  it("still carry every exclusion", () => {
    for (const x of EXCLUSIONS) expect(GENERATOR_INSTRUCTIONS).toContain(x);
  });
  it("carry the real-person guardrail", () => expect(GENERATOR_INSTRUCTIONS).toMatch(GUARDRAIL));
});

describe("moderation rules", () => {
  it("keep every exclusion and add the real-person guardrail for matchups", () => {
    const rules = moderationRules("matchup");
    for (const x of EXCLUSIONS.slice(3)) expect(rules).toContain(x);
    expect(rules).toContain("sports teams and famous athletes");
    expect(rules).toMatch(GUARDRAIL);
  });
  it("leave shout-out rules unchanged", () => {
    expect(moderationRules("shout_out")).toContain("Allow friendly trash talk; reject anything above or personal attacks.");
  });
});

describe("moderate() sends the policy and passes the verdict through", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it("rejects an accusation-framed matchup and allows a preference-framed one", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "test-key");
    const sent: string[] = [];
    // Stand-in classifier that applies the guardrail it is given.
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      sent.push(body.instructions);
      const accused = /accus|alleged|scandal|lawsuit|trial/i.test(body.input);
      const verdict = GUARDRAIL.test(body.instructions) && accused ? { allowed: false, reason: "Framed around an accusation about a real person" } : { allowed: true, reason: "Preference between famous athletes" };
      return Response.json({ output_text: JSON.stringify(verdict) });
    }));
    const accused = await moderate("matchup", "Title: Guilty vs Innocent\nSide A: Ronaldo is guilty\nSide B: Ronaldo is innocent\nDescription: Was the accusation against him true?");
    const pick = await moderate("matchup", "Title: Messi vs Ronaldo\nSide A: Messi\nSide B: Ronaldo\nDescription: Who is the greatest footballer?");
    expect(accused.outcome).toBe("rejected");
    expect(pick.outcome).toBe("allowed");
    expect(sent.every((s) => GUARDRAIL.test(s))).toBe(true);
  });
});

// Real classifier check, run on demand (costs AI credits): LIVE_MODERATION=1 bunx vitest run src/test/content-policy.test.ts
describe.skipIf(!process.env["LIVE_MODERATION"])("live moderation", () => {
  it("rejects accusation framing about a real person and allows a preference matchup", async () => {
    const accused = await moderate("matchup", "Title: Guilty vs Innocent\nSide A: Ronaldo is guilty\nSide B: Ronaldo is innocent\nDescription: Was the accusation against him true?");
    const pick = await moderate("matchup", "Title: Messi vs Ronaldo\nSide A: Messi\nSide B: Ronaldo\nDescription: Who is the greatest footballer?");
    console.log("live verdicts", JSON.stringify({ accused, pick }));
    expect(accused.outcome).toBe("rejected");
    expect(pick.outcome).toBe("allowed");
  }, 60000);
});

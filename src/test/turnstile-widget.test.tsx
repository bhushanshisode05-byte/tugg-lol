import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { Turnstile } from "@/components/tugg/Turnstile";
import { TURNSTILE_ACTIONS } from "@/lib/turnstile";
import { PUBLIC_TURNSTILE_SITE_KEY, turnstileConfigurationError } from "@/lib/turnstile-config";

vi.mock("@/lib/turnstile.functions", () => ({ getTurnstileSiteKey: vi.fn(async () => ({ siteKey: "" })) }));

afterEach(() => {
  cleanup();
  delete window.turnstile;
  vi.unstubAllEnvs();
});

describe("shared Turnstile configuration and token safety", () => {
  for (const action of Object.values(TURNSTILE_ACTIONS)) {
    it(`uses the owner public key for ${action}`, async () => {
      const draw = vi.fn(() => "widget");
      window.turnstile = { render: draw, remove: vi.fn(), reset: vi.fn() };
      render(<Turnstile action={action} onToken={vi.fn()} />);
      await waitFor(() => expect(draw).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({
        sitekey: "0x4AAAAAAFsDBwWWCHBKJ2qf", action,
      })));
      expect(PUBLIC_TURNSTILE_SITE_KEY).toBe("0x4AAAAAAFsDBwWWCHBKJ2qf");
    });
  }

  for (const code of ["110100", "110110", "110200", "300030"]) {
    it(`revokes the token on widget error ${code}`, async () => {
      const onToken = vi.fn();
      let options: Record<string, unknown> | undefined;
      window.turnstile = { render: vi.fn((_el, opts) => { options = opts; return "widget"; }), remove: vi.fn(), reset: vi.fn() };
      render(<Turnstile action={TURNSTILE_ACTIONS.pull} onToken={onToken} />);
      await waitFor(() => expect(options).toBeDefined());
      const callback = options?.["callback"] as (token: string) => void;
      const error = options?.["error-callback"] as (code: string) => boolean;
      act(() => callback("valid-token"));
      expect(onToken).toHaveBeenLastCalledWith("valid-token");
      act(() => { error(code); });
      expect(onToken).toHaveBeenLastCalledWith(null);
    });
  }

  it("never loads or issues a token if the public key and fallback are missing", async () => {
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "");
    const draw = vi.fn(() => "widget");
    const onToken = vi.fn();
    window.turnstile = { render: draw, remove: vi.fn(), reset: vi.fn() };
    render(<Turnstile action={TURNSTILE_ACTIONS.matchup} onToken={onToken} />);
    await waitFor(() => expect(onToken).toHaveBeenCalledWith(null));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(draw).not.toHaveBeenCalled();
    expect(onToken.mock.calls.every(([token]) => token === null)).toBe(true);
  });

  it("distinguishes key and hostname errors from transient errors", () => {
    expect(turnstileConfigurationError("110100")).toBe(true);
    expect(turnstileConfigurationError("110110")).toBe(true);
    expect(turnstileConfigurationError("110200")).toBe(true);
    expect(turnstileConfigurationError("300030")).toBe(false);
  });
});
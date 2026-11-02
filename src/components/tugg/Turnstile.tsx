import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { getTurnstileSiteKey } from "@/lib/turnstile.functions";
import type { TurnstileAction } from "@/lib/turnstile";
import { PUBLIC_TURNSTILE_SITE_KEY, turnstileConfigurationError } from "@/lib/turnstile-config";
import { Button } from "@/components/ui/button";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<TurnstileApi> | null = null;
function loadScript(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SCRIPT;
      s.async = true;
      s.defer = true;
      const fail = () => {
        window.clearTimeout(timer);
        scriptPromise = null;
        s.remove();
        reject(new Error("security check unavailable"));
      };
      const timer = window.setTimeout(fail, 12000);
      s.onload = () => {
        window.clearTimeout(timer);
        if (window.turnstile) resolve(window.turnstile);
        else fail();
      };
      s.onerror = fail;
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

let siteKeyPromise: Promise<string> | null = null;
function resolveSiteKey(): Promise<string> {
  const built = (import.meta.env['VITE_TURNSTILE_SITE_KEY'] as string | undefined) ?? PUBLIC_TURNSTILE_SITE_KEY;
  if (built) return Promise.resolve(built);
  if (!siteKeyPromise)
    siteKeyPromise = getTurnstileSiteKey()
      .then((r) => r.siteKey)
      .catch(() => {
        siteKeyPromise = null;
        return "";
      });
  return siteKeyPromise;
}

export type TurnstileHandle = { reset: () => void };

type Props = {
  action: TurnstileAction;
  onToken: (token: string | null) => void;
  className?: string;
};

/** Cloudflare Turnstile widget. The token it yields is only meaningful once the server verifies it. */
export const Turnstile = forwardRef<TurnstileHandle, Props>(function Turnstile(
  { action, onToken, className },
  ref,
) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const cb = useRef(onToken);
  cb.current = onToken;
  const [state, setState] = useState<"loading" | "ready" | "error" | "config" | "host">("loading");
  const [attempt, setAttempt] = useState(0);

  useImperativeHandle(ref, () => ({
    reset: () => {
      cb.current(null);
      if (widget.current && window.turnstile) window.turnstile.reset(widget.current);
    },
  }));

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    cb.current(null);
    (async () => {
      const siteKey = await resolveSiteKey();
      if (cancelled) return;
      if (!siteKey) return setState("config");
      try {
        const api = await loadScript();
        if (cancelled || !box.current) return;
        setState("ready");
        widget.current = api.render(box.current, {
          sitekey: siteKey,
          action,
          theme: "dark",
          size: "flexible",
          "refresh-expired": "auto",
          "retry": "never",
          callback: (t: string) => {
            if (cancelled) return;
            setState("ready");
            cb.current(t);
          },
          "expired-callback": () => cb.current(null),
          "timeout-callback": () => cb.current(null),
          "error-callback": (code: string) => {
            if (cancelled) return true;
            cb.current(null);
            setState(turnstileConfigurationError(code) ? "host" : "error");
            return true;
          },
        });
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, [action, attempt]);

  return (
    <div className={className}>
      <div ref={box} className="min-h-[65px] w-full max-w-full" />
      {state === "loading" && (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          Loading security check…
        </p>
      )}
      {(state === "error" || state === "host") && (
        <p role="alert" className="text-sm text-destructive">
          {state === "host"
            ? "The security check isn’t set up for this website yet. You can keep browsing, but this form can’t be submitted right now."
            : "The security check couldn’t load. You can keep browsing; please retry before submitting."}{" "}
          <Button type="button" variant="link" className="h-auto p-0 text-destructive" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </Button>
        </p>
      )}
      {state === "config" && (
        <p role="alert" className="text-sm text-destructive">
          The security check isn’t available right now, so this can’t be submitted.
        </p>
      )}
    </div>
  );
});

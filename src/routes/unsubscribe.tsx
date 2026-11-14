import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { pageHead } from "@/lib/policies";

export const Route = createFileRoute("/unsubscribe")({
  staticData: { sitemap: false },
  head: () => ({ meta: [...pageHead("Unsubscribe from round updates", "Stop Tugg emails about rounds you pulled in. Receipts and refund notices still arrive.").meta, { name: "robots", content: "noindex,nofollow" }, { name: "referrer", content: "no-referrer" }] }),
  component: Unsubscribe,
});

type State = "checking" | "ready" | "missing" | "busy" | "done" | "invalid" | "error";
function Unsubscribe() {
  const [token, setToken] = useState("");
  const [state, setState] = useState<State>("checking");
  useEffect(() => {
    // The token travels in the URL fragment, so it never reaches server logs; drop it from the address bar.
    const t = new URLSearchParams(window.location.hash.slice(1)).get("t") ?? "";
    setToken(t); setState(t ? "ready" : "missing");
    if (window.location.hash) window.history.replaceState(window.history.state, "", window.location.pathname);
  }, []);
  async function submit() {
    setState("busy");
    try {
      const res = await fetch("/api/public/email/unsubscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ t: token }) });
      setState(res.ok ? "done" : res.status === 400 ? "invalid" : "error");
    } catch { setState("error"); }
  }
  return <main className="mx-auto max-w-md px-4 py-12">
    <h1 className="font-display text-3xl font-extrabold">Round update emails</h1>
    {state === "checking" ? <p role="status" className="mt-6 text-muted-foreground">Checking your link…</p>
      : state === "done" ? <div role="status" className="mt-6 space-y-3"><p className="font-semibold">You're unsubscribed.</p><p className="text-muted-foreground">Tugg won't send any more round updates to this address. Receipts and refund notices for purchases still arrive.</p></div>
      : state === "missing" ? <p role="alert" className="mt-6 text-muted-foreground">Open the unsubscribe link from one of our round update emails. Every one of them has it at the bottom.</p>
      : <div className="mt-6 space-y-4">
          <p className="text-muted-foreground">Stop all emails about rounds you pulled in: lead changes, closing soon and results. This takes effect immediately and is permanent for this address. Receipts and refund notices are not affected.</p>
          <Button className="min-h-12 w-full" onClick={submit} disabled={state === "busy"}>{state === "busy" ? "Unsubscribing…" : "Unsubscribe from round updates"}</Button>
          {state === "invalid" && <p role="alert" className="text-sm text-destructive">This link isn't valid. Use the link from the email itself, or contact hello@tugg.lol.</p>}
          {state === "error" && <p role="alert" className="text-sm text-destructive">That didn't go through. Please try again in a moment.</p>}
        </div>}
    <Button variant="link" className="mt-6 px-0" asChild><Link to="/">Back to Tugg</Link></Button>
  </main>;
}

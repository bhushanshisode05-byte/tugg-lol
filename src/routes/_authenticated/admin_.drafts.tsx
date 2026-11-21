import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Copy, Check, X, ImageDown, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { requestDrafts } from "@/lib/trends/drafts-access";
import { pageHead } from "@/lib/policies";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin_/drafts")({
  staticData: { sitemap: false },
  head: () => ({ meta: [...pageHead("Post drafts", "Private Tugg owner review queue for manually posted rivalry conversations.").meta, { name: "robots", content: "noindex,nofollow" }] }),
  loader: async () => {
    const { data } = await supabase.auth.getSession();
    return requestDrafts(data.session?.access_token);
  },
  errorComponent: ({ reset }) => <main className="mx-auto max-w-lg px-4 py-12"><h1 className="font-display text-3xl font-bold">Drafts unavailable</h1><Button className="mt-6" onClick={reset}>Try again</Button></main>,
  component: DraftQueue,
});

function DraftQueue() {
  const data = Route.useLoaderData(), router = useRouter();
  const [busy, setBusy] = useState<string | null>(null), [copied, setCopied] = useState<string | null>(null), [error, setError] = useState("");
  async function update(id: string, status: "posted" | "discarded") {
    setBusy(id); setError("");
    try {
      const { data } = await supabase.auth.getSession();
      await requestDrafts(data.session?.access_token, { id, status });
      await router.invalidate();
    } catch { setError("Could not update the draft. Please try again."); }
    finally { setBusy(null); }
  }
  return <main className="mx-auto max-w-2xl px-4 py-8">
    <Link to="/admin" className="text-sm text-muted-foreground">← Owner records</Link>
    <div className="mt-5 flex items-baseline justify-between gap-4"><h1 className="font-display text-3xl font-bold">Post drafts</h1><span className="font-mono text-muted-foreground">{data.drafts.length}/10</span></div>
    {data.paused && <p role="status" className="mt-4 text-destructive">Scout paused · {data.reason}</p>}
    {error && <p role="alert" className="mt-4 text-destructive">{error}</p>}
    {!data.drafts.length && <p className="py-12 text-muted-foreground">No pending drafts.</p>}
    <div className="mt-6 divide-y divide-border">{data.drafts.map(draft => <article key={draft.id} className="py-6 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="font-mono uppercase text-primary">{draft.kind.replaceAll("_", " ")}</span><span className="text-muted-foreground">Expires {new Date(draft.expires_at).toLocaleString("en-GB", { timeZone: "UTC", dateStyle: "short", timeStyle: "short" })} UTC</span></div>
      <pre className="my-4 whitespace-pre-wrap break-words border-l-2 border-primary bg-muted p-4 font-mono text-sm leading-relaxed">{draft.body}</pre>
      {draft.matchups && <Link to="/m/$slug" params={{ slug: draft.matchups.slug }} className="font-bold text-primary">{draft.matchups.title}</Link>}
      {draft.source_url && <a href={draft.source_url} target="_blank" rel="noopener noreferrer" className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><ExternalLink className="size-4" />Source post</a>}
      {draft.source_context && <p className="mt-2 break-words text-sm text-muted-foreground">{draft.source_context}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" size="icon" title="Copy post" aria-label="Copy post" onClick={async () => { try { await navigator.clipboard.writeText(draft.body); setCopied(draft.id); } catch { setError("Could not copy. Select the text and copy it manually."); } }}>{copied === draft.id ? <Check /> : <Copy />}</Button>
        <Button variant="outline" disabled={busy !== null} onClick={() => update(draft.id, "posted")}><Check />Mark posted</Button>
        <Button variant="ghost" disabled={busy !== null} onClick={() => update(draft.id, "discarded")}><X />Discard</Button>
        {draft.matchups && <Button variant="outline" size="icon" asChild><a href={`/api/public/og/m/${draft.matchups.slug}?size=story`} target="_blank" rel="noopener noreferrer" title="Open share image" aria-label="Open share image"><ImageDown /></a></Button>}
      </div>
    </article>)}</div>
  </main>;
}
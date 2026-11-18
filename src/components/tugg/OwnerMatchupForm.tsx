import { useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AI_CATEGORIES,
  DESCRIPTION_MAX,
  EMOJI_MAX,
  SIDE_NAME_MAX,
  TITLE_MAX,
  ownerMatchupSchema,
  type OwnerMatchupInput,
} from "@/lib/owner-matchup-schema";

const EMPTY: OwnerMatchupInput = { title: "", a: "", aEmoji: "", b: "", bEmoji: "", category: "Tech", description: "" };
type Outcome = { kind: "created"; slug: string; title: string } | { kind: "error"; message: string; reason?: string | undefined } | null;

/** Owner-only: add a free matchup. The server re-checks owner access, limits, duplicates and moderation. */
export function OwnerMatchupForm() {
  const router = useRouter();
  const [form, setForm] = useState<OwnerMatchupInput>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const set = (k: keyof OwnerMatchupInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const local = ownerMatchupSchema.safeParse(form);
    if (!local.success) return setOutcome({ kind: "error", message: local.error.issues[0]?.message ?? "Check the form." });
    setBusy(true);
    setOutcome(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return setOutcome({ kind: "error", message: "Please sign in again as the owner." });
      const res = await fetch("/api/public/admin/matchups", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(local.data),
        cache: "no-store",
      });
      const body = (await res.json().catch(() => ({}))) as { created?: boolean; slug?: string; title?: string; error?: string; reason?: string };
      if (res.ok && body.created && body.slug) {
        setOutcome({ kind: "created", slug: body.slug, title: body.title ?? local.data.title });
        setForm(EMPTY);
        void router.invalidate();
      } else if (res.status === 401 || res.status === 403) {
        setOutcome({ kind: "error", message: "Owner access only. Nothing was created." });
      } else {
        setOutcome({ kind: "error", message: body.error ?? "Something went wrong. Nothing was created.", reason: body.reason });
      }
    } catch {
      setOutcome({ kind: "error", message: "Could not reach Tugg. Nothing was created." });
    } finally {
      setBusy(false);
    }
  }

  const field = "space-y-1.5";
  return (
    <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2" noValidate>
      <div className={`${field} sm:col-span-2`}>
        <Label htmlFor="om-title">Title</Label>
        <Input id="om-title" value={form.title} onChange={set("title")} maxLength={TITLE_MAX} placeholder={form.a && form.b ? `${form.a} vs ${form.b}` : "Pizza vs Burgers"} required />
      </div>
      {(["a", "b"] as const).map((s) => (
        <div key={s} className="grid grid-cols-[1fr_5.5rem] gap-3">
          <div className={field}>
            <Label htmlFor={`om-${s}`}>Side {s.toUpperCase()} name</Label>
            <Input id={`om-${s}`} value={form[s]} onChange={set(s)} maxLength={SIDE_NAME_MAX} required />
          </div>
          <div className={field}>
            <Label htmlFor={`om-${s}-emoji`}>Emoji</Label>
            <Input id={`om-${s}-emoji`} value={form[`${s}Emoji`]} onChange={set(`${s}Emoji`)} maxLength={EMOJI_MAX} required />
          </div>
        </div>
      ))}
      <div className={field}>
        <Label htmlFor="om-category">Category</Label>
        <select
          id="om-category"
          value={form.category}
          onChange={set("category")}
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-base text-foreground md:text-sm"
        >
          {AI_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className={`${field} sm:col-span-2`}>
        <Label htmlFor="om-description">Short description</Label>
        <Textarea id="om-description" value={form.description} onChange={set("description")} maxLength={DESCRIPTION_MAX} rows={3} />
        <p className="text-xs text-muted-foreground">{form.description.length}/{DESCRIPTION_MAX}</p>
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={busy}>{busy ? "Checking…" : "Create matchup"}</Button>
        <p className="mt-2 text-sm text-muted-foreground">
          Free and goes live straight away with its first round open. Moderation still applies, and duplicates are refused.
        </p>
        {outcome?.kind === "created" && (
          <p className="mt-3 text-sm" role="status">
            Created <Link to="/m/$slug" params={{ slug: outcome.slug }} className="font-bold text-primary underline">{outcome.title}</Link>.
          </p>
        )}
        {outcome?.kind === "error" && (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {outcome.message}
            {outcome.reason && <><br />Reason: {outcome.reason}</>}
          </p>
        )}
      </div>
    </form>
  );
}

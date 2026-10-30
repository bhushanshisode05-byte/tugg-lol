import { Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { subscribeDigest, type Recap } from "@/lib/recap.functions";
import { Turnstile, type TurnstileHandle } from "@/components/tugg/Turnstile";
import { TURNSTILE_ACTIONS } from "@/lib/turnstile";
import { usd } from "./Rope";
import { resultImagePath } from "@/lib/og/card";

const longDate = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export function RecapView({ recap, archive }: { recap: Recap | null; archive: { day: string; summary: string }[] }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Yesterday on Tugg</p>
      {recap ? (
        <>
          <h1 className="mt-2 font-display text-4xl font-extrabold leading-tight sm:text-5xl">{recap.body.headline || "Yesterday on Tugg"}</h1>
          <p className="mt-1 text-muted-foreground">{longDate(recap.day)} · UTC</p>
          <p className="mt-6 rounded-xl border border-border bg-card p-4 leading-relaxed" data-summary>
            <strong>Summary ({recap.day}):</strong> {recap.summary}
          </p>
          <div className="mt-6 space-y-4 text-lg leading-relaxed">
            {(recap.body.paragraphs ?? []).map((p, i) => <p key={i}>{p}</p>)}
          </div>
          <Facts recap={recap} />
        </>
      ) : (
        <>
          <h1 className="mt-2 font-display text-4xl font-extrabold">No recap yet</h1>
          <p className="mt-3 text-muted-foreground">The first recap appears shortly after the next 00:00 UTC round close.</p>
        </>
      )}
      <DigestForm />
      {archive.length > 0 && (
        <section className="mt-12">
          <h2 className="font-display text-2xl font-extrabold">Archive</h2>
          <ul className="mt-3 divide-y divide-border">
            {archive.map((a) => (
              <li key={a.day} className="py-3">
                <Link to="/recap/$date" params={{ date: a.day }} className="font-bold underline">{longDate(a.day)}</Link>
                <p className="text-sm text-muted-foreground">{a.summary}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

function Facts({ recap }: { recap: Recap }) {
  const f = recap.facts;
  const active = (f.rounds ?? []).filter((r) => r.a_cents + r.b_cents > 0).sort((x, y) => y.a_cents + y.b_cents - (x.a_cents + x.b_cents));
  if (!f.pulls) return null;
  const cards = active.filter((r) => r.winner && recap.resultIds?.[r.slug]).slice(0, 6);
  return (
    <>
    {cards.length > 0 && (
      <section className="mt-8">
        <h2 className="mb-3 font-display text-2xl font-extrabold">Result cards</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {cards.map((r) => (
            <Link key={r.slug} to="/results/$id" params={{ id: recap.resultIds![r.slug]! }} className="block overflow-hidden rounded-xl border border-border">
              <img src={resultImagePath(recap.resultIds![r.slug]!, "link")} width={1200} height={630} loading="lazy" className="block aspect-[1200/630] w-full"
                alt={`${r.winner} won ${r.title}: ${r.a} ${usd(r.a_cents)}, ${r.b} ${usd(r.b_cents)}`} />
            </Link>
          ))}
        </div>
      </section>
    )}
    <div className="mt-8 grid gap-6 md:grid-cols-2">
      <section className="rounded-xl border border-border p-4">
        <h2 className="mb-2 font-bold">Results</h2>
        <ul className="space-y-2 text-sm">
          {active.slice(0, 10).map((r) => (
            <li key={r.slug}>
              <Link to="/m/$slug" params={{ slug: r.slug }} className="font-bold underline">{r.title}</Link>
              <span className="block text-muted-foreground">
                {r.a} {usd(r.a_cents)} · {r.b} {usd(r.b_cents)}{r.winner ? ` — ${r.winner} won` : ""}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-xl border border-border p-4">
        <h2 className="mb-2 font-bold">Countries</h2>
        {f.countries.length ? (
          <ul className="space-y-1 text-sm">
            {f.countries.map((c) => (
              <li key={c.country} className="flex justify-between"><span>{c.country}</span><span className="font-mono">{c.pulls} pull{c.pulls === 1 ? "" : "s"}</span></li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted-foreground">No country data.</p>}
      </section>
    </div>
  );
}

function DigestForm() {
  const subscribe = useServerFn(subscribeDigest);
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const ts = useRef<TurnstileHandle>(null);
  return (
    <form
      className="mt-10 rounded-2xl border-2 border-foreground bg-card p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!token) return setMsg("Please complete the security check.");
        setBusy(true);
        try {
          const r = await subscribe({ data: { email, turnstileToken: token } });
          setMsg(r.message);
          if (r.ok) setEmail("");
        } catch {
          setMsg("Please enter a valid email address.");
        } finally {
          ts.current?.reset();
          setBusy(false);
        }
      }}
    >
      <h2 className="font-display text-xl font-extrabold">Get the daily digest</h2>
      <p className="text-sm text-muted-foreground">One short email a day with yesterday's results. Unsubscribe anytime.</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" aria-label="Email address" className="flex-1 rounded-full border border-input bg-background px-4 py-2" />
        <button disabled={busy || !token} className="rounded-full bg-primary px-5 py-2 font-bold text-primary-foreground disabled:opacity-60">{busy ? "Saving…" : "Subscribe"}</button>
      </div>
      <Turnstile ref={ts} action={TURNSTILE_ACTIONS.digest} onToken={setToken} className="mt-3" />
      {msg && <p className="mt-2 text-sm" role="status">{msg}</p>}
    </form>
  );
}

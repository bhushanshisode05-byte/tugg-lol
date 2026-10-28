import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getMatchup, createPullCheckout, type Side } from "@/lib/tugg.functions";
import { Shell } from "@/components/tugg/Shell";
import { Rope, usd } from "@/components/tugg/Rope";
import { Countdown } from "@/components/tugg/Countdown";
import { EmbeddedPay } from "@/components/tugg/EmbeddedPay";
import { useLive } from "@/hooks/use-live";
import { getStripeEnvironment } from "@/lib/stripe";

const mq = (slug: string) => queryOptions({ queryKey: ["matchup", slug], queryFn: () => getMatchup({ data: { slug } }) });

export const Route = createFileRoute("/m/$slug")({
  validateSearch: (s: Record<string, unknown>): { paid?: string | undefined } => ({
    paid: typeof s["paid"] === "string" ? s["paid"] : undefined,
  }),
  loader: async ({ context, params }) => {
    const d = await context.queryClient.ensureQueryData(mq(params.slug));
    if (!d) throw notFound();
    return { title: d.matchup.title, a: d.matchup.sides[0]?.name, b: d.matchup.sides[1]?.name };
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.title} — who's winning today? | Tugg` },
          { name: "description", content: `Live rope: ${loaderData.a} vs ${loaderData.b}. See today's totals, win streaks and pull for your side on Tugg.` },
          { property: "og:title", content: `${loaderData.title} on Tugg` },
          { property: "og:description", content: `Pull the rope for ${loaderData.a} or ${loaderData.b}. Rounds end at 00:00 UTC.` },
          { property: "og:type", content: "website" },
          { name: "twitter:card", content: "summary_large_image" },
        ]
      : [{ title: "Matchup unavailable | Tugg" }, { name: "robots", content: "noindex" }],
  }),
  notFoundComponent: () => (
    <Shell>
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <h1 className="font-display text-4xl font-extrabold">No rope here.</h1>
        <Link to="/" className="mt-4 inline-block text-primary underline">Back to all matchups</Link>
      </div>
    </Shell>
  ),
  component: MatchupPage,
});

function MatchupPage() {
  const { slug } = Route.useParams();
  const { paid } = Route.useSearch();
  const { data } = useSuspenseQuery(mq(slug));
  const qc = useQueryClient();
  useLive(() => qc.invalidateQueries({ queryKey: ["matchup", slug] }), data?.matchup.id);
  const [celebrate, setCelebrate] = useState(false);

  useEffect(() => {
    if (!paid) return;
    setCelebrate(true);
    import("canvas-confetti").then(({ default: confetti }) => confetti({ particleCount: 160, spread: 90, origin: { y: 0.4 } }));
    // webhook may land a moment later
    const t = setTimeout(() => qc.invalidateQueries({ queryKey: ["matchup", slug] }), 2500);
    return () => clearTimeout(t);
  }, [paid, qc, slug]);

  if (!data) return null;
  const { matchup: m, top, recent, countries, history } = data;
  const A = m.sides[0]!, B = m.sides[1]!;
  const a = m.round?.total_a_cents ?? 0, b = m.round?.total_b_cents ?? 0;
  const winsA = history.filter((h) => h.winner_side_id === A.id).length;
  const winsB = history.filter((h) => h.winner_side_id === B.id).length;
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  const lead = a === b ? null : a > b ? [A, B, a, b] as const : [B, A, b, a] as const;
  const sideById = new Map(m.sides.map((s) => [s.id, s]));
  const shareText = `I just pulled the rope in ${m.title} on Tugg. Pick your side 👉`;

  return (
    <Shell>
      <article className="mx-auto max-w-5xl px-4 py-8">
        <p className="mb-4 rounded-xl border border-border bg-card p-4 text-sm leading-relaxed text-muted-foreground" data-summary>
          As of {today} (UTC),{" "}
          {lead
            ? <><strong className="text-foreground">{lead[0].name}</strong> leads {lead[1].name} {usd(lead[2])} to {usd(lead[3])} in today's round.</>
            : a === 0 ? <>{A.name} and {B.name} are tied at $0 in today's round.</> : <>{A.name} and {B.name} are tied at {usd(a)} in today's round.</>}{" "}
          {history.length > 0
            ? <>{A.name} has won {winsA} and {B.name} has won {winsB} of the last {history.length} rounds.</>
            : <>No rounds have been completed yet.</>}{" "}
          All-time: {A.name} {usd(A.all_time_cents)}, {B.name} {usd(B.all_time_cents)}.
        </p>

        {celebrate && (
          <div className="mb-6 rounded-2xl border-2 border-primary bg-primary/10 p-4">
            <p className="font-display text-2xl font-extrabold">You pulled! 🎉</p>
            <p className="text-sm text-muted-foreground">Your pull shows up on the rope as soon as the payment is confirmed (a few seconds).</p>
            <ShareButtons text={shareText} slug={m.slug} />
          </div>
        )}

        <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-muted-foreground">
          <span>{m.category}{m.source === "ai" ? " · Added by Tugg" : ""}</span>
          {m.round && (
            <span>
              Round ends <Countdown to={m.round.ends_at} />
              {m.round.extensions > 0 && <span className="ml-2 text-accent">+{m.round.extensions * 10}m final hour</span>}
            </span>
          )}
        </div>
        <h1 className="mt-2 font-display text-4xl font-extrabold leading-none sm:text-6xl">{m.title}</h1>
        {m.description && <p className="mt-2 text-muted-foreground">{m.description}</p>}

        <div className="mt-8">
          <Rope sides={m.sides} a={a} b={b} />
          <div className="mt-2 grid grid-cols-3 items-end">
            <SideTotal side={A} cents={a} />
            <p className="text-center text-sm text-muted-foreground">{m.round?.pullers ?? 0} pullers</p>
            <SideTotal side={B} cents={b} right />
          </div>
        </div>

        {m.status === "active" ? <PullPanel sides={m.sides} slug={m.slug} paused={data.paused} /> : (
          <p className="mt-8 rounded-xl border border-border p-4 text-muted-foreground">This matchup is retired and no longer takes pulls.</p>
        )}

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {m.sides.map((s) => (
            <Panel key={s.id} title={`Top pullers · ${s.emoji} ${s.name}`}>
              {top[s.id]?.length ? (
                <ol className="space-y-1">
                  {(top[s.id] ?? []).map((t, i) => (
                    <li key={t.name} className="flex justify-between"><span>{i + 1}. {t.name}</span><span className="font-mono">{usd(t.cents)}</span></li>
                  ))}
                </ol>
              ) : <Empty />}
              <p className="mt-3 text-xs text-muted-foreground">Streak {s.current_streak} · Best {s.best_streak} · Wins {s.wins}</p>
            </Panel>
          ))}
          <Panel title="Shout-outs">
            {recent.filter((p) => p.shout_out).length ? (
              <ul className="space-y-2">
                {recent.filter((p) => p.shout_out).slice(0, 8).map((p) => (
                  <li key={p.id}>
                    <span className="font-bold">{p.display_name || "Anonymous"}</span>{" "}
                    <span className="text-muted-foreground">for {sideById.get(p.side_id)?.name}:</span> {p.shout_out}
                  </li>
                ))}
              </ul>
            ) : <Empty />}
          </Panel>
          <Panel title="Countries">
            {countries.length ? (
              <ul className="space-y-1">
                {countries.map((c) => (
                  <li key={c.country} className="flex justify-between"><span>{c.country}</span><span className="font-mono">{usd(c.cents)}</span></li>
                ))}
              </ul>
            ) : <Empty />}
          </Panel>
          <Panel title="Round history">
            {history.length ? (
              <ul className="space-y-1 text-sm">
                {history.slice(0, 10).map((h) => (
                  <li key={h.id} className="flex justify-between">
                    <span>{new Date(h.ends_at).toISOString().slice(0, 10)}</span>
                    <span>{h.winner_side_id ? `${sideById.get(h.winner_side_id)?.name} won${h.result_note === "tie" ? " (tie)" : ""}` : "No pulls"}</span>
                    <span className="font-mono">{usd(h.total_a_cents)}–{usd(h.total_b_cents)}</span>
                  </li>
                ))}
              </ul>
            ) : <Empty text="First round in progress." />}
          </Panel>
          <Panel title="All-time">
            {m.sides.map((s) => (
              <p key={s.id} className="flex justify-between"><span>{s.emoji} {s.name}</span><span className="font-mono">{usd(s.all_time_cents)}</span></p>
            ))}
          </Panel>
        </div>
      </article>
    </Shell>
  );
}

function SideTotal({ side, cents, right }: { side: Side; cents: number; right?: boolean }) {
  return (
    <div className={right ? "text-right" : ""}>
      <p className="text-sm font-bold" style={{ color: side.color }}>{side.name}</p>
      <p className="font-mono text-3xl font-extrabold sm:text-4xl">{usd(cents)}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}
const Empty = ({ text = "Nothing yet." }: { text?: string }) => <p className="text-sm text-muted-foreground">{text}</p>;

function ShareButtons({ text, slug }: { text: string; slug: string }) {
  const url = typeof window !== "undefined" ? `${window.location.origin}/m/${slug}` : "";
  const enc = encodeURIComponent;
  return (
    <div className="mt-3 flex flex-wrap gap-2 text-sm font-bold">
      <a className="rounded-full border border-border px-4 py-1.5" target="_blank" rel="noopener noreferrer" href={`https://x.com/intent/post?text=${enc(text)}&url=${enc(url)}`}>Share on X</a>
      <a className="rounded-full border border-border px-4 py-1.5" target="_blank" rel="noopener noreferrer" href={`https://bsky.app/intent/compose?text=${enc(`${text} ${url}`)}`}>Bluesky</a>
      <button className="rounded-full border border-border px-4 py-1.5" onClick={() => navigator.clipboard.writeText(`${text} ${url}`)}>Copy link</button>
    </div>
  );
}

const PRESETS = [1, 5, 10, 25, 100];

function PullPanel({ sides, slug, paused }: { sides: Side[]; slug: string; paused: boolean }) {
  const [side, setSide] = useState<string>(sides[0]!.id);
  const [amount, setAmount] = useState(5);
  const [name, setName] = useState("");
  const [shout, setShout] = useState("");
  const [checkout, setCheckout] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const valid = Number.isInteger(amount) && amount >= 1 && amount <= 1000;

  if (paused) return <p className="mt-8 rounded-xl border border-border p-4 text-muted-foreground">Pulls are paused for a moment. Check back soon.</p>;

  if (checkout) {
    return (
      <div className="mt-8">
        <button onClick={() => setCheckout(false)} className="mb-3 text-sm text-muted-foreground underline">← Change pull</button>
        <EmbeddedPay
          fetchClientSecret={async () => {
            const r = await createPullCheckout({
              data: {
                sideId: side, amount, name: name || undefined, shout: shout || undefined,
                returnUrl: `${window.location.origin}/m/${slug}?paid={CHECKOUT_SESSION_ID}`,
                environment: getStripeEnvironment(),
              },
            });
            if ("error" in r) { setErr(r.error); setCheckout(false); throw new Error(r.error); }
            return r.clientSecret;
          }}
        />
      </div>
    );
  }

  return (
    <section className="mt-8 rounded-2xl border-2 border-foreground bg-card p-5 shadow-pop sm:p-6">
      <h2 className="font-display text-2xl font-extrabold">Pull the rope</h2>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {sides.map((s) => (
          <button
            key={s.id}
            onClick={() => setSide(s.id)}
            aria-pressed={side === s.id}
            className={`rounded-xl border-2 p-4 text-left font-extrabold transition-transform ${side === s.id ? "-translate-y-0.5 border-primary bg-primary text-primary-foreground" : "border-border"}`}
          >
            <span className="text-2xl">{s.emoji}</span> {s.name}
          </button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button key={p} onClick={() => setAmount(p)} className={`rounded-full border px-4 py-2 font-mono font-bold ${amount === p ? "border-accent bg-accent text-accent-foreground" : "border-border"}`}>${p}</button>
        ))}
        <label className="flex items-center gap-1 rounded-full border border-border px-3">
          <span className="font-mono">$</span>
          <input
            type="number" min={1} max={1000} step={1} value={amount}
            onChange={(e) => setAmount(Math.floor(Number(e.target.value)))}
            aria-label="Custom amount in dollars"
            className="w-20 bg-transparent py-2 font-mono outline-none"
          />
        </label>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <input value={name} onChange={(e) => setName(e.target.value.slice(0, 40))} placeholder="Display name (optional)" className="rounded-xl border border-input bg-background px-4 py-3" />
        <input value={shout} onChange={(e) => setShout(e.target.value.slice(0, 80))} placeholder="Shout-out, 80 chars (optional)" className="rounded-xl border border-input bg-background px-4 py-3" />
      </div>
      {err && <p className="mt-3 text-sm text-destructive">{err}</p>}
      <button
        disabled={!valid}
        onClick={() => { setErr(null); setCheckout(true); }}
        className="mt-5 w-full rounded-full bg-primary py-4 font-display text-xl font-extrabold text-primary-foreground shadow-pop transition-transform hover:-translate-y-0.5 disabled:opacity-50"
      >
        Pull ${valid ? amount : "–"} for {sides.find((s) => s.id === side)?.name}
      </button>
      <p className="mt-3 text-xs text-muted-foreground">Non-refundable entertainment purchase. No prizes or payouts. Sales tax may be added at checkout.</p>
    </section>
  );
}

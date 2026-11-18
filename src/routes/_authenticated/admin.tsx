import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { pageHead } from "@/lib/policies";
import { loadOwnerRecords } from "@/lib/admin-access";
import { Button } from "@/components/ui/button";
import { OwnerMatchupForm } from "@/components/tugg/OwnerMatchupForm";
import { OwnerRevenue, grossLabel } from "@/components/tugg/OwnerRevenue";
type AdminData = {
  summary: {
    pullRevenue: { environment: string; cents: string; pulls: number }[];
    sources: { source: string; count: number }[];
  };
  provider: string;
  dodoOrders: Record<string, unknown>[];
  dodo: { environments: { environment: string; baskets_sold?: number; basket_refund_cents?: number; basket_reviews?: number; revenue_cents: number; bundles_sold: number; pulls_applied: number; refunds: number; refund_reviews: number; pending: number; expired: number; reconcile_checks: number; reconciled_paid: number; reconciled_expired: number }[] };
  payglocal: { environments: { environment: string; revenue_cents: number; bundles_sold: number; pulls_applied: number; refunds: number; refund_reviews: number; pending: number; expired: number; reconcile_checks: number; reconciled_paid: number; reconciled_expired: number }[] };
  funnel: { days: number; environment: string; step: string; count: number }[];
  payglocalOrders: Record<string, unknown>[];
  flaggedWallets: Record<string, unknown>[];
  creationRevenue: { live: number; sandbox: number };
  pulls: Record<string, unknown>[];
  matchups: Record<string, unknown>[];
  moderation: Record<string, unknown>[];
  events: Record<string, unknown>[];
  support: Record<string, unknown>[];
};
export const Route = createFileRoute("/_authenticated/admin")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      ...pageHead("Owner records", "Private Tugg owner records.").meta,
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  loader: async () => {
    const { data } = await supabase.auth.getSession();
    return loadOwnerRecords<AdminData>(data.session?.access_token);
  },
  errorComponent: ({ reset }) => {
    const router = useRouter();
    return <main className="mx-auto max-w-md px-4 py-16">
      <h1 className="font-display text-3xl font-extrabold">Owner records unavailable</h1>
      <p className="mt-4 text-muted-foreground">Your records could not be loaded. Please try again.</p>
      <div className="mt-6 flex gap-3">
        <Button onClick={async () => { await router.invalidate(); reset(); }}>Try again</Button>
        <Button variant="outline" asChild><Link to="/auth">Owner sign in</Link></Button>
      </div>
    </main>;
  },
  notFoundComponent: () => <main className="mx-auto max-w-md px-4 py-16"><h1 className="font-display text-3xl font-extrabold">Owner records not found</h1><Button className="mt-6" asChild><Link to="/auth">Owner sign in</Link></Button></main>,
  component: Admin,
});
function Admin() {
  const data = Route.useLoaderData();
  const notes: Record<string, string> = {
    [data.provider === "dodo" ? "Dodo payments" : "PayGlocal payments"]: `expected cents is the order price in US cents. An order is marked paid only when the provider's charged total matches it, so on paid rows it is the amount actually charged. ${grossLabel(data.provider)}`,
    Pulls: `amount cents is what the buyer paid for that pull ($1 per pull), in US cents. ${grossLabel(data.provider)}`,
  };
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <p className="font-mono text-sm text-primary">TUGG / OWNER</p>
      <h1 className="mt-3 font-display text-4xl font-extrabold">Owner records</h1>
      <section className="mt-8 border-y border-border py-6">
        <h2 className="text-2xl font-bold">Add a matchup</h2>
        <OwnerMatchupForm />
      </section>
      <OwnerRevenue provider={data.provider} dodo={data.dodo} payglocal={data.payglocal} creationRevenue={data.creationRevenue} />
      <section className="border-b border-border py-6">
        <h2 className="text-2xl font-bold">Pull payment funnel</h2>
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          {[7,30].flatMap(days=>["sandbox","live"].map(environment=>{
            const steps=["viewed","bundle_selected","turnstile_passed","opened","completed"];
            const count=(step:string)=>Number(data.funnel.find(r=>r.days===days&&r.environment===environment&&r.step===step)?.count??0);
            return <div key={`${days}-${environment}`}><h3 className="font-bold">Last {days} days · {environment==="live"?"Live":"Test"}</h3>
              <table className="mt-2 w-full text-left text-sm"><thead><tr><th>Step</th><th>Visits</th><th>From prior step</th></tr></thead><tbody>
                {steps.map((step,i)=><tr key={step}><td className="py-2">{step.replaceAll("_"," ")}</td><td>{count(step)}</td><td>{i===0?"—":count(steps[i-1]??"")?`${(100*count(step)/count(steps[i-1]??"")).toFixed(1)}%`:"—"}</td></tr>)}
              </tbody></table><p className="mt-2 text-sm text-muted-foreground">Cancelled: {count("cancelled")} · Abandoned: {count("abandoned")} · Failed: {count("failed")}</p>
            </div>;
          }))}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">Anonymous panel visits, deduplicated per step. Completion comes only from confirmed server payments. Browser reports may be blocked; percentages are observed step ratios, not a matched cohort.</p>
      </section>
      <section className="py-6">
        <h2 className="text-2xl font-bold">Matchups by source</h2>
        <div className="mt-3 flex gap-8">
          {["seed", "user", "ai", "owner"].map((s) => (
            <p key={s}>
              {s}: {data.summary.sources.find((r) => r.source === s)?.count ?? 0}
            </p>
          ))}
        </div>
      </section>
      {(
        [
          [data.provider === "dodo" ? "Dodo payments" : "PayGlocal payments", data.provider === "dodo" ? data.dodoOrders : data.payglocalOrders],
          ["Dormant Dodo flagged wallets", data.flaggedWallets],
          ["Pulls", data.pulls],
          ["Matchups", data.matchups],
          ["Moderation log", data.moderation],
          ["Errors / events", data.events],
          ["Support threads", data.support],
        ] as const
      ).map(([title, rows]) => (
        <section key={title} className="border-t border-border py-6">
          <h2 className="text-2xl font-bold">{title}</h2>
          <p className="my-2 text-sm text-muted-foreground">Latest 200 records</p>
          {notes[title] && <p className="my-2 text-sm">{notes[title]}</p>}
          {!rows.length ? (
            <p className="text-muted-foreground">No records.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    {Object.keys(rows[0] ?? {})
                      .filter((k) => k !== "id")
                      .map((k) => (
                        <th className="border-b border-border p-3" key={k}>
                          {k.replaceAll("_", " ")}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={String(row["id"] ?? i)}>
                      {Object.entries(row)
                        .filter(([k]) => k !== "id")
                        .map(([k, v]) => (
                          <td
                            className="max-w-md whitespace-pre-wrap break-words border-b border-border p-3 align-top"
                            key={k}
                          >
                            {typeof v === "object" ? JSON.stringify(v) : String(v ?? "—")}
                          </td>
                        ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </main>
  );
}

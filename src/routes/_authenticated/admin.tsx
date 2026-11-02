import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { pageHead } from "@/lib/policies";
type AdminData = {
  summary: {
    pullRevenue: { environment: string; cents: string; pulls: number }[];
    sources: { source: string; count: number }[];
  };
  dodo: {
    environments: {
      environment: string;
      revenue_cents: number;
      packs_sold: number;
      pulls_sold: number;
      pulls_used: number;
      refunds: number;
      flagged_wallets: number;
    }[];
  };
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
    const response = await fetch("/api/public/admin/data", {
      headers: { Authorization: `Bearer ${data.session?.access_token || ""}` },
    });
    if (!response.ok) {
      const body = await response.json();
      throw new Error(body.error);
    }
    return response.json() as Promise<AdminData>;
  },
  component: Admin,
});
function Admin() {
  const data = Route.useLoaderData();
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <p className="font-mono text-sm text-primary">TUGG / OWNER</p>
      <h1 className="mt-3 font-display text-4xl font-extrabold">Read-only records</h1>
      <section className="mt-8 border-y border-border py-6">
        <h2 className="text-2xl font-bold">Revenue</h2>
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          {(["live", "sandbox"] as const).map((env) => {
            const pg = data.payglocal.environments.find((r) => r.environment === env);
            const dodo = data.dodo.environments.find((r) => r.environment === env);
            return (
              <div key={env}>
                <h3 className="font-bold">{env === "live" ? "Live money" : "Test money"}</h3>
                <p className="mt-2 font-mono text-3xl">
                  ${(Number(pg?.revenue_cents ?? 0) / 100).toFixed(2)}
                </p>
                <p className="text-muted-foreground">
                  PayGlocal bundles: {pg?.bundles_sold ?? 0} · Pulls applied: {pg?.pulls_applied ?? 0}<br/>
                  Refund requests: {pg?.refunds ?? 0} · Refund reviews: {pg?.refund_reviews ?? 0}<br/>
                  Pending: {pg?.pending ?? 0} · Expired: {pg?.expired ?? 0}<br/>
                  Reconcile checks: {pg?.reconcile_checks ?? 0} · Paid: {pg?.reconciled_paid ?? 0} · Expired: {pg?.reconciled_expired ?? 0}<br/>
                  Dormant Dodo packs: {dodo?.packs_sold ?? 0} · Pulls sold: {dodo?.pulls_sold ?? 0} · Pulls
                  used: {dodo?.pulls_used ?? 0}
                  <br />
                  Refunds: {dodo?.refunds ?? 0} · Flagged wallets: {dodo?.flagged_wallets ?? 0}
                </p>
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          PayGlocal confirmed purchase revenue, before refunds and fees; not settlement balances.
          Historical purchases remain in the records below.
        </p>
      </section>
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
          {["seed", "user", "ai"].map((s) => (
            <p key={s}>
              {s}: {data.summary.sources.find((r) => r.source === s)?.count ?? 0}
            </p>
          ))}
        </div>
      </section>
      {(
        [
          ["PayGlocal payments", data.payglocalOrders],
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

<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Tugg architecture
- Round/pull integrity lives in SQL functions (record_pull, close_round, close_due_rounds) callable only by service role; the payment webhook is the only writer of pulls, so amounts always come from the verified payment.
- Public pages read through publishable-key server functions in src/lib/tugg.functions.ts so SSR serves full HTML to crawlers.
- Env switches (SITE_URL, PAUSE_PULLS, TEST_MODE, AI_GENERATOR_ENABLED) are read only via config() in src/lib/server-utils.server.ts.
- Stripe environment comes only from server-side PAYMENTS_ENV via config(); browser hints are never trusted, and live mode ignores sandbox webhooks. Why: test payments must never move real ropes.
- Public pull data is served only through SECURITY DEFINER tugg_* SQL functions (aggregates, live-only filter); the pulls table has no anon/authenticated access. Why: hides stripe_session_id and keeps totals exact past row limits.
- Realtime listens to rounds only; every recorded pull updates its round row. Why: pulls aren't publicly readable.

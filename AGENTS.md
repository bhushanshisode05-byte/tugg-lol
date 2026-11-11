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
- Email auth verifies Turnstile and keyed limits server-side; recovery uses one-use tokens. Why: protect auth side effects.
- Subdirectories have their own AGENTS.md; read src/lib/payments/AGENTS.md before any payment-related change, including callers and schema. Why: payment integrity rules stay with their domain.
- Round/pull integrity lives in SQL functions (record_pull, close_round, close_due_rounds) callable only by service role; wallet spending calls record_pull within the same locked SQL transaction as the debit; credits come only from verified provider payments. Why: no overdraw or unpaid pulls.
- Public pages read through publishable-key server functions in src/lib/tugg.functions.ts so SSR serves full HTML to crawlers.
- All environment switches and payment credentials are read only via config() in src/lib/server-utils.server.ts. Why: request-time server configuration never enters browser bundles.
- The fetch-based PaymentProvider interface defaults to Dodo with PayGlocal retained behind the selector; immediate mode is forced and wallet APIs reject unconditionally. Why: provider rollback must never restore stored balances or mix environments.
- Public pull data is served only through SECURITY DEFINER tugg_* SQL functions (aggregates, live-only filter); the pulls table has no anon/authenticated access. Why: hides stripe_session_id and keeps totals exact past row limits.
- Realtime listens to rounds only; every recorded pull updates its round row. Why: pulls aren't publicly readable.
- Matchup checkout is rate-limited per hashed IP via the service-only take_checkout_slot SQL function. Why: atomic count+insert without storing raw IPs.
- Legal pages and AI support share one policy catalog; AI selects an approved answer ID rather than generating advice. Why: prevents invented policies and refund promises.
- Support messages and replies are archived through service-only access; abuse counters reuse the atomic hashed-IP limiter in separate support namespaces. Why: keeps personal messages private and limits AI spending.
- Admin handlers verify token, configured owner email, confirmed identity and unique owner role before private reads; loaders redirect 401/403 to owner sign-in. Why: denial is navigation, not a crash; APIs stay authoritative.
- Daily jobs (recap, AI generator) run through the managed-schedule route /api/public/jobs/daily and lock once per UTC day in job_runs; AI 402/403 pauses them in job_state. Why: no duplicate runs or runaway AI spend.
- Recap summaries are built in code from stored facts; AI only writes prose from those facts. Why: numbers can never be invented.
- Turnstile tokens are verified server-side (src/lib/turnstile.server.ts) with a per-operation action before any side effect, failing closed; all widgets share public src/lib/turnstile-config.ts, optionally overridden by VITE_TURNSTILE_SITE_KEY, with an existing server-function fallback for empty configuration. Why: widget alone is not protection and public keys are not secrets.
- Share images are rendered server-side in pure JS (src/lib/og) at /api/public/og/*; live/result URLs carry a cardVersion token of exactly what is drawn and are immutable only when it matches, while pull cards are permanent snapshots from totals stored at insert. Why: the edge runtime has no native image libraries, and URL-keyed caches must never show an old score.
- Native sharing uses a synchronous tap-time call with a visibility-preloaded story Blob; clipboard runs without blocking the sheet, unsupported files use text-only sharing, and errors use the shared download fallback. Why: preserve user activation and avoid app-specific menus while logging only safe error names.
- SEO surfaces (sitemap via route staticData.sitemap, /feeds/*, llms.txt, IndexNow after the daily recap) read only public data. Why: crawlers must never see private fields.

- Optional side images use metadata-free browser WebP, a full bounded pure-JS server decode and PNG derivative; upload/report records are service-only, and nullable side references preserve old code compatibility. Why: untrusted images must never bypass moderation or break emoji-only rows.
- Side image files stay in private storage and only approved active/retired side references are served by a public route. Why: workspace policy blocks public buckets and pending or hidden pictures must not be exposed.
- Image reports count distinct hashed networks atomically and never restore a hidden image during concurrent AI re-checks. Why: unauthenticated visitors have no provable person identity.
- Optional side-picture entry points, display, moderation, cleanup and renderer use the shared SIDE_IMAGES_ENABLED gate. Why: unfinished pictures must remain dormant without deleting rollback-safe schema.

- Managed payment reconciliation checks overdue orders in bounded batches; expired/failed payments cannot become paid, and uncertain refunds are claimed once and left for owner review. Why: abandoned browser flows need recovery without blind refund retries.

- Optional CodeDrop loads on payment intent with environment-scoped ID and exact script hosts; browser callbacks only prompt stored-state reads. Why: drawer UX must not become payment authority or mix environments.
- Payment funnel uses catalogued runtime events plus service-only app aggregates for the owner view, with completion from the order terminal trigger. Why: internal analytics has no supported app query API and browser claims cannot prove payment.
- Reconciliation eligibility and expiry live in a service-only SQL RPC with bounded age backoff; empty results return before provider setup. Why: avoid repeated checks, stale polling and idle provider costs.
- Router-generated per-request nonce constrains production script loading without unsafe script execution, preserving existing stricter policies; development is report-only. Why: CodeDrop must not require wildcard script permissions.
- App email observes committed outcomes through app-email.server, with atomic existing-events claims and bounded attempts; delivery retries/suppression/unsubscribe stay managed, no app queue/tables. Weekly facts are SQL aggregates; public contact is separate from admin login. Why: email must not affect fulfillment or expose private data.

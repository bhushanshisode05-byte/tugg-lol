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
- Round/pull integrity lives in SQL functions (record_pull, close_round, close_due_rounds) callable only by service role; wallet spending calls record_pull within the same locked SQL transaction as the debit; credits come only from verified provider payments. Why: no overdraw or unpaid pulls.
- Public pages read through publishable-key server functions in src/lib/tugg.functions.ts so SSR serves full HTML to crawlers.
- All environment switches and PayGlocal credentials are read only via config() in src/lib/server-utils.server.ts. Why: request-time server configuration never enters browser bundles.
- The fetch-based PaymentProvider interface selects PayGlocal or dormant Dodo server-side; PAYMENTS_ENV alone selects credentials and hosts, and mode gates reject dormant wallet endpoints. Why: provider rollback must not mix environments or unpaid fulfillment.
- Public pull data is served only through SECURITY DEFINER tugg_* SQL functions (aggregates, live-only filter); the pulls table has no anon/authenticated access. Why: hides stripe_session_id and keeps totals exact past row limits.
- Realtime listens to rounds only; every recorded pull updates its round row. Why: pulls aren't publicly readable.
- Matchup checkout is rate-limited per hashed IP via the service-only take_checkout_slot SQL function. Why: atomic count+insert without storing raw IPs.
- Legal pages and AI support share one policy catalog; AI selects an approved answer ID rather than generating advice. Why: prevents invented policies and refund promises.
- Support messages and replies are archived through service-only access; abuse counters reuse the atomic hashed-IP limiter in separate support namespaces. Why: keeps personal messages private and limits AI spending.
- Admin handlers revalidate the token, configured owner email, confirmed identity and unique owner role before privileged reads. Why: hidden routes are not authorization.
- Daily jobs (recap, AI generator) run through the managed-schedule route /api/public/jobs/daily and lock once per UTC day in job_runs; AI 402/403 pauses them in job_state. Why: no duplicate runs or runaway AI spend.
- Recap summaries are built in code from stored facts; AI only writes prose from those facts. Why: numbers can never be invented.
- Turnstile tokens are verified server-side (src/lib/turnstile.server.ts) with a per-operation action before any side effect, failing closed; the site key reaches the browser from VITE_TURNSTILE_SITE_KEY at build or a server-function fallback. Why: widget alone is not protection.
- Share images are rendered server-side in pure JS (src/lib/og: opentype paths + custom PNG raster) at /api/public/og/*, with short cache. Why: the edge runtime has no native image libraries.
- Native sharing uses a synchronous tap-time call with a visibility-preloaded story Blob; clipboard runs without blocking the sheet, unsupported files use text-only sharing, and errors use the shared download fallback. Why: preserve user activation and avoid app-specific menus while logging only safe error names.
- SEO surfaces (sitemap via route staticData.sitemap, /feeds/*, llms.txt, IndexNow after the daily recap) read only public data. Why: crawlers must never see private fields.

- Optional side images use metadata-free browser WebP, a full bounded pure-JS server decode and PNG derivative; upload/report records are service-only, and nullable side references preserve old code compatibility. Why: untrusted images must never bypass moderation or break emoji-only rows.
- Side image files stay in private storage and only approved active/retired side references are served by a public route. Why: workspace policy blocks public buckets and pending or hidden pictures must not be exposed.
- Image reports count distinct hashed networks atomically and never restore a hidden image during concurrent AI re-checks. Why: unauthenticated visitors have no provable person identity.
- Optional side-picture entry points, display, moderation, cleanup and renderer use the shared SIDE_IMAGES_ENABLED gate. Why: unfinished pictures must remain dormant without deleting rollback-safe schema.

- Dodo orders, wallet ledger and webhook leases are service-only durable state; unique payment IDs and wallet row locks enforce idempotent credits and spends. Why: workers are stateless and concurrent delivery must not duplicate money.
- Refund POSTs are claimed durably once; uncertain outcomes require reconciliation and are never blindly retried because Dodo refund idempotency is undocumented. Why: avoid duplicate refunds.
- Recovery tokens travel only in URL fragments and request bodies; browser storage is environment-scoped and the database stores only SHA-256 hashes. Why: wallet links are bearer credentials.
- Legacy Stripe modules remain disconnected and their webhook is disabled until real Dodo sandbox verification permits deletion. Why: preserve the requested staged migration without allowing legacy writes.
- PayGlocal orders and matching immediate credit/debit entries are service-only; apply_payglocal_payment calls record_pull inside one locked SQL transaction with unique order/gid guards and zero carryover. Why: concurrent or replayed callbacks cannot duplicate pulls or partially apply a bundle.
- PayGlocal callbacks verify RS256 with the environment PUBCERT and merchant identity; incomplete/unverified callbacks use only the stored gid/merchant ID for authenticated Get Status. Why: browser redirects and decoded claims are never payment proof.
- PayGlocal request JWS signs the official digest-object format over exact body bytes; returned status URLs stay on the selected API origin and hosted redirects stay under payglocal.in. Why: preserve protocol integrity and prevent credential forwarding.
- Managed payment reconciliation checks overdue orders in bounded batches; expired/failed payments cannot become paid, and uncertain refunds are claimed once and left for owner review. Why: abandoned browser flows need recovery without blind refund retries.

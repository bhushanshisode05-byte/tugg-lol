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
- Public pages read via publishable-key server functions (src/lib/tugg.functions.ts) for full SSR HTML.
- All environment switches and payment credentials are read only via config() in src/lib/server-utils.server.ts. Why: request-time server configuration never enters browser bundles.
- The fetch-based PaymentProvider interface defaults to Dodo with PayGlocal retained behind the selector; immediate mode is forced and wallet APIs reject unconditionally. Why: provider rollback must never restore stored balances or mix environments.
- Public pull data is served only through SECURITY DEFINER tugg_* SQL functions (aggregates, live-only filter); the pulls table has no anon/authenticated access. Why: hides stripe_session_id and keeps totals exact past row limits.
- Realtime listens to rounds only (every pull updates its round). Why: pulls aren't public.
- Matchup checkout is rate-limited per hashed IP via the service-only take_checkout_slot SQL function. Why: atomic count+insert without storing raw IPs.
- Legal pages and AI support share one policy catalog; AI selects an approved answer ID rather than generating advice. Why: prevents invented policies and refund promises.
- Support messages and replies are archived through service-only access; abuse counters reuse the atomic hashed-IP limiter in separate support namespaces. Why: keeps personal messages private and limits AI spending.
- Admin handlers pass shared requireOwner (token, owner email, confirmed identity, unique owner role) before any private read/write; loaders redirect 401/403 to owner sign-in. Why: denial is navigation, not a crash; APIs stay authoritative.
- Daily jobs (recap, AI generator) run through the managed-schedule route /api/public/jobs/daily and lock once per UTC day in job_runs; AI 402/403 pauses them in job_state. Why: no duplicate runs or runaway AI spend.
- Recap summaries are built in code from stored facts; AI only writes prose from those facts. Why: numbers can never be invented.
- Turnstile tokens are verified server-side (src/lib/turnstile.server.ts) per operation before side effects, failing closed; widgets share public src/lib/turnstile-config.ts (VITE_TURNSTILE_SITE_KEY override, server-function fallback). Why: widget alone is not protection; public keys aren't secrets.
- Share images render in pure JS (src/lib/og); live/result URLs carry a cardVersion token, immutable only on match; all cards take every colour from src/lib/og/theme.ts (mirrors styles.css; tests forbid colour literals in renderers); pull cards are snapshots that redraw the on-screen receipt in its CSS units, and their URLs carry PULL_CARD_DESIGN. Why: no edge image libs, no stale scores, and image and screen stay one design.
- Native sharing uses a synchronous tap-time call with a visibility-preloaded story Blob; clipboard runs without blocking the sheet, unsupported files use text-only sharing, and errors use the shared download fallback. Why: preserve user activation and avoid app-specific menus while logging only safe error names.
- Recent-pulls ticker: only RecentPull fields from tugg_recent_pulls; empty renders nothing. Why: no leaks.
- SEO surfaces (sitemap via route staticData.sitemap, /feeds/*, llms.txt, IndexNow after the daily recap) read only public data; a test ties llms.txt prices to PRODUCTS. Why: no private fields or stale prices for crawlers.

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
- Round length is SQL-owned: a global default in service-only round_settings, nullable per-matchup matchups.round_length override, and each round stores its own length; a change applies from a matchup's next round. Why: rounds are created inside record_pull/close_round, and history must keep its original length.
- Round-period copy comes only from src/lib/rounds.ts helpers given the round's own length; unknown length stays neutral; a scan test forbids hardcoded periods and `?? "daily"`. Why: a daily default showed "today" on weekly ropes.
- The daily recap counts live pulls only and writes/pings only when recapHasNews; quiet days log as skipped in job_runs; an empty /recap is noindexed and unlisted. Why: the archive must stay citable, never report test money.
- Share-card fingerprints add week period/empty-round history only when present. Why: URLs change only with the drawing.
- Player engagement emails come from the scheduled /api/public/jobs/engagement scan of committed pulls/rounds into a service-only outbox unique per kind, round, environment and address hash; caps and eligibility live in SQL, sending uses src/lib/engagement's own provider adapter, never the app-email sender. Why: app email is transactional-only and notification failures must never touch pulls, payments or closes.
- Rope round lines use shared RoundStatus; thresholds only in src/lib/round-urgency.ts; SSR renders calm, fixed height, aria-hidden ticker. Why: no mismatch, shift or reader spam.
- Server modules never keep a pending promise at module level (caches hold finished values only; a scan test enforces this). Why: the Worker runtime drops promises settled after their creating request ends, which blanked the home page.

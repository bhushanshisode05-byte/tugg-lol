# Tugg roadmap

## Custom single-side pulls (2026-11-22, do not publish)
- [ ] Add explicit PWYW catalog, server and SQL amount guards, confirmed-money application, Other input and regression tests; keep fixed bundles and basket unchanged.
- [ ] Real custom checkout verification waits for sandbox custom product and a successful payment/Turnstile flow; do not use a live payment for testing.

## Homepage rope ordering (2026-11-22, do not publish)
- [x] Rank only Trending ropes by open-round totals descending, then creation date descending; preserve featured selection, filters and shared reads.
- [x] Add a muted text NEW marker for ropes younger than 48 hours; 40 targeted tests pass; desktop/phone checks confirm all 43 ropes, seven NEW labels, filters/search, unchanged featured selection and no overflow or page errors. Nothing published.

## Trend scout and manual post drafts (do not publish)
- [x] Add private drafts, disabled flag, bounded leased daily scouting on the existing 01:05 UTC schedule, shared moderated owner creation, and five-candidate voice judging.
- [x] Add owner mobile queue with copy, manual status changes, source and share-card links; caps/access/validation/no-posting tests and real database rollback checks pass; 687 tests passed, one skipped.
- [ ] Live xAI check waits for owner-supplied XAI_API_KEY and explicit TREND_SCOUT_ENABLED activation; genuine owner queue persistence check waits for configured-owner sign-in (requester's account is non-owner; owner session mint unavailable). No publishing.

## Transactional sender consolidation (2026-11-21, do not publish)
- [x] Replace only the transactional send helper with direct Resend, preserving validation, API, stable idempotency, safe error mapping and engagement separation.
- [x] Exercise receipt, notice, moderation and provider-error tests through mocked Resend requests; full suite 666 passed, 1 skipped after restoring the existing tests' missing temporary image fixtures. No real email sent or publishing performed.

## Moderation outages, create-matchup status, live-only recaps, rules and statement line (2026-11-19, do not publish)
- [x] Content check returns allowed / rejected / unavailable; an outage never rejects, refunds or emails a paid matchup; it stays unpublished and is retried by the 5-minute payments check; after 6+ failures over 3+ hours the owner is alerted once.
- [x] Shout-outs that can't be checked are handed back before payment; the AI generator skips such candidates without logging "rejected"; owner form refuses with "try again".
- [x] Create-matchup status uses the shared post-payment checker (backoff, 10 minutes, Check again, "Checkout closed. Nothing was charged.", Dismiss); honest "taking longer than usual" note.
- [x] Recaps count live pulls only; a test-pulls-only day publishes nothing.
- [x] Rules page and support answer built from the shared content policy; Dodo statement line beside the $9/$29 pay button.
- [ ] Owner tool to approve or refund a paid matchup stuck on moderation (today: wait for retries, or refund in Dodo). Blocker: owner decision.

## Round-period wording sweep (2026-11-16, do not publish)
- [x] Home badge, featured rope, trending cards, matchup and rivalry pages, receipt and share-image text worded from each round's own length; no guessed "daily" for a missing length.
- [x] Tests: weekly card says "this week" never "today", daily the reverse, neutral wording when unknown, and a scan that fails on hardcoded period copy or a "daily" default.
- [ ] Share card for a matchup with no open round still draws as a daily card (fixing it changes cached card links). Blocker: owner decision.

## Conditional round countdown (2026-11-15, do not publish)
- [x] One shared round status on the featured rope, every trending rope card, matchup pages and rivalry pages; old always-on countdowns removed.
- [x] Calm name until 12 h (weekly) / 3 h (daily) left, then "Closes in …"; final hour in accent with the extension note; thresholds in one place.
- [x] Server renders calm, no hydration warning, fixed height in every state, ticking hidden from screen readers behind a coarse label.
- [x] Shout-outs say "Someone" for unnamed buyers. Round rule text updated to match (countdown only in the final hours).
- [x] Tests for all seven requested cases plus thresholds, wording and hydration.

## Recent-pulls ticker (2026-11-15, do not publish)
- [x] Five newest real pulls from the last 48 hours on the home page (with matchup title) and each matchup page; "Someone" for no name, country name only when stored; honest rounded-down times; nothing rendered when empty; live-only when payments are live.
- [x] Replaced the old scrolling strip and its "No pulls yet" box; updates through the existing live hook; 15-second server cache.
- [x] Tests: order and times, absent when empty, Someone not Anonymous, sandbox excluded when live, exact payload fields, 48-hour window, cache.
- [ ] While payments stay in test mode the ticker shows test pulls (like the rope totals). Blocker: owner decision to hide it in test mode, or switch payments to live.

## Player notification emails (2026-11-14, do not publish)
- [x] Overtaken, closing soon and round result emails: scheduled scan every 2 minutes, once-only per kind/person/round, closable-gap rule, true streaks, live/sandbox separation, eligibility cut-off, staleness re-check at send time, per-person caps, small batches, retries with the same idempotency key.
- [x] One-click unsubscribe (mail-app one-click and /unsubscribe page), permanent, no account; receipts and refund notices unaffected.
- [x] Disclosure in both pull panels, the on-screen receipt and the receipt email; /privacy updated. All email templates moved to the site colours.
- [x] Tests: 479 app tests, engagement.sql (20-flip round, environments, closing soon, results, streaks, unsubscribe, leases, retries), 10-way concurrency script.
- [x] Resend connected by the owner (sender Tugg <rounds@updates.tugg.lol>); config valid; sample [TEST] email accepted by Resend (2026-11-14).
- [x] Sandbox sending switch on, live switch off (2026-11-14 02:10 UTC).
- [x] Owner published; start time set to 2026-11-14 02:26:18.768433 UTC (test sending on, live off).
- [ ] Live sending: only after PAYMENTS_ENV=live with live Dodo keys, an owner end-to-end test pass, and an explicit go-ahead. Blocker: owner decision.

## Noto emoji (2026-11-12, do not publish)
- [x] Side emoji on site and share cards switched from Twemoji to pinned Noto Color Emoji (v2.051), one shared mapping; credit on About / Legal updated (Apache 2.0, public-domain flags); card link versions bumped.
- [ ] Check Noto emoji on a real phone and in a real shared card. Blocker: needs a publish (owner).

## Weekly rounds and permanent all-time score (2026-11-12, do not publish)
- [x] Round length setting: global default (weekly-ready) plus per-matchup override, each round remembers its own length; weekly rounds close Monday 00:00 UTC; daily still works.
- [x] All-time score panel ("never resets") on matchup and rivalry pages; empty rounds lead with last round + all-time, on the page and the share card.
- [x] Daily recap and IndexNow ping stay daily; weekly close adds champions; copy across site, feeds, llms.txt follows each matchup's length.
- [x] Tests: 437 app tests, round-length SQL tests (weekly winner, Hall of Fame, tie-break, empty round, extension), 20-pull concurrency at a weekly close; existing payment SQL tests pass; daily share images byte-identical.
- [x] Switched the global default to weekly after the owner published (2026-11-12 01:33 UTC); open daily rounds close 2026-11-13 00:00 UTC, first weekly close 2026-11-16 00:00 UTC.
- [x] llms.txt now says Dodo Payments as merchant of record; site-wide sweep found no other visitor-readable Stripe/PayGlocal text except the retired webhook reply (now neutral).
- [ ] Check the new pages and cards on a real phone. Blocker: needs a publish (owner decision).

## Fresh share images and personal pull card (2026-11-11, do not publish)
- [x] Live matchup, rivalry and result images and their link-preview tags carry a score token (?v=<A cents>-<B cents>-<fingerprint>); matching tokens are cached for a year, old or missing tokens still draw current data with a 60-second cache.
- [x] Personal pull card at /api/public/og/p/<pull id> (link/square/story), first person or moderated display name, permanent snapshot of totals right after that pull; receipt Share uses it, matchup Share keeps the live card.
- [x] Tests: 396 pass across 40 files; disposable database snapshot checks and 20 concurrent pulls pass; preview checked on desktop and phone with the real $25 Ronaldo order.
- [ ] Shared links (not images) from the receipt still preview the live matchup card on X/WhatsApp. Blocker: owner decision on adding a pull-specific link.
- [ ] Real phone share after a real purchase on tugg.lol. Blocker: needs a publish (owner decision).

## Post-payment screen, receipt and private buyer email (2026-11-11, do not publish)
- [x] Cause found: the page did confirm both real payments within ~3 s, but Dodo's own window (opened in "we handle the redirect" mode) was never closed, so it sat on its processing view; closing it then reset the message to "pending" with no further checks. Fixed both; reproduced with the previous screen in a test.
- [x] Checks until paid/failed/expired/refunded (or review) with backoff 2 s → 15 s for 10 minutes, then a calm "still confirming, don't pay again" note with Check again; checks again when the tab comes back; network errors never show as failure.
- [x] Receipt: amount, pulls, side, matchup, side's round and all-time totals, rope sliding from its earlier position, existing share button/images, reserved spot for future badges (empty). Verified in the preview on desktop and phone with the real $5 order from 02:12 UTC.
- [x] Buyer email: confirmed Dodo returns customer.email on GET /payments/{id} (all three real sandbox payments); new private column on Dodo orders, captured from the verified payment only; anonymous and signed-in visitors now refused at the table; /privacy explains it.
- [x] Tests: 369/369 across 39 files, incl. 79-second and 5-minute late confirmations, closing Dodo's window after confirmation, 10-minute give-up, network errors, email capture/leak checks.
- [ ] Real phone purchase on the published site to see Dodo's window close itself and the receipt appear. Blocker: needs a publish (owner decision) and a test-card checkout.
- [ ] Optional: fill in buyer emails for the three sandbox orders already paid (Dodo still has them). Blocker: owner decision; not done.

## Owner password reset fix (2026-11-06)
- [x] Diagnosed 01:43–01:45 UTC failure from auth logs: leaked-password rejection, then a burned reset link, a reset-email cooldown, and finally "same as current password".
- [x] Rejected passwords no longer burn the one-use reset link (retry within the same recovery session, held only in page memory).
- [x] Specific safe messages and reason codes for breached, too short, same password, expired link and rate limit; private events now store the provider error code and weak-password reasons only.
- [x] Form states the real rules up front; success returns to sign in, which claims the owner role on /admin.
- [x] Mocked tests for every mapping, retry and success.
- [ ] Owner: retry the reset on a phone with a new, unique passphrase (not yet done with a real link).


## Pull basket behind PULL_BASKET_ENABLED (2026-11-09, do not publish)
- [x] DODO_TEST_PRODUCT_PULL_1 saved; flag default off keeps 5/10/25 bundles exactly; $9/$29 flow, Turnstile, PAUSE_PULLS, webhook verification, reconciliation, emails, moderation, sharing and PayGlocal untouched.
- [x] One $1-product checkout, quantity = total; $5–$500; up to 10 different matchups, one side each, enforced in browser, server and database; metadata allocation re-verified against stored lines in one locked SQL transaction; review on any mismatch; closed-matchup portion partially refunded once.
- [x] Tests: 337/337 suite, SQL basket checks incl. tampered metadata, crash mid-basket, round rollover, retired matchup, ten concurrent deliveries.
- [ ] Real Dodo test purchase of a basket (quantity > 1 on the $1 product), partial refund and metadata round-trip. Blocker: needs a publish so Dodo can reach the webhook, plus a real test-card checkout.

## Dodo immediate switch (do not publish)
- [x] Default Dodo provider, forced immediate-only bundles, wallet UI disconnected and all wallet read/buy/spend APIs refused even with PULL_MODE=wallet. PayGlocal remains selectable/dormant; no managed Stripe/Paddle, no publishing, no pricing/round/moderation/email/sharing changes.
- [x] Reused Dodo POST /checkouts and verified raw-body webhook; official on-demand overlay/manual-return with redirect fallback. Additive migration 0015: private immediate applications and funnel, keyed claims, atomic record_pull/no credits or wallet, pending/expired guards, age-backed reconciliation and owner aggregate reporting. Durable once-only refunds and GET refund verification; ambiguous refunds remain owner review, never retried blindly. Existing five-minute managed job reused with provider dispatch; quiet day 288 timer invocations, zero provider calls when empty.
- [x] 2026-11-08: Dodo default restored after the pause (PAYMENT_PROVIDER unset = Dodo; `payglocal` switches back). Policy copy now uses provider tokens instead of hardcoded PayGlocal text; DODO_SETUP.md corrected. Full suite 300/300 passed, 33 files. Not published.
- [ ] Owner: add DODO_TEST_* secrets and products, then publish so Dodo can reach the tugg.lol test webhook (preview is behind sign-in).
- [x] Earlier: 165 tests pass across 17 files: mocked Dodo checkout/overlay/reconcile, real signature tampering/expiry/environment, webhook replay, exact bundle prices, fail-closed/Turnstile/pause/no-wallet, moderation/refunds/disputes, PayGlocal rollback, unchanged owner authorization and sharing. Disposable PostgreSQL actual functions: 5/10/25 atomic apply, duplicate/rollback, environment/public-live-total isolation, due backoff/expiry, private grants and webhook lease replay; ten concurrent applications create exactly one five-pull bundle, no wallet. Preview desktop 1280×1800 and phone 390×844: choose 25 pulls, correct disabled Dodo checkout without keys, provider-only policies, no overflow/page errors; webhook 503 missing keys/403 wrong env, anonymous admin/job 401. Automatic build OK. DODO_SETUP.md updated with exact secrets, products, endpoints and subscriptions.
- [ ] Real Dodo test checkout, overlay, webhook/refund delivery and owner records. Blocker: owner Dodo test credentials/product IDs, Dodo approval and successful real Turnstile; do not publish.

## Safe login diagnostics (do not publish)
- [x] Add closed failure references to email login and password reset, preserving wrong-password/account-existence messages and authorization. Shared Turnstile failures capture safe codes, returned hostname/action and expected action; private events and server logs use projected fields only, never raw exceptions, tokens, passwords or emails. No new hostname enforcement or unrelated behavior changes.
- [x] 67 diagnostic/login/Turnstile tests pass, including all reference paths, leakage checks and unchanged account-existence responses. Automatic build OK; phone 390×844 reset submission with deliberately invalid token displays friendly failure and Reference: turnstile_invalid_response without overflow; no auth email or password change.
- [ ] Diagnose the real published failure after owner publishes and retries. Blocker: new diagnostics are preview-only; no publishing or real authentication emails during this task.

## Email owner login (do not publish)
- [x] Email/password first on /auth with labels and show/hide; Google/Lovable retained below, existing-account-only email link and generic recovery acknowledgement. Public /reset-password uses a one-use recovery hash verified server-side before setting a password, 12-character validation and global session sign-out. No SMS/signup UI, no profiles, owner checks unchanged.
- [x] Enabled email sign-in; hosted disable_signup=true verified via settings, confirmation remains enabled, anonymous signup disabled. Configuration tool accepted leaked-password protection and require-current-password=true; HIBP is not exposed by read-only public settings for independent verification.
- [x] Shared action-bound Turnstile before every new authentication side effect; approved existing atomic limiter reused with HMAC identifiers: password 10/IP + 5/email per 15 minutes, reset/link combined 5/IP + 3/email per hour. No new tables or raw email/IP limiter records.
- [x] Verified domain had no custom auth templates; scaffolded managed auth emails and branded reset/link, from Tugg <noreply@tugg.lol>, reply-to hello@tugg.lol. Existing app emails untouched. Reset links carry one-use recovery hashes in fragments; live return URLs explicitly use https://tugg.lol and domain is already allowed.
- [x] 68 targeted tests pass: mocked wrong/right passwords and browser session installation, owner/non-owner authorization, recovery provider and invalid/reused tokens, no signup operation/shouldCreateUser=false, Turnstile failure, concrete rate-limit arguments/fail-closed handling and password minimum. Automatic build OK. Desktop 1280×1800 and phone 390×844: login/forgot/reset, show/hide, no overflow or page errors, submissions safely blocked on localhost challenge rejection.
- [ ] Real owner password login, emailed reset/link delivery and successful published recovery. Blocker: localhost rejected by Cloudflare, no owner password/session available, new reset/auth-email pages require owner-initiated publishing. Owner should publish when ready, then Forgot password for hello@tugg.lol, complete challenge, open forwarded email and set a password of at least 12 characters. No real email sent or password changed during tests.
- [ ] Hosted password minimum and protection of direct authentication endpoints. App forms enforce 12 characters and custom per-IP/email limits, but direct hosted auth calls do not pass through app handlers. Owner should set minimum password length=12 and confirm Password HIBP Check in More → Users → Auth settings → Email. Native auth limits remain separate; no supported bot-protection configuration tool/location was found, so direct-endpoint Turnstile protection is unverified (do not claim universal CAPTCHA enforcement).
- [ ] Set hosted Site URL to https://tugg.lol in More → Users → Auth settings → Advanced. Current fallback is https://tugg-lol.lovable.app; new reset/link calls already explicitly return to tugg.lol, which is allowed. No publishing or payment/round/price/moderation/app-email/sharing changes performed.

## Owner access incident (do not publish)
- [x] Recheck 2026-11-04 report: fresh desktop/phone visits to both localhost preview and published tugg.lol/admin reach /auth without browser errors; published anonymous private endpoint returns 401. Current published admin logs show 200 document requests; no Error entries in available last-hour logs, and no preview admin errors. Current backend has two confirmed users, not zero. No current anonymous failure reproduced; earlier Owner access only refusal is historical evidence, not a new confirmed cause.
- [x] Requesting user's real non-owner session reaches /auth?denied=true on preview desktop/phone without private records; sign-out then /admin returns to login. OWNER_EMAIL and OWNER_NAME are present in sandbox; OWNER_NAME is not an admin authorization dependency. No payment, round, price, moderation, email or publishing changes.
- [x] Expanded admin regression coverage: 11 tests pass, including missing owner configuration denial and confirmed matching owner + unique role receiving stored query results read-only with no-store. Automatic build OK. Owner success is mocked, not an authenticated live verification. Hosted preview URL requires viewer access (401); local preview was used for browser checks.
- [ ] Reproduce the reported failing phone session or obtain its exact error. Blocker: fresh published browsers work and available logs contain no matching exception; clear tugg.lol site data or try a private tab, then report the time if failure persists.
- [x] Replace admin 401/403 page failures with owner sign-in redirects and explicit non-owner denial; no server authorization changes, no private data for non-owners, no publishing.
- [x] Preview and production fresh signed-out /admin redirect to /auth at 1280×1800 and 390×844. Reproduced exact Error: Owner access only with requesting user's non-owner session; production logs show matching 403s. Fixed preview denies cleanly; sign-out and revisit verified; anonymous/invalid-token API requests remain 401. 17 tests pass; build OK.
- [x] Hosted read confirms two auth users and one confirmed account matching OWNER_EMAIL; no owner roles yet (existing service-only claim assigns the unique role on authorized access). Requesting user's account differs from configured owner.
- [ ] Owner sign-in and real private-record read-back. Blocker: session minting for the different configured owner account requires approval unavailable in this context; owner must sign in with Google/Lovable using the configured OWNER_EMAIL. No new account or identity change performed.
- [x] Public signup disabled on 2026-11-04 email-login request; hosted settings verify disable_signup=true. Confirmation/anonymous settings preserved and explicitly requested HIBP enabled.

## Turnstile public key (do not publish)
- [x] Store public key in src/lib/turnstile-config.ts; all five shared widgets use it, including checkout when provider configuration is unavailable. Friendly hostname/key/script failures leave browsing available; submissions remain fail-closed.
- [x] Check all five widget locations at 1280×1800 and 390×844; Cloudflare renders its hostname-error state on localhost, friendly message fits, no page crashes. 37 security/checkout tests pass; preview build OK.
- [ ] Verify a successful real challenge and server validation. Blocker: owner must allow the preview hostname (and tugg.lol/www.tugg.lol for later live use) in this Cloudflare widget and ensure TURNSTILE_SECRET_KEY matches; localhost was rejected. No publishing performed.

## Email (do not publish; preserve payments, rounds, pricing, moderation and sharing)
- [x] Configure verified hello.tugg.lol with root sender identity Tugg <hello@tugg.lol> and hello@tugg.lol reply-to; real owner-only test accepted with a managed sent event on 2026-11-03. Nothing published.
- [x] Confirm hello.tugg.lol DNS verification (Active).
- [x] Wire PayGlocal buyer receipts, accurate rejection/refund-state notices, contact sender reply/owner copy and genuine error/refund-review/dispute owner alerts; email failures never affect payment outcomes. Buyer email retained privately on new orders; old orders without email cannot receive receipts.
- [ ] Daily digest and double-opt-in campaign wiring blocked: managed app email explicitly prohibits blog/event digests and list sends; requires a dedicated marketing email service chosen by owner.
- [x] Public business address is fixed hello@tugg.lol independently of unchanged OWNER_EMAIL admin identity.
- [x] Branded mobile-friendly templates; body-free private events, atomic claims, 6 non-owner/15 owner attempts per hour, 3 alerts/hour, 3 attempts/event, header checks, HTML escaping, PAUSE_EMAILS for non-owner messages. Managed delivery handles retries/suppression/unsubscribe; no custom queue or automatic application retry dispatcher.
- [x] Monday 08:00 UTC weekly owner-summary managed schedule registered; service-only SQL facts separate live/test gross revenue, pulls, sources, rejections/refund requests, confirmed refunds, errors, current pending/reviews and 7-day funnel conversion. Scheduler may spread by about 30 seconds; newly added route needs a later explicit publish for production execution.
- [x] Privacy Policy and recap signup acknowledgement reflect actual email collection and inactive/unconfirmed digest state.
- [x] 54 automated tests passed; live database checks: 10 concurrent claims → one accepted, duplicate suppression, 6/hour recipient cap, 3 attempts/event, 3 alerts/hour; test records deleted by id. Privacy preview visible, no runtime errors; anonymous weekly callback returns 401.
- [ ] Real customer purchase→receipt, rejected-matchup→refund notice, contact Turnstile+AI→inbox, production weekly callback execution and inbox placement. Blockers: real merchant credentials/Turnstile, owner inbox confirmation and later explicit publish. Daily-digest consent/unsubscribe tests await a dedicated marketing service.

## PayGlocal follow-ups (do not publish)
- [x] Optional environment-scoped CodeDrop drawer, silent redirect fallback, untrusted browser callbacks and confirmed rope refresh.
- [x] Anonymous funnel handlers/catalog plus private owner 7/30-day test/live aggregate view.
- [x] Due-only reconciliation with 5/15/60-minute backoff and local 24-hour expiry; quiet day 288 invocations, zero provider calls.
- [x] Mock/simulated browser tests, SQL backoff/privacy/rollback/concurrency tests and desktop/mobile preview checks; setup host discrepancy retained.
- [ ] Real merchant CodeDrop/CSP, scheduled delivery and signed-in owner funnel verification. Blocker: owner identity, sandbox credentials and provider CodeDrop enablement.

## PayGlocal immediate bundles (do not publish)
- [x] Read official signing, hosted checkout, callback, status, refund and test-card documentation; official JS digest-object implementation checked.
- [x] Add server-selected provider and immediate mode; keep Dodo/wallet code dormant.
- [x] Add private durable orders, atomic immediate pulls and refund/reconcile claims with additive schema; schema existence confirmed.
- [x] Implement signed requests, verified callbacks/Get Status fallback and five-minute managed pending reconciliation.
- [x] Update pull/create checkout, shared policies, operator identity fields, banner and read-only reporting.
- [x] 158 automated tests pass; isolated SQL rollback and ten-callback concurrency pass; desktop/mobile missing-key paths pass.
- [x] Write PAYGLOCAL_SETUP.md with dashboard steps and exact remaining verification blockers; no publishing or managed Stripe/Paddle.
- [ ] Configure OWNER_NAME and OWNER_EMAIL, four sandbox credentials and merchant-specific sandbox approval. Blocker: owner-provided values.
- [ ] Real sandbox checkout/callback/refund verification. Blocker: owner-provided sandbox credentials and merchant onboarding.

## Dodo payments and pull wallets (do not publish)
- [x] Verify official Dodo checkout, webhook, refunds, test cards and payment-method requirements; recorded in DODO_SETUP.md.
- [ ] Obtain DODO_TEST_API_KEY and DODO_TEST_WEBHOOK_SECRET; live credentials later. Blocker: user must add test credentials in Secrets.
- [x] Custom third-party Dodo integration explicitly authorized; no managed Stripe/Paddle setup is needed or enabled.
- [x] Implement without credentials, fail closed, and verify with mocked Dodo plus real signed webhook fixtures; not published.
- [x] Add provider interface, isolated test/live configuration, pull packs and Dodo matchup checkout.
- [x] Add private hash-token wallets, idempotent credit ledger and atomic spending through the round engine.
- [x] Add balance, pack purchase, recovery link, Turnstile/paused protections and read-only owner reporting.
- [x] Update the shared policy catalog, footer and server-selected Dodo test-mode details.
- [x] Keep unfinished side pictures dormant and repair OG optional-field errors; preview build OK, 51 tests pass, phone-sized browser checked.
- [x] Mocked provider/signature tests and disposable PostgreSQL credit/spend/duplicate/overdraw/concurrency tests; desktop/phone missing-key paths checked.
- [ ] Real Dodo sandbox end-to-end payments/refunds/webhooks, real Turnstile and owner reporting. Blocker: test credentials, five product IDs, Turnstile settings and owner account.
- [ ] Automate reconciliation of ambiguous refund POST outcomes. Blocker: real Dodo test keys needed to verify refund-status recovery before safe retries.
- [ ] Remove legacy Stripe code only after Dodo test-mode end-to-end success. Blocker: real Dodo test purchases not yet available; legacy modules retained without reconnection and old webhook disabled.
- [x] DODO_SETUP.md documents exact five test products, implemented webhook URL, credentials, method eligibility, additive schema and test limitations.

## Optional side pictures (do not publish)
- [ ] Add optional circle-cropped browser uploads and rights consent.
- [ ] Validate bytes, decoded dimensions and limits on server; private upload records, public-read files, server-only writes.
- [ ] Add post-payment image moderation, private reports, automatic hiding, orphan cleanup and read-only owner status.
- [ ] Show side pictures with emoji fallback across pages and all share-image sizes, without altering ropes or sharing.
- [ ] Test invalid files, metadata stripping, moderation/refund, reports, cleanup, fallback, three share sizes and phone layout; document additive schema and limitations.

## Done (phase 1 — core)
- [x] Database, 30 seed matchups at zero, round engine (ties, empty rounds, Final-Hour, streaks)
- [x] Home, matchup page (live rope, summary, top pullers, shout-outs, countries, history), create, rules, stats
- [x] Pull + create checkout, verified webhook, idempotent pulls, AI moderation, auto-refund on rejection
- [x] Nightly round close at 00:00 UTC (+ checks to 00:40 for extensions)
- [x] Products set up (rope pull $1 x qty, $9 standard, $29 featured)

## Next
- [x] Test pull lands via webhook and moves the rope live
- [x] Leaderboards, Hall of Fame + result cards (/results/[id]), /rivalries/[slug]
- [ ] Check Hall of Fame cards with real winners after the first 00:00 UTC close
- [x] Yesterday on Tugg recap at /recap + /recap/[date] (00:45 UTC daily, data-only summary, digest signup stored)
- [ ] Send the daily digest email (blocked: dedicated marketing service required; existing subscribers remain unconfirmed and unsent).
- [x] How it works, FAQ, Terms, Privacy, Refund, working Contact (AI answers), About/Legal; all footer-linked and crawler HTML verified
- [x] Hidden read-only /admin and owner-only data endpoint; anonymous/invalid-token requests return 401
- [x] Policy-grounded FAQ chat and private support records; contact and chat limits (10/hour each) verified with 429; oversized input rejected with 413
- [ ] Verify owner admin read-back: OWNER_EMAIL is configured and a matching confirmed account exists; sign in as that account and disable public signup in Users → Auth settings (see incident blockers above).
- [x] Wire verified payment-error email escalation; real error delivery and signed-in owner review remain unverified.
- [x] AI daily generator (01:05 UTC, 3/day, cap 30, 14-day retirement, AI_GENERATOR_ENABLED)
- [x] Share button on every rope, private share counts, per-matchup generated preview images (current sharing behavior below)
- [x] Confirmed the 00:00 UTC close ran on 2026-10-29
- [x] App emails: receipts, rejection notice, contact reply/copy, payment-error escalation and weekly owner summary wired and mock-tested; digest delivery remains blocked as documented above.
- [ ] GEO: robots.txt, llms.txt, sitemap, JSON-LD, JSON/RSS feeds, OG images, IndexNow, SITE_URL everywhere
- [x] Turnstile on pull/matchup checkout, contact, chat, digest (server-verified)
- [x] Add public Turnstile site key using shared browser configuration; do not publish.
- [ ] X / Bluesky auto-posting (needs keys)
- [ ] Generated share image
- [x] Pre-launch hardening: server-side PAYMENTS_ENV, live-only totals, SQL aggregates, private pulls, stale-matchup cleanup, per-IP matchup checkout limit (5/hour)

## Discovery and share images
- [x] Server-rendered share images (1200×630, 1080×1080, 1080×1920) for live matchups and round results; OG/Twitter tags per matchup, rivalry and result page; 5-minute cache
- [x] Result cards use the same design on Hall of Fame and recap pages
- [x] robots.txt AI bots, llms.txt, sitemap.xml with page-specific lastmod, WebSite/Organization/FAQPage/ItemList JSON-LD
- [x] Public JSON + RSS feeds: matchups, results, leaderboard
- [x] IndexNow key set up; ping after each daily recap (only on tugg.lol)
- [ ] Publish so link previews and IndexNow use the live site

## Share simplification
- [x] Direct native sheet with quietly copied text/link and visibility/touch-preloaded story PNG; text-only sheet when files are unsupported; silent cancellation and saved-image fallback on errors.
- [x] Desktop reduced to Copy link, X, WhatsApp, Facebook, LinkedIn, Save image (three sizes); removed country detection and obsolete platform helpers/counters.
- [x] All 65 automated tests pass; four simulated phone flows pass (image supported, text-only, silent AbortError, error download/dialog), with tap-time activation and exact text/link confirmed. Desktop has exactly six items and three save sizes; no page errors. Downloaded tugg-pizza-vs-burgers.png is 1080×1920 and visually matches Pizza vs Burgers $0/$0. Build OK.
- [ ] Real-phone native sheet and installed-app image/text handoff (requires a real phone).
- [x] Redesign the personal pull share card to mirror the on-screen receipt (real site colours, three sizes, story/square two-by-two fields); live and result cards unchanged; do not publish.
- [x] Side emoji on the website drawn as the same Twemoji artwork as share cards (unpublished)
- [x] Live and result cards use the site colour tokens like the pull card (render version 4; unpublished)

## Pre-launch data reset (2026-11-16, owner-approved, do not publish)
- [x] Cleared all sandbox payments, pulls, funnels, checkout limits and player-email records in one transaction; zeroed side scores; removed all 639 empty closed rounds; kept the 39 open weekly rounds untouched; removed all 18 recaps (each would now be empty).
- [x] Nightly recap skips days with no pulls and no closed rounds with pulls (no page, no IndexNow ping, logged as skipped); the two empty recaps were removed (2026-11-18)

## Dodo purchase receipts fix (2026-11-16, do not publish)
- [x] Receipts and matchup-rejection notices read dodo_orders and are sent after every Dodo payment outcome
- [x] Basket receipts list every applied line and the refunded portion, from the shared screen receipt builder
- [x] Dodo refund-timing wording; mode label from the order's own environment
- [x] Regression guard: wrong table or missing fulfilment hook fails tests

## Receipt date and link (2026-11-18, do not publish)
- [x] Receipt date reads "18 November 2026, 00:44 UTC"; owner weekly summary period uses the same format; tests reject raw ISO dates in notice text
- [x] Receipt links each applied line to that buyer's own public pull card page (/pull/<id>), falling back to the matchup page, then home
- [ ] Decide whether the on-screen Share button should share the new pull card page instead of the matchup page. Blocker: owner decision.

- [x] Fix blank home page from the shared recent-pulls read; fix preview buttons (picture-upload code in browser bundle) (2026-11-18, do not publish)

## Owner matchup creation (2026-11-18, do not publish)
- [x] "Add a matchup" form on the owner page (title, sides, emoji, category, description; generator limits)
- [x] Same owner check as the records page; binding moderation logged as owner_matchup; duplicate, same-side and slug-clash rules; first round opens; no order or fee
- [x] New "owner" matchup source; creation income excludes owner matchups; "Added by Tugg" on matchup page, home cards and feeds
- [ ] Owner tries the form signed in with the owner account (not checkable from here)

## Honest owner money figures (2026-11-18, do not publish)
- [x] Matchup creation income sums actual amounts on paid creation orders per provider; refunds, inactive and owner matchups excluded
- [x] Every owner-page money figure says beside the number it is gross, before payment-processing fees and merchant-of-record tax, not an accounting figure
- [x] Weekly owner summary counts Dodo payments in every line and labels revenue the same way

## Content policy and payment copy (2026-11-18, do not publish)
- [x] Generator allows famous athletes and public entertainers like moderation; every exclusion kept; real-person preference-or-merit rule in both
- [x] Dodo statement descriptor line beside the pull pay button and in the rules; rules Support section with hello@tugg.lol and 2 business days
- [ ] Decide whether recaps should count sandbox test pulls while payments are in test mode. Blocker: owner decision (tonight's recap for 18 Nov would include one $25 test pull).

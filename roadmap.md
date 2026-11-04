# Tugg roadmap

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

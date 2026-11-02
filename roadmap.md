# Tugg roadmap

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
- [ ] Configure OWNER_NAME and OWNER_EMAIL, four sandbox credentials, Turnstile public key and merchant-specific sandbox approval. Blocker: owner-provided values.
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
- [ ] Send the daily digest email (subscribers are stored; needs an email domain)
- [x] How it works, FAQ, Terms, Privacy, Refund, working Contact (AI answers), About/Legal; all footer-linked and crawler HTML verified
- [x] Hidden read-only /admin and owner-only data endpoint; anonymous/invalid-token requests return 401
- [x] Policy-grounded FAQ chat and private support records; contact and chat limits (10/hour each) verified with 429; oversized input rejected with 413
- [ ] Activate and verify owner admin access: OWNER_EMAIL is missing and auth currently has no users; owner account must be provisioned in Users with public signup remaining disabled
- [ ] Activate payment-error email escalation: no email domain or OWNER_EMAIL; verified errors currently log events instead; genuine-error and signed-in owner flows not yet verified
- [x] AI daily generator (01:05 UTC, 3/day, cap 30, 14-day retirement, AI_GENERATOR_ENABLED)
- [x] Share button on every rope, private share counts, per-matchup generated preview images (current sharing behavior below)
- [x] Confirmed the 00:00 UTC close ran on 2026-10-29
- [ ] Emails: rejection notice, payment-error escalation, weekly owner summary, digest signup (needs email domain)
- [ ] GEO: robots.txt, llms.txt, sitemap, JSON-LD, JSON/RSS feeds, OG images, IndexNow, SITE_URL everywhere
- [x] Turnstile on pull/matchup checkout, contact, chat, digest (server-verified)
- [ ] Add public Turnstile site key (VITE_TURNSTILE_SITE_KEY) and publish
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

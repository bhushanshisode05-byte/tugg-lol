# Tugg roadmap

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

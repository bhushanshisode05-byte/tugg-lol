# Tugg roadmap

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
- [ ] Yesterday on Tugg recap
- [x] How it works, FAQ, Terms, Privacy, Refund, working Contact (AI answers), About/Legal; all footer-linked and crawler HTML verified
- [x] Hidden read-only /admin and owner-only data endpoint; anonymous/invalid-token requests return 401
- [x] Policy-grounded FAQ chat and private support records; contact and chat limits (10/hour each) verified with 429; oversized input rejected with 413
- [ ] Activate and verify owner admin access: OWNER_EMAIL is missing and auth currently has no users; owner account must be provisioned in Users with public signup remaining disabled
- [ ] Activate payment-error email escalation: no email domain or OWNER_EMAIL; verified errors currently log events instead; genuine-error and signed-in owner flows not yet verified
- [ ] AI daily generator (3/day, cap 30, 14-day retirement, AI_GENERATOR_ENABLED)
- [ ] Emails: rejection notice, payment-error escalation, weekly owner summary, digest signup (needs email domain)
- [ ] GEO: robots.txt, llms.txt, sitemap, JSON-LD, JSON/RSS feeds, OG images, IndexNow, SITE_URL everywhere
- [ ] Turnstile bot protection + rate limits (needs Turnstile keys)
- [ ] X / Bluesky auto-posting (needs keys)
- [ ] Generated share image
- [x] Pre-launch hardening: server-side PAYMENTS_ENV, live-only totals, SQL aggregates, private pulls, stale-matchup cleanup, per-IP matchup checkout limit (5/hour)

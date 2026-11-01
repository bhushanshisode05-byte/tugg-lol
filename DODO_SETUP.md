# Dodo migration setup and verification status

Status: preparation only. Dodo checkout, provider interface, wallet schema, spending and webhook fulfillment are NOT implemented. Nothing published. Stripe was not reconnected. Legacy Stripe code remains as requested until Dodo test verification succeeds.

## Current blockers
- This session's payment setup guidance disallows implementing payment code before payment setup is enabled; setup tools are unavailable here. Do not enable managed Stripe or Paddle to work around the user's explicit Dodo-only requirement. Resolve support for a custom Dodo integration before implementing.
- DODO_TEST_API_KEY and DODO_TEST_WEBHOOK_SECRET are not configured.
- The preview reports the Turnstile public site key unavailable, so real checkout/spending cannot be exercised until it is configured.
- OWNER_EMAIL and a verified owner session are required to test the private read-only owner view.

## Products
Dodo officially supports creating products by API (POST /products). Once the custom integration can proceed and the test API key is configured, create these one-time digital products by API, or manually in the Dodo test dashboard:

| Exact name | USD price | Entitlement | Proposed test configuration name |
| --- | ---: | --- | --- |
| Tugg — 5 Pulls | $5 | 5 pulls | DODO_TEST_PRODUCT_PULL_5 |
| Tugg — 10 Pulls | $10 | 10 pulls | DODO_TEST_PRODUCT_PULL_10 |
| Tugg — 25 Pulls | $25 | 25 pulls | DODO_TEST_PRODUCT_PULL_25 |
| Tugg — Standard Matchup | $9 | One standard matchup | DODO_TEST_PRODUCT_STANDARD |
| Tugg — Featured Matchup | $29 | One matchup, featured for 7 days | DODO_TEST_PRODUCT_FEATURED |

Use one-time prices, not subscriptions. Disable pay-what-you-want, coupons and buyer quantity changes. The provider must validate stored product IDs, currency and the expected entitlement before fulfillment. Tax-inclusive pricing should be reviewed to retain the exact advertised total prices. No products have been created in this request.

## Secrets and environment
Add through Project Settings → Secrets, never chat or source files:
- Now: DODO_TEST_API_KEY, DODO_TEST_WEBHOOK_SECRET.
- Later, before any live testing: DODO_LIVE_API_KEY, DODO_LIVE_WEBHOOK_SECRET, and the separately created live product IDs under DODO_LIVE_PRODUCT_* names.
- PAYMENTS_ENV=sandbox remains the only payment-mode selector. No live switch in this request.

Official documentation states mode-specific keys use dodo_test_ and dodo_live_ prefixes and fail authentication against the wrong host. Never log key prefixes or any value. Check internally and also rely on provider authentication; fail closed for incompatible credentials. Test/live webhook secrets must differ and only the selected environment's secret may verify events.

## Webhook setup — not ready to configure yet
Implement and verify the endpoint before registering it. No Dodo handler exists at present; do NOT point Dodo at the current legacy Stripe webhook.

Proposed preview endpoint after implementation:
https://project--9033a0bc-640c-42ce-a129-772699249f67-dev.lovable.app/api/public/payments/dodo/webhook?env=sandbox

Future live endpoint after a separately authorized publication:
https://tugg.lol/api/public/payments/dodo/webhook?env=live

In Dodo Developer → Webhooks: create separate test/live endpoints and subscribe to payment.succeeded, payment.failed, refund.succeeded, refund.failed and all dispute events. Copy the endpoint-generated signing secret to the matching project secret. Do not create a made-up signing key. Verify the raw body using webhook-id, webhook-timestamp and webhook-signature, with Standard Webhooks HMAC-SHA256 and a 5-minute tolerance. Store durable webhook IDs and unique payment IDs separately; acknowledge only after durable processing or queue persistence.

## Payment methods
Dodo says methods are preconfigured and availability depends on billing country, currency, device and transaction type. Account verification is necessary for live payments.
- Cards: allow both credit and debit.
- Apple Pay: apple_pay; eligible Apple browsers/devices. Hosted checkout avoids adding an unfinished inline integration; inline Apple Pay requires domain verification.
- Google Pay: google_pay; not offered in India according to current docs.
- Cash App Pay: cashapp; US customers, USD only.
- UPI: upi_intent; requires Indian billing country and INR billing. It cannot be promised with the current USD-only requirement. Do not silently add INR/adaptive conversion; ask for a separate currency decision first.

## Official test card
US Visa success: 4242 4242 4242 4242, expiry 06/32, CVV 123. India Visa success: 4576 2389 1277 1450, same expiry/CVV. Test only. The existing banner has not been changed because Dodo is not active.

## Implemented and tested in this request
- Shared disabled side-image gate on create/upload/attachment/public image serving/reporting/avatar/OG/moderation/cleanup paths.
- Removed unfinished optional image fields from OG route inputs, resolving their exact-optional-property errors.
- No schema changes or payment integrations made.
- 51 tests passed: dormancy, payment environment guards, Turnstile, native phone-share logic, six-item menu rules and share-image rendering.
- Phone-sized browser: no Add image/file input, no Report image, image endpoints return 404; unchanged six-item desktop-style menu when navigator.share is absent; no page errors; story PNG 1080×1920 visually verified for Pizza vs Burgers $0/$0.
- Preview build OK.

## Side-image partial pieces retained
Private side-images bucket configuration (existence not rechecked), nullable sides.image_id/image_status/image_report_count, side_image_uploads and image_reports tables, attachment/report SQL functions and private storage policy; browser crop/rights field; byte/full-decode validation and moderation helpers; private upload/public approved-image/report handlers; renderer helper; orphan cleanup helper; owner image-status reporting and nonportable tests referencing temporary fixtures. Dormant, not removed. No new cleanup schedule installed.

## Required remaining tests
Real Dodo test-mode purchase of all three packs and webhook credit; duplicate delivery; spend 1/5/10; over-balance rejection; concurrent spends; recovery; real Turnstile and PAUSE_PULLS; paid matchup approval and Dodo refund on rejection; disputes and refund reversal; live rejects test key/webhook; owner session reporting. None has been run against Dodo. Existing tests are not substitutes for these tests.

## Official documentation checked 2026-11-01
- https://docs.dodopayments.com/api-reference/checkout-sessions/create (POST /checkouts)
- https://docs.dodopayments.com/developer-resources/webhooks (raw-body signature verification)
- https://docs.dodopayments.com/api-reference/refunds/post-refunds (POST /refunds, payment_id)
- https://docs.dodopayments.com/api-reference/products/post-products (products API)
- https://docs.dodopayments.com/miscellaneous/test-mode-vs-live-mode (separate keys/products/webhooks)
- https://docs.dodopayments.com/miscellaneous/testing-process (test credentials)
- https://docs.dodopayments.com/features/payment-methods (allowlist/eligibility)
- https://docs.dodopayments.com/features/payment-methods/india (UPI INR requirement)
# Dodo migration setup and verification status

Status: custom Dodo code implemented, fails closed without keys/products. Nothing published. Stripe was not reconnected; its old webhook returns 410. Legacy Stripe modules/packages remain dormant pending real Dodo sandbox end-to-end success.

## Current blockers
- No managed-payment setup is needed: owner explicitly authorized this custom third-party API integration. No Stripe/Paddle setup was enabled.
- DODO_TEST_API_KEY and DODO_TEST_WEBHOOK_SECRET are not configured.
- The preview reports the Turnstile public site key unavailable, so real checkout/spending cannot be exercised until it is configured.
- OWNER_EMAIL and a verified owner session are required to test the private read-only owner view.

## Products
Dodo officially supports creating products by API (POST /products). After configuring the test API key, create these one-time digital products by API, or manually in the Dodo test dashboard:

| Exact name | USD price | Entitlement | Test configuration name |
| --- | ---: | --- | --- |
| Tugg — 5 Pulls | $5 | 5 pulls | DODO_TEST_PRODUCT_PULL_5 |
| Tugg — 10 Pulls | $10 | 10 pulls | DODO_TEST_PRODUCT_PULL_10 |
| Tugg — 25 Pulls | $25 | 25 pulls | DODO_TEST_PRODUCT_PULL_25 |
| Tugg — Standard Matchup | $9 | One standard matchup | DODO_TEST_PRODUCT_STANDARD |
| Tugg — Featured Matchup | $29 | One matchup, featured for 7 days | DODO_TEST_PRODUCT_FEATURED |

Use one-time prices, not subscriptions. Disable pay-what-you-want, coupons and buyer quantity changes. The provider must validate stored product IDs, currency and the expected entitlement before fulfillment. Tax-inclusive pricing is REQUIRED and validated before checkout. Disable product discounts and purchasing power parity. Disable business Adaptive Currency; checkout fixes USD and disables currency selection. No products have been created in this request.

## Secrets and environment
Add through Project Settings → Secrets, never chat or source files:
- Now: DODO_TEST_API_KEY, DODO_TEST_WEBHOOK_SECRET.
- Later, before any live testing: DODO_LIVE_API_KEY, DODO_LIVE_WEBHOOK_SECRET, and the separately created live product IDs under DODO_LIVE_PRODUCT_* names.
- PAYMENTS_ENV=sandbox remains the only payment-mode selector. No live switch in this request.

Official docs do not establish a reliable API-key prefix contract. The implementation does NOT guess prefixes. Mode-specific hosts authenticate the selected key (test.dodopayments.com / live.dodopayments.com); product validation rejects authentication failure before creating a checkout. Identical configured test/live keys or secrets are refused. Never log key values or any derived information. Test/live webhook secrets must differ and only the selected environment's secret may verify events.

## Test dashboard setup — endpoint now exists
1. In Dodo, switch to **Test mode**, then Products → create five **one-time digital products** from the exact table above. Choose USD, tax-inclusive prices, no subscription, no pay-what-you-want, no product discount, no purchasing-power-parity. Turn **Adaptive Currency off** in business settings.
2. Copy each product ID into its matching DODO_TEST_PRODUCT_* setting in Project Settings → Secrets. These are configuration IDs, not API credentials.
3. In Dodo Developer → API Keys, create a **test-mode API key** with product/payment read and checkout/refund create permissions; add DODO_TEST_API_KEY in Project Settings → Secrets.
4. In Dodo Developer → Webhooks, add this endpoint (implemented and checked to fail closed without credentials):
   https://project--9033a0bc-640c-42ce-a129-772699249f67-dev.lovable.app/api/public/payments/dodo/webhook?env=sandbox
5. Subscribe to **payment.succeeded, payment.failed, refund.succeeded, refund.failed**, and all **dispute.*** events offered by Dodo. Save the endpoint-generated signing secret as DODO_TEST_WEBHOOK_SECRET. Do not invent a signing secret and do not use the old Stripe endpoint.
6. Verify PAYMENTS_ENV=sandbox and configure the Turnstile public site key plus secret for preview domains. Do not change live mode or publish.
7. Once keys and IDs exist, run each pack purchase with the official test card, verify webhook delivery, credits, spending, recovery, approval and rejected-matchup refund before removing legacy code.

Future live endpoint (not deployed by this task): https://tugg.lol/api/public/payments/dodo/webhook?env=live. Live products/credentials must be created separately later.

Webhook uses raw-body Standard Webhooks HMAC-SHA256, webhook-id/timestamp/signature, ±300 seconds. Environment-prefixed event IDs and a durable lease prevent replay/concurrent processing; unique payment IDs protect credits across different event IDs. Acknowledgement follows durable completion; failures return retryable 503. Refund POST idempotency is not documented, so an atomic once-only refund claim prevents duplicate requests. Ambiguous network failures are logged as needs_review rather than blindly issuing another refund; reconciliation requires checking Dodo's outcome. This is an explicitly unfinished operational recovery path until real test keys are available.

## Payment methods
Dodo says methods are preconfigured and availability depends on billing country, currency, device and transaction type. Account verification is necessary for live payments.
- Cards: allow both credit and debit.
- Apple Pay: apple_pay; eligible Apple browsers/devices. Hosted checkout avoids adding an unfinished inline integration; inline Apple Pay requires domain verification.
- Google Pay: google_pay; not offered in India according to current docs.
- Cash App Pay: cashapp; US customers, USD only.
- UPI: upi_intent; requires Indian billing country and INR billing. It cannot be promised with the current USD-only requirement. Do not silently add INR/adaptive conversion; ask for a separate currency decision first.

## Official test card
US Visa success: 4242 4242 4242 4242, expiry 06/32, CVV 123. India Visa success: 4576 2389 1277 1450, same expiry/CVV. Test only. The existing banner has not been changed because Dodo is not active.

## Implemented
- Fetch-based PaymentProvider interface; Dodo POST /checkouts, GET /products/{id}, GET /payments/{id}, POST /refunds. Exact USD/tax-inclusive price and payment/cart/order/checkout validation.
- Hash-only bearer wallets; non-expiring balances; atomic pack credit and wallet debit + existing record_pull in one SQL transaction; immutable credit/debit/refund ledger and payment/request/refund uniqueness.
- Pack panel, balance, 1/5/10 affordable spends, optional moderated name/shout, fragment recovery link/copy, environment-specific browser storage. Quiet setup failure; no browser payment confirmation.
- Server Turnstile and PAUSE_PULLS protections; hashed-network pack checkout limiter. Matchup checkout retains its existing limiter and moderation; failed moderation triggers Dodo refund.
- Private durable webhook events, order processing leases, failure/refund/dispute events, disputed wallets blocked. Private owner reporting for live/test purchase revenue, packs, pulls sold/used, refunds and flagged wallets.
- Shared policies/footer/rules/support payment checks switched to Dodo merchant of record, packs and non-expiry; server-mode test banner uses official card.
- Side image gate remains false; sharing/OG/round artwork untouched. Stripe inactive modules retained, old writer endpoint returns 410.

## Tests completed
- Automated Dodo/provider, HMAC signatures, mocked fulfillment/approval/rejection/refund/disputes, pause/Turnstile, wallet-recovery UI, plus existing sharing/OG/security regression suites.
- Real PostgreSQL in a disposable local database loaded from the actual migrations/core functions: all three credits, duplicate payment credit, 1/5/10 spends, duplicate spend, wrong environment, zero-balance rejection, flagged-wallet rejection, durable duplicate webhook ID/lease replay. Fixtures rolled back; no fake public totals were stored.
- 10 simultaneous SQL spends against a balance of 5: exactly 5 succeeded, 5 rejected, 5 ledger debits, balance 0. Local fixtures deleted.
- Desktop 1280×1800 and phone 390×844 preview: three correct disabled pack buttons, missing-key message, no image uploads, six-item Share menu unchanged, Dodo policy pages, no page errors or horizontal overflow. Endpoint returns 503 without credentials, 403 for wrong environment; old Stripe webhook 410.

## Additive database changes (rollback-safe)
Applied migrations 0008 and 0009:
- New private/RLS tables: pull_wallets, dodo_orders, pull_wallet_ledger, dodo_webhook_events; service-role-only grants.
- Nullable creators.dodo_order_id, creators.dodo_payment_id; nullable pulls.wallet_ledger_id; nullable dodo_orders.processing_until.
- Wallet token-hash uniqueness, payment/checkout/refund/request unique constraints, wallet-ledger index, balance/quantity/environment constraints.
- Service-only functions: credit_dodo_wallet, spend_wallet_pull, refund_dodo_wallet, claim_dodo_event, claim_dodo_order, tugg_dodo_summary.
- No old tables/columns/functions deleted or renamed. Existing record_pull signature and round rules unchanged; its legacy stripe_session_id column holds an internal wallet spend reference, never a Dodo payment ID. Rolling back application code leaves these additions unused; it does not reconnect Stripe or restore checkout functionality.

## Side-image partial pieces retained
Private side-images bucket configuration (existence not rechecked), nullable sides.image_id/image_status/image_report_count, side_image_uploads and image_reports tables, attachment/report SQL functions and private storage policy; browser crop/rights field; byte/full-decode validation and moderation helpers; private upload/public approved-image/report handlers; renderer helper; orphan cleanup helper; owner image-status reporting and nonportable tests referencing temporary fixtures. Dormant, not removed. No new cleanup schedule installed.

## Required remaining tests
Real hosted Dodo purchases/deliveries, actual refunds/disputes, account/method eligibility, real provider rejection of swapped keys, real Turnstile challenges and signed-in owner reporting remain untested until credentials/product IDs/Turnstile/owner account are configured. Mocked and isolated-SQL coverage is not real payment validation. No live transactions or publication occurred. Ambiguous refund retry/reconciliation is still manual; no refund promise is made when outcome is unknown.

## Official documentation checked 2026-11-01
- https://docs.dodopayments.com/api-reference/checkout-sessions/create (POST /checkouts)
- https://docs.dodopayments.com/developer-resources/webhooks (raw-body signature verification)
- https://docs.dodopayments.com/api-reference/refunds/post-refunds (POST /refunds, payment_id)
- https://docs.dodopayments.com/api-reference/products/post-products (products API)
- https://docs.dodopayments.com/miscellaneous/test-mode-vs-live-mode (separate keys/products/webhooks)
- https://docs.dodopayments.com/miscellaneous/testing-process (test credentials)
- https://docs.dodopayments.com/features/payment-methods (allowlist/eligibility)
- https://docs.dodopayments.com/features/payment-methods/india (UPI INR requirement)
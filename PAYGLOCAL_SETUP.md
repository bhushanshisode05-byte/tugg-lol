# Tugg / PayGlocal setup

## Built, not published

Custom PayGlocal hosted PayCollect integration behind `PaymentProvider`; no managed Stripe/Paddle. Dodo and its wallets remain in place but dormant by default. `PAYMENT_PROVIDER=payglocal` and `PULL_MODE=immediate` are code defaults; `PAYMENTS_ENV=sandbox` remains the only environment switch. Invalid combinations or missing credentials disable checkout. No real payment was attempted.

Purchases: 5/$5, 10/$10, 25/$25 immediate pulls; standard matchup $9, featured $29 for 7 days. USD only. No card details touch Tugg servers. Billing name, email, country and address are required for digital purchases and forwarded to PayGlocal; optional display name and shout-out are moderated before checkout.

The additive private order/ledger schema and atomic apply function are applied. A verified capture calls existing `record_pull` once with the bundle dollar amount, within the same transaction as the credit, matching debit and paid record. Public totals count the complete bundle; there is no balance or carryover. Duplicate callbacks are harmless; concurrent processors use durable leases. Failed/expired purchases apply nothing. An unverified callback never supplies the trusted amount, status or gid: Get Status uses the stored provider reference. An initiation with a lost response is recovered by merchant transaction ID, not a second initiation.

After captured matchup payment, existing moderation activates approved submissions or claims one full refund. `SENT_FOR_REFUND` means submitted, not money already returned. Ambiguous POST outcomes become `needs_review`, never automatically retried. Late capture of a terminal order is logged for owner review without pulls. No refund-completion promise is inferred from a submission.

## Official documentation checked

- [Index](https://docs.payglocal.in/llms.txt)
- [Key management](https://payglocal.in/docs/key-management/overview)
- [Private key](https://payglocal.in/docs/key-management/private-key)
- [Public certificate](https://payglocal.in/docs/key-management/public-certificate)
- [Constructing requests](https://payglocal.in/docs/key-management/request-construction)
- [PayCollect GPI](https://docs.payglocal.in/api-reference/payments-v2/paycollect/gpi)
- [Get Status](https://docs.payglocal.in/api-reference/payments-v2/common/get-transaction-status)
- [Refund](https://docs.payglocal.in/api-reference/payment/refund)
- [Callback handling](https://payglocal.in/docs/merchant/payment-response-handling.md)
- [Sandbox testing](https://payglocal.in/docs/guides/testing)
- [Official JS digest object](https://github.com/PayGlocal-Technologies/payglocal-js-client/blob/main/utils/helper.js)
- [Official JS JWS signing](https://github.com/PayGlocal-Technologies/payglocal-js-client/blob/main/src/generateJWS.js)

JWS: RS256; `kid` merchant private-key ID; `iss` merchant ID; `x-gl-enc="false"`; `is-digested="true"`; additional merchant headers. Payload is the official SDK's JSON digest object: SHA-256 of exact serialized body, Base64 digest, `digestAlgorithm="SHA-256"`, `exp=300000` lifetime and millisecond `iat`. **It is not a raw digest or hex string.** GET signs the empty body. Callback compact JWT is verified with PUBCERT, not merely decoded, and must match the environment merchant identity and stored transaction.

Documentation differences requiring sandbox validation: current key-management/testing pages name production `https://api.prod.payglocal.in`, while the requested implementation uses `https://api.payglocal.in`. Sandbox uses `https://api.uat.payglocal.in` consistently. Official SDK samples default encrypted requests and differ in some headers from the unencrypted API schema requested here. Confirm unencrypted PayCollect is enabled for your MID and validate exact GET signing against PayGlocal's current sample/client before live activation. Do not switch to live until these are resolved. Credentials cannot reveal which environment issued them; separate names, MID/key collision rejection and environment PUBCERT verification isolate local use, while PayGlocal must reject swapped provider-issued credentials during real tests.

## PayGlocal Control Center steps

1. Obtain sandbox account/MID and approval for Tugg's paid digital entertainment (no prizes or payouts), USD collection and hosted PayCollect. Log in to **https://gcc.uat.payglocal.in**.
2. Open **Key Management → API Keys** and create a merchant key pair. Download **PVT-KEY** immediately; docs say this is your only download opportunity. Keep it private.
3. Record the merchant MID and the PVT-KEY KID (filename portion before the underscore). Download **PayGlocal PUBCERT** from **Manage Keys** in the same sandbox environment; this is PayGlocal's certificate, not your merchant public key.
4. In **Project Settings → Secrets**, add:

| Setting | Value to supply |
| --- | --- |
| `PAYGLOCAL_SANDBOX_MERCHANT_ID` | Your sandbox MID |
| `PAYGLOCAL_SANDBOX_KEY_ID` | Sandbox PVT-KEY KID |
| `PAYGLOCAL_SANDBOX_PRIVATE_KEY` | Full downloaded PEM including BEGIN/END lines and newlines |
| `PAYGLOCAL_SANDBOX_PUBLIC_CERT` | Full PayGlocal sandbox PUBCERT PEM |
| `OWNER_NAME` | Actual legal operator/person/business name; not a placeholder |
| `OWNER_EMAIL` | Public contact email, also used for owner access |
| `PAYMENT_PROVIDER` | `payglocal` (optional because it is the default) |
| `PULL_MODE` | `immediate` (optional because it is the default) |
| `PAYMENTS_ENV` | `sandbox` |

Private keys must never be pasted into chat or committed files. When the sandbox values exist, add them securely here and tell me they are ready. Operator/email are currently not supplied: About/Legal shows this explicitly and checkout stays disabled until both are valid.

5. Ensure Turnstile has the app/preview hostnames allowed. Add the public site key as `VITE_TURNSTILE_SITE_KEY` through project settings; the server secret is already configured by name but its correctness and real challenge flow are not verified.
6. The code supplies `merchantCallbackURL` on **every initiate request**, including `env=sandbox&order=<order UUID>`. The publicly reachable preview callback base is **https://id-preview--9033a0bc-640c-42ce-a129-772699249f67.lovable.app/api/public/payments/payglocal/callback**. Keep the complete query parameters supplied in each request; do not replace the per-payment URL with a bare static callback. Ask PayGlocal to allowlist this HTTPS origin/path if your MID requires callback URL approval. The docs do not establish a separate dashboard webhook-registration step for this PayCollect browser callback—do not invent one. If PayGlocal assigns independent server webhooks, obtain that exact protocol before enabling them.
7. No five product IDs are required: PayCollect takes the server-locked USD amount and unique merchant IDs directly. Disable adaptive currency/INR/UPI options for this integration at the merchant level if offered; request USD-only hosted payment methods. Tugg checks the verified **transaction** currency and exact amount before any fulfillment.
8. Use the official reference Visa success test card **4111 1111 1111 1111**, any future expiry, any 3-digit CVV. Official reference Mastercard: **5132 5522 2222 3470**. The official table itself says these are reference test numbers and **requires confirmation of exact validated cards for your MID**. Ask your PayGlocal integration team for those before treating a declined reference card as a Tugg bug.
9. Exercise 5/10/25 bundles, both sides, successful/declined/abandoned payments, replay/concurrent callbacks, unmatched amount/currency, approved and rejected matchup creation, full refund and ambiguous refund outcomes. Save PayGlocal's sandbox evidence for merchant review.

## Scheduled reconciliation

Managed authenticated POST `/api/public/jobs/payments`, unchanged schedule `tugg-payglocal-reconcile`, every five minutes. **A quiet day still produces 288 scheduled HTTP invocations**, each one short database RPC, **zero PayGlocal requests, zero provider construction/key parsing, and zero empty-run event inserts**. This reduces work, not the scheduler invocation count; no promise of zero Cloud billing. Schedule metadata was inspected and not changed.

Database selection/expiry is atomic and service-only. Pending purchases are eligible only after five minutes and before 24 hours. Checks back off: every 5 minutes below 1 hour old, every 15 minutes from 1 to 6 hours, every 60 minutes from 6 to 24 hours. At most ten due records per invocation, three-second provider timeouts. Failed checks update the last-check time too, preventing repeated outage polling. At 24 hours pending records expire locally without another provider request; late capture remains owner-review-only and cannot apply pulls. Unlike the previous implementation, an outage does not extend the expiry indefinitely. Unfinished paid matchup review remains eligible only inside the same 24-hour window; older unresolved reviews require owner attention, never blind refund retries.

This schedule was created but delivery has not been verified. Nothing was published. Do not assume production has this new callback code until a separately authorized publish. The shared backend has the additive schema and schedule; existing published code remains unchanged.

## Tests and verification

- **158 automated tests pass across 17 files**, including 34 PayGlocal signing/provider/fulfillment/guard tests; real throwaway 2048-bit RSA fixtures, valid/tampered/wrong-key/wrong-merchant/expired callbacks, exact digest headers, hosted USD request, price rules, missing credentials/identity, live-only switch, replay/concurrency, fallback, finalization/expiry, no expiration on network failure and once-only ambiguous refunds.
- Isolated PostgreSQL: exact 5/10/25 bundle totals, one credit/debit per order, zero carryover, replay, wrong environment, real sandbox exclusion from public aggregate; forced failure after credit and pull proves the entire transaction rolls back.
- Ten simultaneous local SQL callbacks: exactly one bundle and one credit/debit pair.
- Desktop and 390px mobile preview: bundle selection, no wallet/balance/recovery UI, disabled missing-key purchase/create, no horizontal overflow or page errors. About/Legal explicitly shows pending operator configuration.
- Existing Dodo, support, sharing, image and round regression suite passed. Temporary fixtures needed by dormant side-image tests were restored only under `/tmp`; no side-image feature enabled.
- Read-only owner reporting adds live/test revenue, bundles, pulls applied, refund requests/review, pending/expired and reconcile results. Actual signed-in owner rendering remains unverified.

**Not verified without your real sandbox setup:** accepted request/callback token format for your MID, Get Status GET digest, PayGlocal certificate rotation, actual environment rejection of swapped keys, USD/method eligibility, hosted redirect host for your account, merchant callback delivery/browser return, missing-callback schedule delivery, real Turnstile, provider captures/refunds/settlements, dispute workflows and signed-in owner access. No real-money claims are made. No rule prevents the custom third-party integration, and no managed payment integration was enabled.

## Later production configuration (do not do yet)

Only after sandbox evidence and merchant approval, use separate `PAYGLOCAL_LIVE_MERCHANT_ID`, `PAYGLOCAL_LIVE_KEY_ID`, `PAYGLOCAL_LIVE_PRIVATE_KEY`, `PAYGLOCAL_LIVE_PUBLIC_CERT`. Confirm the production host discrepancy with PayGlocal before switching `PAYMENTS_ENV=live`. Never copy sandbox keys into LIVE names. Get an explicit publish instruction first; primary-domain callback will be `https://tugg.lol/api/public/payments/payglocal/callback` with the generated environment/order query.

Dodo rollback retains its code/schema, but requires `PAYMENT_PROVIDER=dodo`, `PULL_MODE=wallet` and Dodo environment credentials. Public policies currently describe PayGlocal immediate bundles, so do not activate rollback without reviewing policy consistency.
## CodeDrop drawer follow-up (not published)

Official guides checked: https://docs.payglocal.in/merchant/paycollect/codedrop and https://payglocal.in/docs/api-reference/codedrop . Ask PayGlocal to enable CodeDrop on the relevant MID and issue a `cdId`. In Project Settings → Secrets add `PAYGLOCAL_SANDBOX_CODEDROP_ID` for sandbox, and separately `PAYGLOCAL_LIVE_CODEDROP_ID` only after live approval. These are the environment-scoped equivalents of `PAYGLOCAL_CODEDROP_ID`; the unscoped name is deliberately not read, avoiding reuse across environments. The ID is public script configuration, not a signing credential.

The bundle checkout loads only when payment opens: sandbox `https://codedrop.uat.payglocal.in/simple.js`, live `https://codedrop.payglocal.in/simple.js`, attributes `data-cd-id` and `data-display-mode="drawer"`, deferred. Calls `window.PGPay.launchPayment({redirectUrl}, callback)`. Missing ID, blocked/failed script, five-second load timeout or launch exception quietly uses the original redirect. Matchup creation remains redirect checkout, unchanged.

Browser `SENT_FOR_CAPTURE` requests confirmation only; `CUSTOMER_CANCELLED`, `ABANDONED` and failure statuses are anonymous observations, never database payment authority. Existing verified server callback/Get Status still finalize. Polling only reads stored state; confirmed paid state refreshes rope/recent pulls and shows bundle confirmation; the existing Share button stays available.

A nonce-based script policy allows only self, Turnstile and exact CodeDrop script origins, without wildcard script hosts, unsafe-inline or unsafe-eval. Existing stricter response policy is preserved. Local development is report-only because Vite injects development scripts; production enforces the script policy. No wildcard frame/connect CSP was introduced. The official CodeDrop guides do not provide a full nested-frame/network CSP allowlist; merchant-specific real drawer testing and provider CSP requirements remain necessary. Hosting may impose additional policies; blocked scripts fall back silently.

## Private anonymous payment funnel

Owner records show 7/30-day counts and step ratios separately for test/live: panel viewed (intersection), bundle selected, Turnstile passed, payment opened, server-confirmed completed; cancellation, abandonment, failure alongside. Anonymous random panel-visit IDs only, bundle 5/10/25, environment and drawer/redirect mode. No name, email, shout-out, card data, full URL or raw IP in funnel records. Anonymous intake is schema-allowlisted and rate-limited; no browser endpoint accepts completion. A database terminal-state trigger records completion/failure transactionally and deduplicates replay. Tables and aggregate function are service-only; existing owner authorization protects reads. Visit ID retained through redirect in sessionStorage is anonymous, not a payment/recovery credential.

The built-in User-app events instrumentation emits catalogued `project.payment_funnel` at the existing handlers. For the requested in-app owner view, a separate app-owned private store is required: Lovable's internal analytics query tool has no supported in-app query API. Nothing written there is claimed to reach the built-in collector. Counts are distinct panel visits per step, not people; conversions are aggregate observed ratios, not matched cohort percentages. Browser events can be blocked and anonymous reports can be forged, so they are not revenue proof. Completion is server-authoritative in owner records.

## Production host comparison — BLOCK LIVE SWITCH

Configured API: `https://api.payglocal.in`. Current Get Transaction Status page documents **the same host**, so difference there is **none**. Key-management/testing references previously checked instead document `https://api.prod.payglocal.in`: difference is the extra `prod` subdomain. Sandbox remains `https://api.uat.payglocal.in`. CodeDrop live script is independently `https://codedrop.payglocal.in/simple.js`. Obtain merchant-specific confirmation of the correct API base before any live switch; do not silently change the base or reuse sandbox keys.

## Follow-up verification

92 targeted PayGlocal/Dodo regression tests pass across nine files, including simulated browser drawer load/launch, blocked script fallback, cancellation, browser-completed callback not applying pulls, confirmed server payment updating the rope, exact script allowlist, missing ID, signatures/refunds/guards and dormant wallet regression. Isolated PostgreSQL validates 5/15/60-minute age backoff, local 24-hour expiry without pulls, environment separation, private grants, visit deduplication, atomic rollback and ten concurrent callbacks applying exactly one bundle. Desktop and 390px preview show disabled missing-key checkout, Share, no unsolicited CodeDrop script, no overflow or runtime errors; anonymous owner read returns 401. Catalog/schema validation passes for one emitted event name.

Still unverified: real merchant CodeDrop drawer/callback delivery, actual CSP/frame/network compatibility, scheduled delivery, real purchases/refunds/Turnstile, signed-in owner report with real traffic. Missing owner credentials/identity and CodeDrop enablement remain blockers. No publishing, managed Stripe/Paddle activation, Dodo deletion or side-image activation.

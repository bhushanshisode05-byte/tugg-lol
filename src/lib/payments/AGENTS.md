# Payment integrity

- Dodo immediate orders, bundle applications and webhook leases are service-only durable state; apply_dodo_bundle locks the order and calls record_pull atomically with unique payment/order guards and no wallet entries. Legacy wallet orders are refused. Why: concurrent deliveries must not duplicate pulls or create balances.
- Refund POSTs are claimed durably once; uncertain outcomes require reconciliation and are never blindly retried because Dodo refund idempotency is undocumented. Why: avoid duplicate refunds.
- Recovery tokens travel only in URL fragments and request bodies; browser storage is environment-scoped and the database stores only SHA-256 hashes. Why: wallet links are bearer credentials.
- Legacy Stripe modules remain disconnected and their webhook is disabled until real Dodo sandbox verification permits deletion. Why: preserve the requested staged migration without allowing legacy writes.
- PayGlocal orders and matching immediate credit/debit entries are service-only; apply_payglocal_payment calls record_pull inside one locked SQL transaction with unique order/gid guards and zero carryover. Why: concurrent or replayed callbacks cannot duplicate pulls or partially apply a bundle.
- PayGlocal callbacks verify RS256 with the environment PUBCERT and merchant identity; incomplete/unverified callbacks use only the stored gid/merchant ID for authenticated Get Status. Why: browser redirects and decoded claims are never payment proof.
- PayGlocal request JWS signs the official digest-object format over exact body bytes; returned status URLs stay on the selected API origin and hosted redirects stay under payglocal.in. Why: preserve protocol integrity and prevent credential forwarding.

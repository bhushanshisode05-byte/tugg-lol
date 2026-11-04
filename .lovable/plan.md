# Protected owner email sign-in

## Build
- Put email/password first on the existing login page, with show/hide password, clear pending/error states, and Google/Lovable below. Keep sign-out and owner authorization unchanged. No public signup or SMS.
- Add “Forgot password?” and optional “Email me a sign-in link”; return the same acknowledgement whether the account exists. Add a public reset-password page requiring a valid recovery session, matching passwords of at least 12 characters, and no account creation.
- Use the verified sender domain for authentication links. Existing purchase/contact/other app emails stay untouched. The domain check reports that custom authentication emails are not yet configured: use the managed authentication setup, not a new email service.
- Published reset/sign-in links explicitly return to https://tugg.lol; check the existing allowed return addresses and explain any manual setting required.
- Enable email sign-in, disable hosted signup, and enable leaked-password protection while preserving confirmation and anonymous-access settings. If a hosted setting cannot be safely read, give the exact setting to change instead of overwriting unknown values.

## Decisions to approve
- **Profiles:** assume no new profiles are needed; retain the existing owner email and protected role. Please correct this if you need other user data.
- **Rate limits:** the backend has no standard rate-limiting primitive. Approve reusing Tugg’s existing atomic hashed limiter in separate authentication namespaces: password attempts 10/IP and 5/email per 15 minutes; reset/sign-in-link requests combined 5/IP and 3/email per hour. This adds no new tables and never stores raw IPs in the limiter.
- The 12-character requirement applies to new passwords and password-form submissions; an older short password can be replaced through recovery.

## Security and technical details
- Verify shared Turnstile tokens server-side, with distinct login/reset/link/password-update actions, before authentication side effects. Keep passwords and tokens out of logs and use generic provider errors.
- Use isolated server authentication clients and existing-account-only magic links (`shouldCreateUser: false`). Server handlers retain anti-cross-site checks; owner records remain protected independently of the login form.
- No payments, rounds, pricing, moderation, sharing, or existing app-email changes; no publishing.

## Verify and report
- Mock wrong/right password, reset and sign-in-link provider calls; test signup prohibition, Turnstile failure, concrete rate limits, 12-character minimum, recovery validity, and existing owner/non-owner checks.
- Check phone/desktop form layout and the flow with a real permitted account when possible; identify simulated checks separately.
- Update the roadmap and explain how hello@tugg.lol can set its password, any hosted settings still required, and what remains unverified until publishing and real challenge/email delivery.
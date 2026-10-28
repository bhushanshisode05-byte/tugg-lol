<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Tugg architecture
- Round/pull integrity lives in SQL functions (record_pull, close_round, close_due_rounds) callable only by service role; the payment webhook is the only writer of pulls, so amounts always come from the verified payment.
- Public pages read through publishable-key server functions in src/lib/tugg.functions.ts so SSR serves full HTML to crawlers.
- Env switches (SITE_URL, PAUSE_PULLS, TEST_MODE, AI_GENERATOR_ENABLED) are read only via config() in src/lib/server-utils.server.ts.

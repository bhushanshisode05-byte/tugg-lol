import { createFileRoute } from '@tanstack/react-router'
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth'
export const Route = createFileRoute('/api/public/jobs/owner-summary')({
  staticData: { sitemap: false },
  server: { handlers: { POST: async ({ request }) => {
    const failure = await authenticateCronRequest(request)
    if (failure) return failure
    const { sendWeeklySummary } = await import('@/lib/app-email.server')
    const result = await sendWeeklySummary()
    return Response.json(result, { status: result.sent || result.reason === 'duplicate' ? 200 : 503 })
  } } },
})
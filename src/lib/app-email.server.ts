import { z } from 'zod'
import { config } from './server-utils.server'
import { sendTemplateEmail } from './email-templates/send-email'
import { ENGAGEMENT_DISCLOSURE } from './engagement/rules'

export const BUSINESS_EMAIL = 'hello@tugg.lol'
export const EMAIL_LIMITS = { recipientPerHour: 6, ownerPerHour: 15, alertsPerHour: 3, attemptsPerEvent: 3 } as const
const ownerTemplates = new Set(['contact-owner', 'owner-alert', 'weekly-summary', 'owner-test'])
export type NoticeTemplate = 'purchase-receipt' | 'matchup-rejection' | 'contact-reply' | 'contact-owner' | 'owner-alert' | 'weekly-summary' | 'owner-test'
async function db() { return (await import('@/integrations/supabase/client.server')).supabaseAdmin }
const address = z.string().max(254).email().refine(s => !/[\r\n]/.test(s))
async function hash(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('')
}
function failureCode(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
  return typeof code === 'string' && ['domain_not_verified','emails_disabled','recipient_suppressed','rate_limited'].includes(code) ? code : 'send_failed'
}
// No bodies, addresses, provider tokens or raw errors in operational logs.
async function log(key: string, template: string, status: string, recipientHash?: string) {
  try { await (await db()).from('events').insert({ kind: 'app_notice_result', detail: { key, template, status, ...(recipientHash ? { recipient_hash: recipientHash } : {}) } }) } catch { /* email logging cannot affect purchases */ }
}
export async function deliverNotice(template: NoticeTemplate, recipient: string, eventId: string, data: Record<string, unknown>) {
  const key = `${template}:${eventId}`
  const owner = ownerTemplates.has(template)
  try {
    const to = owner ? BUSINESS_EMAIL : recipient
    if (!address.safeParse(to).success || !/^[A-Za-z0-9:_-]{1,170}$/.test(eventId)) return { sent: false, reason: 'invalid' }
    if (config().pauseEmails && !owner) { await log(key, template, 'paused'); return { sent: false, reason: 'paused' } }
    const recipientHash = await hash(to.toLowerCase())
    const claim = await (await db()).rpc('claim_tugg_notice', { p_key: key, p_recipient: recipientHash, p_template: template, p_owner: owner })
    if (claim.error || claim.data !== 'accepted') return { sent: false, reason: claim.error ? 'claim_failed' : String(claim.data) }
    try {
      const result = await sendTemplateEmail(template, to, { templateData: data, idempotencyKey: key, replyTo: BUSINESS_EMAIL })
      await log(key, template, result.sent ? 'sent' : result.reason, recipientHash)
      return result
    } catch (error) {
      const reason = failureCode(error)
      await log(key, template, reason, recipientHash)
      return { sent: false, reason }
    }
  } catch { await log(key, template, 'send_failed'); return { sent: false, reason: 'send_failed' } }
}
export const REFUND_TIMING = 'Refunds return to the original payment method. The time to appear depends on PayGlocal and your bank; Tugg cannot promise an exact date.'
const usd = (cents: number) => `$${(cents / 100).toFixed(2)} USD`

export async function sendPurchaseNotices(orderId: string, environment: string) {
  try {
    const client = await db()
    const result = await client.from('payglocal_orders').select('*').eq('id', orderId).eq('environment', environment).single()
    const order = result.data
    if (result.error || !order || order.status !== 'paid') return
    let matchup: { title: string; slug: string } | null = null
    let sideName = ''
    if (order.side_id) {
      const side = await client.from('sides').select('name,matchups(title,slug)').eq('id', order.side_id).single()
      matchup = side.data?.matchups ?? null; sideName = side.data?.name ?? ''
    } else if (order.matchup_id) {
      const m = await client.from('matchups').select('title,slug').eq('id', order.matchup_id).single()
      matchup = m.data
    }
    if (!order.buyer_email) { await log(`purchase-receipt:${orderId}`, 'purchase-receipt', 'missing_buyer_email'); return }
    const link = matchup ? `https://tugg.lol/m/${encodeURIComponent(matchup.slug)}` : undefined
    const details = [
      { label: 'Purchase', value: order.quantity ? `${order.quantity} pulls` : `${order.kind === 'featured' ? 'Featured' : 'Standard'} matchup` },
      { label: 'Matchup', value: matchup?.title || 'Tugg matchup' },
      ...(sideName ? [{ label: 'Side', value: sideName }] : []),
      { label: 'Amount', value: usd(order.expected_cents) },
      { label: 'Date (UTC)', value: order.paid_at || order.created_at },
      // Merchant reference, never a full provider token/gid.
      { label: 'Payment reference', value: order.merchant_unique_id },
      { label: 'Mode', value: environment === 'live' ? 'Live' : 'Sandbox / test' },
    ]
    await deliverNotice('purchase-receipt', order.buyer_email, orderId, { heading: 'Your Tugg purchase receipt', details, link, paragraphs: ['This is a one-time purchase of digital entertainment. No prizes or payouts.', ENGAGEMENT_DISCLOSURE] })
    if (order.review_allowed === false) {
      const completed = ['succeeded','refunded'].includes(order.refund_status || '')
      const submitted = ['submitted','pending','SENT_FOR_REFUND'].includes(order.refund_status || '')
      await deliverNotice('matchup-rejection', order.buyer_email, `${orderId}:${completed ? 'completed' : submitted ? 'submitted' : 'review'}`, {
        heading: 'Your matchup was rejected', details: [
          { label: 'Matchup', value: matchup?.title || 'Tugg matchup' },
          { label: 'Reason', value: order.review_reason || 'The submission did not meet the published content policy.' },
          { label: 'Refund amount', value: usd(order.expected_cents) },
          { label: 'Refund status', value: completed ? 'Refund confirmed' : submitted ? 'Refund requested, not yet confirmed' : 'Refund outcome is being reviewed' },
          { label: 'Payment reference', value: order.merchant_unique_id },
        ], paragraphs: [REFUND_TIMING],
      })
    }
    if (['needs_review','failed'].includes(order.refund_status || '')) await sendOwnerAlert('refund_review', orderId, environment)
  } catch { await log(`purchase-receipt:${orderId}`, 'purchase-receipt', 'notice_data_unavailable') }
}
export async function sendContactNotices(threadId: string) {
  try {
    const result = await (await db()).from('support_threads').select('email,name,message,ai_reply,channel,status').eq('id', threadId).single()
    const thread = result.data
    if (result.error || !thread || thread.channel !== 'contact') return
    const data = { heading: 'Reply to your Tugg message', paragraphs: [thread.ai_reply || 'Your message is saved for review.'], details: [{ label: 'Your message', value: thread.message }] }
    if (thread.email && thread.status === 'answered') await deliverNotice('contact-reply', thread.email, threadId, data)
    await deliverNotice('contact-owner', BUSINESS_EMAIL, threadId, { ...data, heading: 'Tugg contact thread', details: [{ label: 'Sender', value: thread.email || 'Not supplied' }, { label: 'Name', value: thread.name || 'Not supplied' }, ...data.details] })
  } catch { await log(`contact-owner:${threadId}`, 'contact-owner', 'notice_data_unavailable') }
}
export type AlertKind = 'payment_error' | 'refund_review' | 'dispute'
export async function sendOwnerAlert(kind: AlertKind, reference: string, environment: string) {
  const labels = { payment_error: 'A verified payment processing error needs review.', refund_review: 'A refund outcome needs review. Do not retry an uncertain refund blindly.', dispute: 'A payment dispute needs review.' }
  if (!(kind in labels)) return { sent: false, reason: 'not_genuine' }
  return deliverNotice('owner-alert', BUSINESS_EMAIL, `${kind}:${reference}`, { heading: 'Tugg payment issue needs review', paragraphs: [labels[kind]], details: [{ label: 'Internal reference', value: reference }, { label: 'Environment', value: environment }] })
}
export function weeklyWindow(now = new Date()) {
  const to = new Date(now); to.setUTCHours(8,0,0,0)
  to.setUTCDate(to.getUTCDate() - ((to.getUTCDay() + 6) % 7))
  if (to > now) to.setUTCDate(to.getUTCDate() - 7)
  return { from: new Date(to.getTime() - 7*86400000).toISOString(), to: to.toISOString(), id: to.toISOString().slice(0,10) }
}
export async function sendWeeklySummary(now = new Date()) {
  const window = weeklyWindow(now)
  try {
    const result = await (await db()).rpc('tugg_weekly_notice_facts', { p_from: window.from, p_to: window.to })
    if (result.error) return { sent: false, reason: 'facts_unavailable' }
    const facts = result.data as unknown as { environments: { environment: string; revenue_cents: number; pulls: number; rejections: number; refunds_requested: number; refund_reviews: number; pending: number; viewed: number; opened: number; completed: number }[]; new_matchups: Record<string, number>; errors: number; failed_payments: number; refunds_confirmed: number }
    const details = facts.environments.flatMap(e => [
      { label: `${e.environment} gross revenue`, value: usd(e.revenue_cents) },
      { label: `${e.environment} pulls`, value: String(e.pulls) },
      { label: `${e.environment} rejections / refund requests`, value: `${e.rejections} / ${e.refunds_requested}` },
      { label: `${e.environment} pending / refund reviews (current)`, value: `${e.pending} / ${e.refund_reviews}` },
      { label: `${e.environment} 7-day funnel viewed → opened → completed`, value: `${e.viewed} → ${e.opened} → ${e.completed}; viewed-to-completed ${e.viewed ? (100*e.completed/e.viewed).toFixed(1) : '0.0'}%` },
    ])
    return deliverNotice('weekly-summary', BUSINESS_EMAIL, window.id, { heading: 'Tugg weekly owner summary', details: [
      { label: 'UTC period', value: `${window.from} to ${window.to}` }, ...details,
      ...Object.entries(facts.new_matchups).map(([source,count]) => ({ label: `New matchups: ${source}`, value: String(count) })),
      { label: 'Genuine errors / failed payments', value: `${facts.errors} / ${facts.failed_payments}` },
      { label: 'Confirmed refunds', value: String(facts.refunds_confirmed) },
    ], paragraphs: ['Gross revenue is before refunds. Refund requests are not confirmed refunds. Funnel counts use the same private events as the owner view.'] })
  } catch { return { sent: false, reason: 'facts_unavailable' } }
}
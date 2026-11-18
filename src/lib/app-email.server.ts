import { z } from 'zod'
import { config } from './server-utils.server'
import { sendTemplateEmail } from './email-templates/send-email'
import { ENGAGEMENT_DISCLOSURE } from './engagement/rules'
import { refundTimingText } from './payments/copy'
import type { PaymentReceipt, ReceiptLine } from './payments/confirmation'
import { formatUtcDateTime } from './utc-format'
import { pullPagePath, PUBLIC_SITE } from './og/card'

export const BUSINESS_EMAIL = 'hello@tugg.lol'
export const EMAIL_LIMITS = { recipientPerHour: 6, ownerPerHour: 15, alertsPerHour: 3, attemptsPerEvent: 3 } as const
const ownerTemplates = new Set(['contact-owner', 'owner-alert', 'weekly-summary', 'owner-test'])
export type NoticeTemplate = 'purchase-receipt' | 'matchup-rejection' | 'contact-reply' | 'contact-owner' | 'owner-alert' | 'weekly-summary' | 'owner-test'
async function db() { return (await import('@/integrations/supabase/client.server')).supabaseAdmin }
type Db = Awaited<ReturnType<typeof db>>
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
const usd = (cents: number) => `$${(cents / 100).toFixed(2)} USD`
const plural = (n: number) => `${n} pull${n === 1 ? '' : 's'}`

/** Which provider took the payment. Every provider's fulfilment calls sendPurchaseNotices with its own id. */
export type ReceiptProvider = 'dodo' | 'payglocal'
/** The table each provider's fulfilment writes its orders to; the receipt reads only from there.
 *  A provider without an entry fails to compile, so a new provider cannot silently read an empty table. */
export const RECEIPT_ORDER_TABLE = { dodo: 'dodo_orders', payglocal: 'payglocal_orders' } as const satisfies Record<ReceiptProvider, string>
/** Refund timing for the default (Dodo, merchant of record) provider. */
export const REFUND_TIMING = refundTimingText('dodo')

/** Provider-neutral view of a stored order. `reference` is the customer-facing payment reference only. */
type ReceiptOrder = {
  id: string; environment: string; kind: string; status: string; expected_cents: number; quantity: number
  side_id: string | null; matchup_id: string | null; paid_at: string | null; created_at: string
  buyer_email: string | null; review_allowed: boolean | null; review_reason: string | null; refund_status: string | null
  basket_refund_cents: number; reference: string
}
// Named columns only: checkout sessions, refund ids and processing keys are never read into the email path.
const DODO_COLUMNS = 'id,environment,kind,status,expected_cents,quantity,side_id,matchup_id,payment_id,paid_at,created_at,buyer_email,review_allowed,review_reason,refund_status,basket_refund_cents'
const PAYGLOCAL_COLUMNS = 'id,environment,kind,status,expected_cents,quantity,side_id,matchup_id,merchant_unique_id,paid_at,created_at,buyer_email,review_allowed,review_reason,refund_status'
async function loadReceiptOrder(client: Db, provider: ReceiptProvider, orderId: string, environment: string): Promise<ReceiptOrder | null> {
  if (provider === 'dodo') {
    const r = await client.from(RECEIPT_ORDER_TABLE.dodo).select(DODO_COLUMNS).eq('id', orderId).eq('environment', environment).single()
    const o = r.data as any
    if (r.error || !o) return null
    // Dodo's payment ID (pay_…) is the reference printed on Dodo's own receipt to the buyer; the checkout session ID is never shown.
    return { ...o, basket_refund_cents: o.basket_refund_cents ?? 0, reference: o.payment_id || o.id }
  }
  const r = await client.from(RECEIPT_ORDER_TABLE.payglocal).select(PAYGLOCAL_COLUMNS).eq('id', orderId).eq('environment', environment).single()
  const o = r.data as any
  if (r.error || !o) return null
  // Tugg's merchant reference, never the PayGlocal gid.
  return { ...o, basket_refund_cents: 0, reference: o.merchant_unique_id }
}
type Detail = { label: string; value: string }
/** Email lines from the same receipt the confirmation screen shows, so the two can never disagree. */
export function pullReceiptDetails(receipt: PaymentReceipt): Detail[] {
  const sideName = (l: ReceiptLine) => l.sides.find(s => s.id === l.sideId)?.name || 'your side'
  const applied = receipt.pulls - receipt.refundedPulls
  const [single] = receipt.lines
  const lines: Detail[] = receipt.lines.length === 1 && single
    ? [{ label: 'Matchup', value: single.title }, { label: 'Side', value: sideName(single) }, { label: 'Pulls', value: String(single.pulls) }]
    : receipt.lines.map((l, i) => ({ label: `Matchup ${i + 1}`, value: `${l.title}: ${plural(l.pulls)} for ${sideName(l)}` }))
  return [
    { label: 'Purchase', value: receipt.lines.length > 1 ? `${plural(applied)} across ${receipt.lines.length} matchups` : plural(applied) },
    ...lines,
  ]
}
/** A link in a notice. Every href is a public tugg.lol page: never an email, order, payment or session id. */
export type NoticeLink = { href: string; label: string }
export const HOME_LINK: NoticeLink = { href: `${PUBLIC_SITE}/`, label: 'Visit Tugg' }
const matchupHref = (slug: string) => `${PUBLIC_SITE}/m/${encodeURIComponent(slug)}`
const PUBLIC_MATCHUP = ['active', 'retired'] // the only statuses with a public matchup page
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const dedupe = (links: NoticeLink[]) => links.filter((l, i) => links.findIndex(o => o.href === l.href) === i)

/**
 * One link per applied receipt line, to that buyer's own pull card page (the same pull the on-screen Share button
 * draws). A line whose card can't be drawn right now falls back to its public matchup page, then home, so a receipt
 * never carries a dead link. Refunded basket lines are not receipt lines and get no link.
 */
export async function receiptLinks(receipt: PaymentReceipt): Promise<NoticeLink[]> {
  const many = receipt.lines.length > 1
  const { loadPullCard } = await import('./tugg.functions')
  const links = await Promise.all(receipt.lines.map(async (l): Promise<NoticeLink> => {
    const pullId = l.pull?.id
    if (pullId && UUID.test(pullId)) {
      // Exactly what the public card route checks before drawing; any doubt falls back.
      const card = await loadPullCard(pullId).catch(() => null)
      if (card && card.id === pullId && card.slug === l.slug && card.sideId === l.sideId)
        return { href: `${PUBLIC_SITE}${pullPagePath(pullId)}`, label: many ? `See your pull card: ${l.title}` : 'See your pull card' }
    }
    // Receipt lines only exist for matchups the public can read, so this page exists.
    if (l.slug) return { href: matchupHref(l.slug), label: many ? `View ${l.title} on Tugg` : 'View the matchup on Tugg' }
    return HOME_LINK
  }))
  return links.length ? dedupe(links) : [HOME_LINK]
}
async function pullDetails(client: Db, order: ReceiptOrder, provider: ReceiptProvider): Promise<{ details: Detail[]; links: NoticeLink[]; refundedPulls: number } | null> {
  if (provider === 'dodo' && (order.kind === 'basket' || order.side_id)) {
    const { dodoReceipt } = await import('./payments/receipt.server')
    const receipt = await dodoReceipt(client as any, order)
    if (!receipt || !receipt.lines.length) return null
    return { details: pullReceiptDetails(receipt), links: await receiptLinks(receipt), refundedPulls: receipt.refundedPulls }
  }
  if (!order.side_id) return null
  const side = await client.from('sides').select('name,matchups(title,slug,status)').eq('id', order.side_id).single()
  const matchup = (side.data as any)?.matchups as { title: string; slug: string; status: string } | null
  if (side.error || !matchup) return null
  const links = PUBLIC_MATCHUP.includes(matchup.status) ? [{ href: matchupHref(matchup.slug), label: 'View the matchup on Tugg' }] : [HOME_LINK]
  return { details: [{ label: 'Purchase', value: plural(order.quantity) }, { label: 'Matchup', value: matchup.title }, { label: 'Side', value: (side.data as any).name }, { label: 'Pulls', value: String(order.quantity) }], links, refundedPulls: 0 }
}
/** "Date: 18 November 2026, 00:44 UTC"; an unreadable value omits the line instead of printing raw text. */
function dateDetail(value: string | null | undefined): Detail[] {
  const formatted = formatUtcDateTime(value)
  return formatted ? [{ label: 'Date', value: formatted }] : []
}
function refundState(status: string | null) {
  const completed = ['succeeded', 'refunded'].includes(status || '')
  const submitted = ['submitted', 'pending', 'SENT_FOR_REFUND'].includes(status || '')
  return { key: completed ? 'completed' : submitted ? 'submitted' : 'review', label: completed ? 'Refund confirmed' : submitted ? 'Refund requested, not yet confirmed' : 'Refund outcome is being reviewed' }
}

/** Buyer receipt (and rejection/refund notice) from the stored order in the table `provider` writes to. Observer only. */
export async function sendPurchaseNotices(orderId: string, environment: string, provider: ReceiptProvider) {
  try {
    const client = await db()
    const order = await loadReceiptOrder(client, provider, orderId, environment)
    if (!order || order.status !== 'paid') return
    const mode = order.environment === 'live' ? 'Live' : 'Sandbox / test'
    const refundTiming = refundTimingText(provider)
    const isPull = order.kind === 'basket' || Boolean(order.side_id)
    let matchup: { title: string; slug: string; status: string } | null = null
    let pull: Awaited<ReturnType<typeof pullDetails>> = null
    if (isPull) {
      pull = await pullDetails(client, order, provider)
      if (!pull) { await log(`purchase-receipt:${orderId}`, 'purchase-receipt', 'notice_data_unavailable'); return }
    } else if (order.matchup_id) {
      const m = await client.from('matchups').select('title,slug,status').eq('id', order.matchup_id).single()
      matchup = m.data
    }
    if (!order.buyer_email) { await log(`purchase-receipt:${orderId}`, 'purchase-receipt', 'missing_buyer_email'); return }
    const refunded = pull && pull.refundedPulls > 0 ? refundState(order.refund_status) : null
    const details: Detail[] = [
      ...(pull ? pull.details : [
        { label: 'Purchase', value: `${order.kind === 'featured' ? 'Featured' : 'Standard'} matchup` },
        { label: 'Matchup', value: matchup?.title || 'Tugg matchup' },
      ]),
      { label: 'Amount', value: usd(order.expected_cents) },
      ...(pull && refunded ? [
        { label: 'Refunded', value: `${usd(order.basket_refund_cents)} for ${plural(pull.refundedPulls)}, because a matchup stopped taking pulls before your payment was applied` },
        { label: 'Refund status', value: refunded.label },
      ] : []),
      ...dateDetail(order.paid_at || order.created_at),
      { label: 'Payment reference', value: order.reference },
      { label: 'Mode', value: mode },
    ]
    // A new matchup's page is public only once approved; pending or rejected ones link home instead.
    const links = pull?.links ?? (matchup && PUBLIC_MATCHUP.includes(matchup.status) ? [{ href: matchupHref(matchup.slug), label: 'View your matchup on Tugg' }] : [HOME_LINK])
    await deliverNotice('purchase-receipt', order.buyer_email, orderId, { heading: 'Your Tugg purchase receipt', details, links, paragraphs: ['This is a one-time purchase of digital entertainment. No prizes or payouts.', ...(refunded ? [refundTiming] : []), ENGAGEMENT_DISCLOSURE] })
    if (!isPull && order.review_allowed === false) {
      const state = refundState(order.refund_status)
      await deliverNotice('matchup-rejection', order.buyer_email, `${orderId}:${state.key}`, {
        heading: 'Your matchup was rejected', details: [
          { label: 'Matchup', value: matchup?.title || 'Tugg matchup' },
          { label: 'Reason', value: order.review_reason || 'The submission did not meet the published content policy.' },
          { label: 'Refund amount', value: usd(order.expected_cents) },
          { label: 'Refund status', value: state.label },
          { label: 'Payment reference', value: order.reference },
          { label: 'Mode', value: mode },
        ], paragraphs: [refundTiming],
      })
    }
    if (['needs_review','failed'].includes(order.refund_status || '')) await sendOwnerAlert('refund_review', orderId, order.environment)
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
      { label: 'Period', value: `${formatUtcDateTime(window.from)} to ${formatUtcDateTime(window.to)}` }, ...details,
      ...Object.entries(facts.new_matchups).map(([source,count]) => ({ label: `New matchups: ${source}`, value: String(count) })),
      { label: 'Genuine errors / failed payments', value: `${facts.errors} / ${facts.failed_payments}` },
      { label: 'Confirmed refunds', value: String(facts.refunds_confirmed) },
    ], paragraphs: ['Gross revenue is before refunds. Refund requests are not confirmed refunds. Funnel counts use the same private events as the owner view.'] })
  } catch { return { sent: false, reason: 'facts_unavailable' } }
}
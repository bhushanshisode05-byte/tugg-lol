import * as React from 'react'
import { render } from '@react-email/render'
import { TEMPLATES } from './registry'

// Server-only: reads Resend credentials. Never import from client components.
// Keep sender validation identical to the separate engagement adapter.
const FROM = /^(?:[A-Za-z0-9 .'&-]{1,40} )?<?([^\s@<>"\r\n]{1,64}@[^\s@<>"\r\n]{1,189}\.[A-Za-z]{2,24})>?$/

function sendingError(code: 'emails_disabled' | 'domain_not_verified' | 'rate_limited') {
  return Object.assign(new Error(`Transactional email failed: ${code}`), { code })
}

export type SendTemplateEmailResult =
  | { sent: true }
  | { sent: false; reason: 'recipient_suppressed' }

export interface SendTemplateEmailOptions {
  templateData?: Record<string, any>
  /** Dedupes retries of the same logical send; defaults to a random UUID (no dedupe). */
  idempotencyKey?: string
  replyTo?: string
}

/**
 * Renders a registered template and sends it through Resend. Explicit provider
 * suppression is an expected outcome; recognised failures expose .code for
 * existing notice handling. Provider bodies and addresses never enter errors.
 */
export async function sendTemplateEmail(
  templateName: string,
  to: string,
  options: SendTemplateEmailOptions = {}
): Promise<SendTemplateEmailResult> {
  const apiKey = process.env['RESEND_API_KEY']
  const from = process.env['TRANSACTIONAL_EMAIL_FROM'] || process.env['ENGAGEMENT_EMAIL_FROM']
  if (!apiKey || !from || !FROM.test(from)) throw sendingError('emails_disabled')

  const template = TEMPLATES[templateName]
  if (!template) {
    throw new Error(
      `Template '${templateName}' not found. Available: ${Object.keys(TEMPLATES).join(', ')}`
    )
  }

  // Template-level `to` takes precedence — notification templates always
  // send to their fixed address.
  const recipient = template.to || to
  if (!recipient) {
    throw new Error('Recipient is required (the template defines no fixed recipient)')
  }
  const replyTo = options.replyTo || 'hello@tugg.lol'
  const validAddress = /^[^\s@\r\n]+@[^\s@\r\n]+\.[^\s@\r\n]+$/
  if (!validAddress.test(recipient) || !validAddress.test(replyTo)) {
    throw new Error('Invalid email address')
  }

  const templateData = options.templateData ?? {}
  const element = React.createElement(template.component, templateData)
  const html = await render(element)
  const text = await render(element, { plainText: true })
  const subject =
    typeof template.subject === 'function'
      ? template.subject(templateData)
      : template.subject
  if (/[\r\n]/.test(subject)) throw new Error('Invalid email subject')

  let response: Response
  let body: Record<string, unknown> = {}
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `tugg-transactional/${options.idempotencyKey || crypto.randomUUID()}`,
      },
      body: JSON.stringify({
        from, to: [recipient], reply_to: replyTo, subject, html, text,
        tags: [{ name: 'category', value: 'transactional' }],
      }),
      signal: AbortSignal.timeout(8000),
    })
    const raw = await response.text()
    let parsed: unknown = null
    try { parsed = JSON.parse(raw) } catch { /* A non-JSON error still retains its HTTP classification. */ }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed as Record<string, unknown>
  } catch {
    // Fetch/timeout errors can contain request details. Never propagate them.
    throw new Error('Transactional email request failed')
  }

  // Inspect only for classification; never interpolate any provider fields.
  const name = typeof body['name'] === 'string' ? body['name'].toLowerCase() : ''
  const code = typeof body['code'] === 'string' ? body['code'].toLowerCase() : name
  const message = typeof body['message'] === 'string' ? body['message'].toLowerCase() : ''
  const suppressed = ['recipient_suppressed', 'email_suppressed', 'suppressed'].includes(code)
    || body['status'] === 'suppressed'
    || /(?:recipient|email|address)[\s\S]*\bsuppressed\b/.test(message)
    || /\b(?:suppression|block|blocked|bounce|bounced)[ -]?list\b/.test(message)
  if (suppressed) return { sent: false, reason: 'recipient_suppressed' }
  if (response.status === 429) throw sendingError('rate_limited')
  if ((response.status === 403 || response.status === 422)
    && (code === 'domain_not_verified' || /\bdomain\b[\s\S]*\b(?:not verified|not been verified|unverified)\b/.test(message))) {
    throw sendingError('domain_not_verified')
  }
  if (response.status === 401 || (response.status === 403
    && (['invalid_api_key', 'missing_api_key', 'restricted_api_key', 'invalid_permission'].includes(code)
      || /\bapi[ _-]?key\b/.test(message)))) throw sendingError('emails_disabled')
  if (!response.ok) throw new Error(`Transactional email request failed (HTTP ${response.status})`)
  return { sent: true }
}

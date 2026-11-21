import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ send: vi.fn(), render: vi.fn(async (_element: unknown, _options?: { plainText: boolean }) => '<p>Tugg</p>') }))
vi.mock('@react-email/render', () => ({ render: mocks.render }))
vi.mock('../lib/email-templates/registry', () => ({
  TEMPLATES: {
    test: { component: () => null, subject: 'Tugg receipt' },
    fixed: { component: () => null, subject: 'Owner notice', to: 'owner@example.com' },
    hostile: { component: () => null, subject: 'Subject\r\nBcc: stranger@example.com' },
  },
}))
import { sendTemplateEmail } from '../lib/email-templates/send-email'

const request = () => {
  const call = mocks.send.mock.calls[0]
  if (!call) throw new Error('Expected a Resend request')
  return { url: call[0], init: call[1] as RequestInit, body: JSON.parse(call[1].body) }
}
const response = (status: number, body: unknown) => mocks.send.mockResolvedValue(Response.json(body, { status }))
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('Tugg Resend transactional infrastructure', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('RESEND_API_KEY', 'test-only-resend-key')
    vi.stubEnv('TRANSACTIONAL_EMAIL_FROM', 'Tugg <receipts@updates.tugg.lol>')
    vi.stubEnv('ENGAGEMENT_EMAIL_FROM', 'Tugg <rounds@updates.tugg.lol>')
    vi.stubGlobal('fetch', mocks.send)
    response(200, { id: 'email-id' })
  })
  it('sends html and text directly through Resend with transactional-only tags, reply-to and stable idempotency', async () => {
    await expect(sendTemplateEmail('test', 'visitor@example.com', { idempotencyKey: 'purchase-receipt:event-1' })).resolves.toEqual({ sent: true })
    const { url, init, body } = request()
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('Idempotency-Key')).toBe('tugg-transactional/purchase-receipt:event-1')
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer test-only-resend-key')
    expect(body).toEqual({ from: 'Tugg <receipts@updates.tugg.lol>', to: ['visitor@example.com'], reply_to: 'hello@tugg.lol', subject: 'Tugg receipt', html: '<p>Tugg</p>', text: '<p>Tugg</p>', tags: [{ name: 'category', value: 'transactional' }] })
    expect(JSON.stringify({ headers: init.headers, body })).not.toMatch(/List-Unsubscribe/i)
    expect(mocks.render).toHaveBeenCalledTimes(2)
    expect(mocks.render.mock.calls[1]?.[1]).toEqual({ plainText: true })
  })
  it('bounds the request to exactly 8000 ms', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    await sendTemplateEmail('test', 'visitor@example.com')
    expect(timeout).toHaveBeenCalledWith(8000)
    expect(request().init.signal).toBe(timeout.mock.results[0]?.value)
    timeout.mockRestore()
  })
  it('uses a namespaced UUID when no stable event key is provided', async () => {
    await sendTemplateEmail('test', 'visitor@example.com')
    expect(new Headers(request().init.headers).get('Idempotency-Key')).toMatch(/^tugg-transactional\/[0-9a-f-]{36}$/)
  })
  it('falls back to engagement sender only when the transactional sender is unset', async () => {
    vi.stubEnv('TRANSACTIONAL_EMAIL_FROM', '')
    await sendTemplateEmail('test', 'visitor@example.com')
    expect(request().body.from).toBe('Tugg <rounds@updates.tugg.lol>')
  })
  it('keeps fixed template recipient precedence and caller reply-to', async () => {
    await sendTemplateEmail('fixed', 'invalid caller', { replyTo: 'reply@example.com' })
    expect(request().body).toMatchObject({ to: ['owner@example.com'], reply_to: 'reply@example.com' })
  })
  it('lists available templates for an unknown template', async () => {
    await expect(sendTemplateEmail('missing', 'visitor@example.com')).rejects.toThrow("Template 'missing' not found. Available: test, fixed, hostile")
    expect(mocks.send).not.toHaveBeenCalled()
  })
  it('requires a recipient when the template has no fixed address', async () => {
    await expect(sendTemplateEmail('test', '')).rejects.toThrow('Recipient is required')
    expect(mocks.send).not.toHaveBeenCalled()
  })
  it.each(['visitor@example.com\r\nBcc: stranger@example.com', 'invalid'])('rejects invalid recipients without sending: %s', async (to) => {
    await expect(sendTemplateEmail('test', to)).rejects.toThrow('Invalid email address')
    expect(mocks.send).not.toHaveBeenCalled()
  })
  it('rejects reply-to header injection without sending', async () => {
    await expect(sendTemplateEmail('test', 'visitor@example.com', { replyTo: 'hello@tugg.lol\nBcc: stranger@example.com' })).rejects.toThrow('Invalid email address')
    expect(mocks.send).not.toHaveBeenCalled()
  })
  it('rejects subject header injection without sending', async () => {
    await expect(sendTemplateEmail('hostile', 'visitor@example.com')).rejects.toThrow('Invalid email subject')
    expect(mocks.send).not.toHaveBeenCalled()
  })
  it.each(['key', 'senders', 'invalid-from'])('fails closed with emails_disabled for missing/invalid %s', async (kind) => {
    if (kind === 'key') vi.stubEnv('RESEND_API_KEY', '')
    if (kind === 'senders') { vi.stubEnv('TRANSACTIONAL_EMAIL_FROM', ''); vi.stubEnv('ENGAGEMENT_EMAIL_FROM', '') }
    if (kind === 'invalid-from') vi.stubEnv('TRANSACTIONAL_EMAIL_FROM', 'hello@tugg.lol\r\nBcc: stranger@example.com')
    await expect(sendTemplateEmail('test', 'visitor@example.com')).rejects.toMatchObject({ code: 'emails_disabled' })
    expect(mocks.send).not.toHaveBeenCalled()
  })
  it.each([
    { name: 'recipient_suppressed' }, { code: 'email_suppressed' }, { name: 'suppressed' },
    { name: 'validation_error', message: 'The recipient is suppressed' },
    { name: 'validation_error', message: 'Email is on the block list' },
    { name: 'validation_error', message: 'Address is on the bounce list' },
    { name: 'validation_error', message: 'Recipient is on the suppression list' },
  ])('returns expected suppression, never throws, for %j', async (body) => {
    response(422, body)
    await expect(sendTemplateEmail('test', 'visitor@example.com')).resolves.toEqual({ sent: false, reason: 'recipient_suppressed' })
  })
  it('also respects an explicit suppressed status on a successful response', async () => {
    response(200, { id: 'email-id', status: 'suppressed' })
    await expect(sendTemplateEmail('test', 'visitor@example.com')).resolves.toEqual({ sent: false, reason: 'recipient_suppressed' })
  })
  it('maps HTTP 429 to rate_limited', async () => {
    response(429, { name: 'rate_limit_exceeded', message: 'Too many requests' })
    await expect(sendTemplateEmail('test', 'visitor@example.com')).rejects.toMatchObject({ code: 'rate_limited' })
  })
  it.each([403, 422])('maps HTTP %s with unverified-domain wording to domain_not_verified', async (status) => {
    response(status, { name: 'validation_error', message: 'The updates.tugg.lol domain is not verified. Please, add and verify your domain.' })
    await expect(sendTemplateEmail('test', 'visitor@example.com')).rejects.toMatchObject({ code: 'domain_not_verified' })
  })
  it('maps an explicit domain_not_verified code', async () => {
    response(422, { code: 'domain_not_verified' })
    await expect(sendTemplateEmail('test', 'visitor@example.com')).rejects.toMatchObject({ code: 'domain_not_verified' })
  })
  it.each([
    [401, { name: 'validation_error', message: 'API key is invalid' }],
    [403, { name: 'restricted_api_key', message: 'API key is not active' }],
    [403, { name: 'invalid_permission', message: 'Access token is missing required scopes.' }],
  ])('maps API key failure HTTP %s to emails_disabled', async (status, body) => {
    response(Number(status), body)
    await expect(sendTemplateEmail('test', 'visitor@example.com')).rejects.toMatchObject({ code: 'emails_disabled' })
  })
  it.each([403, 422, 500])('keeps other HTTP %s errors plain and body-free', async (status) => {
    response(status, { name: 'validation_error', message: 'private response visitor@example.com test-only-resend-key' })
    const error = await sendTemplateEmail('test', 'visitor@example.com').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toHaveProperty('code')
    expect(String(error)).not.toMatch(/visitor@example|test-only-resend-key|private response/)
  })
  it.each(['network', 'timeout'])('sanitises %s exceptions as plain send failures', async (kind) => {
    mocks.send.mockRejectedValue(new Error(`${kind} visitor@example.com test-only-resend-key`))
    const error = await sendTemplateEmail('test', 'visitor@example.com').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toHaveProperty('code')
    expect(String(error)).toBe('Error: Transactional email request failed')
  })
  it('treats a response-body timeout as a plain safe network failure', async () => {
    mocks.send.mockResolvedValue({ status: 200, ok: true, text: async () => { throw new Error('timeout visitor@example.com') } })
    const error = await sendTemplateEmail('test', 'visitor@example.com').catch((e: unknown) => e)
    expect(error).not.toHaveProperty('code')
    expect(String(error)).toBe('Error: Transactional email request failed')
  })
  it('classifies a non-JSON rate-limit response by its HTTP status', async () => {
    mocks.send.mockResolvedValue(new Response('private body visitor@example.com', { status: 429 }))
    await expect(sendTemplateEmail('test', 'visitor@example.com')).rejects.toMatchObject({ code: 'rate_limited' })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ send: vi.fn(), render: vi.fn(async () => '<p>Tugg</p>') }))
vi.mock('@lovable.dev/email-js', () => ({
  sendLovableEmail: mocks.send,
  EmailAPIError: class EmailAPIError extends Error {},
}))
vi.mock('@react-email/render', () => ({ render: mocks.render }))
vi.mock('../lib/email-templates/registry', () => ({
  TEMPLATES: { test: { component: () => null, subject: 'Tugg receipt' }, hostile: { component: () => null, subject: 'Subject\r\nBcc: stranger@example.com' } },
}))
import { sendTemplateEmail } from '../lib/email-templates/send-email'

describe('Tugg managed email infrastructure', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('LOVABLE_API_KEY', 'test-only-key')
    mocks.send.mockResolvedValue(undefined)
  })
  it('uses hello@tugg.lol as sender and reply-to with the selected delegated domain', async () => {
    await sendTemplateEmail('test', 'visitor@example.com', { idempotencyKey: 'receipt-order-1' })
    expect(mocks.send.mock.calls[0]?.[0]).toMatchObject({
      from: { name: 'Tugg', address: 'hello@tugg.lol' }, reply_to: 'hello@tugg.lol',
      sender_domain: 'hello.tugg.lol', idempotency_key: 'receipt-order-1',
    })
  })
  it('rejects recipient header injection without sending', async () => {
    await expect(sendTemplateEmail('test', 'visitor@example.com\r\nBcc: stranger@example.com')).rejects.toThrow('Invalid email address')
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
  it('fails closed without a sending key', async () => {
    vi.stubEnv('LOVABLE_API_KEY', '')
    await expect(sendTemplateEmail('test', 'visitor@example.com')).rejects.toThrow('not configured')
    expect(mocks.send).not.toHaveBeenCalled()
  })
  it('does not pretend an unverified domain sent successfully', async () => {
    mocks.send.mockRejectedValue(Object.assign(new Error('Domain not verified'), { code: 'domain_not_verified' }))
    await expect(sendTemplateEmail('test', 'visitor@example.com')).rejects.toThrow('Domain not verified')
  })
})
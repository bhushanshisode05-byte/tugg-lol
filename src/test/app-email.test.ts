// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ paused: false, claims: new Set<string>(), results: [] as any[], sends: [] as any[], reject: false, limit: false, rows: {} as Record<string, any>, weekly: {} as any }))
vi.mock('@/lib/server-utils.server', () => ({ config: () => ({ pauseEmails: state.paused }) }))
vi.mock('@/lib/email-templates/send-email', () => ({ sendTemplateEmail: async (...args: any[]) => {
  state.sends.push(args)
  if (state.reject) throw Object.assign(new Error('secret must never be logged'), { code: 'domain_not_verified' })
  return { sent: true }
} }))
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: {
  rpc: async (name: string, args: any) => {
    if (name === 'tugg_weekly_notice_facts') return { data: state.weekly, error: null }
    if (state.limit) return { data: 'rate_limited', error: null }
    if (state.claims.has(args.p_key)) return { data: 'duplicate', error: null }
    state.claims.add(args.p_key); return { data: 'accepted', error: null }
  },
  from: (table: string) => {
    const q: any = { select: () => q, eq: () => q, single: async () => ({ data: state.rows[table], error: null }), insert: async (v: any) => { state.results.push(v); return { error: null } } }
    return q
  },
} }))
import { deliverNotice, sendPurchaseNotices, sendContactNotices, sendOwnerAlert, sendWeeklySummary, weeklyWindow, EMAIL_LIMITS } from '@/lib/app-email.server'
beforeEach(() => { state.paused=false; state.limit=false; state.reject=false; state.claims.clear(); state.sends=[]; state.results=[]; state.rows={}; state.weekly={ environments: [{ environment:'live',revenue_cents:500,pulls:5,rejections:0,refunds_requested:0,refund_reviews:0,pending:0,viewed:10,opened:5,completed:2 }],new_matchups:{ai:3,user:1},errors:0,failed_payments:0,refunds_confirmed:0 } })
it('pause blocks non-owner messages, not owner summary', async () => { state.paused=true; expect((await deliverNotice('contact-reply','visitor@example.com','thread1',{})).sent).toBe(false); await deliverNotice('weekly-summary','arbitrary@example.com','week1',{}); expect(state.sends[0]?.[1]).toBe('hello@tugg.lol'); expect(state.sends).toHaveLength(1) })
it('duplicate and concurrent events send once', async () => { await Promise.all([deliverNotice('contact-reply','visitor@example.com','one',{}),deliverNotice('contact-reply','visitor@example.com','one',{})]); expect(state.sends).toHaveLength(1) })
it('rate limits prevent sending', async () => { state.limit=true; expect((await deliverNotice('owner-alert','hello@tugg.lol','one',{})).sent).toBe(false); expect(state.sends).toHaveLength(0) })
it('has explicit bounded limits', () => { expect(EMAIL_LIMITS).toEqual({recipientPerHour:6,ownerPerHour:15,alertsPerHour:3,attemptsPerEvent:3}) })
it('invalid recipient/header injection cannot send', async () => { await deliverNotice('contact-reply','visitor@example.com\r\nBcc:x@example.com','one',{}); expect(state.sends).toHaveLength(0) })
it('unverified failure is harmless and logs no content or raw error', async () => { state.reject=true; const r=await deliverNotice('contact-reply','visitor@example.com','one',{ paragraphs:['private body'] }); expect(r).toEqual({sent:false,reason:'domain_not_verified'}); expect(JSON.stringify(state.results)).not.toContain('private body'); expect(JSON.stringify(state.results)).not.toContain('visitor@example.com'); expect(JSON.stringify(state.results)).not.toContain('secret') })
it.each([['pull_5',5,500],['standard',0,900],['featured',0,2900]])('receipt %s goes only to buyer with exact USD price', async(kind,quantity,cents) => { state.rows['payglocal_orders']={id:'order1',status:'paid',buyer_email:'buyer@example.com',kind,quantity,expected_cents:cents,merchant_unique_id:'merchantref',paid_at:'2026-11-02T08:00:00Z',matchup_id:'match1',side_id:quantity?'side1':null}; state.rows['sides']={name:'Pizza',matchups:{title:'Pizza vs Burgers',slug:'pizza-vs-burgers'}}; state.rows['matchups']={title:'Pizza vs Burgers',slug:'pizza-vs-burgers'}; await sendPurchaseNotices('order1','sandbox'); expect(state.sends[0]?.[0]).toBe('purchase-receipt'); expect(state.sends[0]?.[1]).toBe('buyer@example.com'); expect(state.sends[0]?.[2].templateData.details).toContainEqual({label:'Amount',value:`$${(Number(cents)/100).toFixed(2)} USD`}); expect(state.sends).toHaveLength(1) })
it('unpaid order never emails a receipt', async () => { state.rows['payglocal_orders']={status:'pending',buyer_email:'buyer@example.com'}; await sendPurchaseNotices('one','live'); expect(state.sends).toHaveLength(0) })
it('rejection distinguishes requested from completed refunds and includes reason', async () => { state.rows['payglocal_orders']={status:'paid',buyer_email:'buyer@example.com',kind:'standard',quantity:0,expected_cents:900,merchant_unique_id:'ref',review_allowed:false,review_reason:'Not permitted',refund_status:'submitted'}; await sendPurchaseNotices('one','live'); expect(state.sends[1]?.[0]).toBe('matchup-rejection'); expect(state.sends[1]?.[2].templateData.details).toContainEqual({label:'Refund status',value:'Refund requested, not yet confirmed'}); expect(state.sends[1]?.[2].templateData.details).toContainEqual({label:'Reason',value:'Not permitted'}) })
it('contact sends reply to sender and copy only to owner', async () => { state.rows['support_threads']={channel:'contact',status:'answered',email:'sender@example.com',name:'Sam',message:'Question',ai_reply:'Approved policy'}; await sendContactNotices('thread1'); expect(state.sends.map(s=>[s[0],s[1]])).toEqual([['contact-reply','sender@example.com'],['contact-owner','hello@tugg.lol']]) })
it('owner alerts allow only genuine categories and safe internal references', async () => { expect((await sendOwnerAlert('promotion' as any,'one','live')).sent).toBe(false); await sendOwnerAlert('dispute','order1','live'); expect(state.sends[0]?.[1]).toBe('hello@tugg.lol'); expect(JSON.stringify(state.sends)).not.toContain('payment_id') })
it('weekly summary separates environment and derives conversion from stored counts', async () => { await sendWeeklySummary(new Date('2026-11-09T08:00:15Z')); expect(state.sends[0]?.[0]).toBe('weekly-summary'); expect(state.sends[0]?.[2].templateData.details).toContainEqual({label:'live gross revenue',value:'$5.00 USD'}); expect(state.sends[0]?.[2].templateData.details).toContainEqual({label:'live 7-day funnel viewed → opened → completed',value:'10 → 5 → 2; viewed-to-completed 20.0%'}) })
it('Monday window uses 08:00 UTC and seven days', () => { expect(weeklyWindow(new Date('2026-11-09T08:00:30Z'))).toEqual({from:'2026-11-02T08:00:00.000Z',to:'2026-11-09T08:00:00.000Z',id:'2026-11-09'}) })
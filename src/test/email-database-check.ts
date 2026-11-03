// Run explicitly with bun; uses service-only existing event records, never sends email.
import { supabaseAdmin as db } from '../integrations/supabase/client.server'
import { strict as assert } from 'node:assert'
const prefix = `notice-db-check-${crypto.randomUUID()}`
const ids: string[] = []
async function claim(key: string, recipient: string, template = 'contact-reply', owner = false) {
  const r = await db.rpc('claim_tugg_notice', { p_key: key, p_recipient: recipient, p_template: template, p_owner: owner })
  if (r.error) throw new Error('Claim failed')
  return r.data
}
async function outcome(key: string, status: string) {
  const r=await db.from('events').insert({kind:'app_notice_result',detail:{key,status,template:'contact-reply'}}).select('id').single()
  if (r.error || !r.data) throw new Error('Result failed')
  ids.push(r.data.id)
}
try {
  const recipient = crypto.randomUUID().replaceAll('-','').repeat(2)
  const key=`${prefix}:concurrent`
  const concurrent=await Promise.all(Array.from({length:10},()=>claim(key,recipient)))
  assert.equal(concurrent.filter(v=>v==='accepted').length,1)
  assert.equal(concurrent.filter(v=>v==='duplicate').length,9)
  await outcome(key,'sent')
  assert.equal(await claim(key,recipient),'duplicate')
  const capped=crypto.randomUUID().replaceAll('-','').repeat(2)
  for(let i=0;i<6;i++) assert.equal(await claim(`${prefix}:limit-${i}`,capped),'accepted')
  assert.equal(await claim(`${prefix}:limit-6`,capped),'rate_limited')
  const retryRecipient=crypto.randomUUID().replaceAll('-','').repeat(2), retry=`${prefix}:retry`
  for(let i=0;i<3;i++) { assert.equal(await claim(retry,retryRecipient),'accepted'); await outcome(retry,'send_failed') }
  assert.equal(await claim(retry,retryRecipient),'retry_cap')
  const alerts=crypto.randomUUID().replaceAll('-','').repeat(2)
  const existing=await db.from('events').select('id',{count:'exact',head:true}).eq('kind','app_notice_result').eq('detail->>template','owner-alert').eq('detail->>status','claimed').gt('created_at',new Date(Date.now()-3600000).toISOString())
  if(existing.error)throw new Error('Count failed')
  const remaining=Math.max(0,3-(existing.count??0))
  for(let i=0;i<remaining;i++)assert.equal(await claim(`${prefix}:alert-${i}`,alerts,'owner-alert',true),'accepted')
  assert.equal(await claim(`${prefix}:alert-extra`,alerts,'owner-alert',true),'rate_limited')
  console.log('Database checks passed: ten concurrent claims, duplicate suppression, six/hour recipient limit, three-attempt cap, three/hour owner-alert limit.')
} finally {
  const rows=await db.from('events').select('id').eq('kind','app_notice_result').like('detail->>key',`${prefix}%`)
  for(const row of rows.data??[])ids.push(row.id)
  for(const id of new Set(ids)) {
    const deleted=await db.from('events').delete().eq('id',id)
    if(deleted.error)throw new Error('Test cleanup failed')
  }
}
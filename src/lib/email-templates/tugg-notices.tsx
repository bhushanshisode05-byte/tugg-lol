import * as React from 'react'
import { Text, Link } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { EmailFrame, emailLink, emailText, EMAIL_COLORS } from './brand'

type Props = { heading?: string; paragraphs?: string[]; details?: { label: string; value: string }[]; link?: string; linkLabel?: string }
/** Transactional notices (receipts, refunds, replies, owner mail). Same site colours as every other Tugg email. */
export function Notice({ heading = 'Tugg', paragraphs = [], details = [], link, linkLabel = 'View on Tugg' }: Props) {
  const safeLink = link && /^https:\/\/tugg\.lol\//.test(link) ? link : undefined
  return <EmailFrame preview={heading} heading={heading} footer="Tugg · hello@tugg.lol">
    {paragraphs.map((text, i) => <Text key={i} style={emailText}>{text}</Text>)}
    {details.map((item, i) => <Text key={i} style={emailText}><strong style={{ color: EMAIL_COLORS.muted }}>{item.label}: </strong>{item.value}</Text>)}
    {safeLink && <Text style={emailText}><Link href={safeLink} style={emailLink}>{linkLabel}</Link></Text>}
  </EmailFrame>
}
const entry = (subject: string, heading: string): TemplateEntry => ({ component: Notice, subject, displayName: heading, previewData: { heading, paragraphs: ['Your Tugg update.'], details: [] } })
export const receipt = entry('Your Tugg purchase receipt', 'Purchase receipt')
export const rejection = entry('Your Tugg matchup and refund update', 'Matchup rejected')
export const contactReply = entry('Reply to your Tugg message', 'Your Tugg support reply')
export const contactOwner = { ...entry('New Tugg contact thread', 'Contact thread'), to: 'hello@tugg.lol' }
export const ownerAlert = { ...entry('Tugg payment issue needs review', 'Payment issue'), to: 'hello@tugg.lol' }
export const weekly = { ...entry('Tugg weekly owner summary', 'Weekly owner summary'), to: 'hello@tugg.lol' }
export const ownerTest = { ...entry('Tugg owner email setup test', 'Email setup test'), to: 'hello@tugg.lol' }

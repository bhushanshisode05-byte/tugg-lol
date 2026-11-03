import * as React from 'react'
import { Html, Head, Preview, Body, Container, Heading, Text, Link, Hr } from '@react-email/components'
import type { TemplateEntry } from './registry'

type Props = { heading?: string; paragraphs?: string[]; details?: { label: string; value: string }[]; link?: string; linkLabel?: string }
export function Notice({ heading = 'Tugg', paragraphs = [], details = [], link, linkLabel = 'View on Tugg' }: Props) {
  const safeLink = link && /^https:\/\/tugg\.lol\//.test(link) ? link : undefined
  return <Html lang="en"><Head /><Preview>{heading}</Preview><Body style={body}><Container style={container}>
    <Text style={brand}>Tugg</Text><Heading style={headingStyle}>{heading}</Heading>
    {paragraphs.map((text, i) => <Text key={i} style={textStyle}>{text}</Text>)}
    {details.map((item, i) => <Text key={i} style={textStyle}><strong>{item.label}: </strong>{item.value}</Text>)}
    {safeLink && <Text><Link href={safeLink} style={linkStyle}>{linkLabel}</Link></Text>}
    <Hr /><Text style={footer}>Tugg · hello@tugg.lol</Text>
  </Container></Body></Html>
}
const body = { backgroundColor: '#ffffff', color: '#202124', fontFamily: 'Arial, sans-serif' }
const container = { maxWidth: '560px', padding: '28px 20px', margin: '0 auto' }
const brand = { fontSize: '24px', fontWeight: '700', color: '#e53642' }
const headingStyle = { fontSize: '22px', lineHeight: '30px' }
const textStyle = { fontSize: '15px', lineHeight: '24px', overflowWrap: 'anywhere' as const }
const linkStyle = { color: '#bc2235' }
const footer = { fontSize: '12px', color: '#60646c' }
const entry = (subject: string, heading: string): TemplateEntry => ({ component: Notice, subject, displayName: heading, previewData: { heading, paragraphs: ['Your Tugg update.'], details: [] } })
export const receipt = entry('Your Tugg purchase receipt', 'Purchase receipt')
export const rejection = entry('Your Tugg matchup and refund update', 'Matchup rejected')
export const contactReply = entry('Reply to your Tugg message', 'Your Tugg support reply')
export const contactOwner = { ...entry('New Tugg contact thread', 'Contact thread'), to: 'hello@tugg.lol' }
export const ownerAlert = { ...entry('Tugg payment issue needs review', 'Payment issue'), to: 'hello@tugg.lol' }
export const weekly = { ...entry('Tugg weekly owner summary', 'Weekly owner summary'), to: 'hello@tugg.lol' }
export const ownerTest = { ...entry('Tugg owner email setup test', 'Email setup test'), to: 'hello@tugg.lol' }
// @vitest-environment node
import * as React from 'react'
import { render } from '@react-email/render'
import { expect, it } from 'vitest'
import { Notice } from '@/lib/email-templates/tugg-notices'
it('escapes hostile text and rejects unsafe links', async () => {
  const html=await render(<Notice paragraphs={['<script>alert(1)</script>']} details={[{label:'Name',value:'<img src=x onerror=alert(1)>'}]} link="javascript:alert(1)" />)
  expect(html).not.toContain('<script>alert(1)</script>')
  expect(html).not.toContain('<img src=x')
  expect(html).toContain('&lt;script&gt;')
  expect(html).not.toContain('javascript:')
})
it('draws every safe receipt link with its label and drops unsafe or empty ones', async () => {
  const html = await render(<Notice links={[
    { href: 'https://tugg.lol/pull/c0000000-0000-4000-8000-000000000001', label: 'See your pull card: Pizza vs Burgers' },
    { href: 'https://tugg.lol/m/cats-vs-dogs', label: 'View Cats vs Dogs on Tugg' },
    { href: 'https://evil.example/phish', label: 'Evil' },
    { href: 'https://tugg.lol/', label: ' ' },
  ]} />)
  expect(html).toContain('href="https://tugg.lol/pull/c0000000-0000-4000-8000-000000000001"')
  expect(html).toContain('See your pull card: Pizza vs Burgers')
  expect(html).toContain('href="https://tugg.lol/m/cats-vs-dogs"')
  expect(html).not.toContain('evil.example')
  expect(html).not.toContain('href="https://tugg.lol/"')
})

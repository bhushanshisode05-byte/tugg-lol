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
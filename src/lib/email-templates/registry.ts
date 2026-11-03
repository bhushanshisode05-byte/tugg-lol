import type { ComponentType } from 'react'
import { receipt, rejection, contactReply, contactOwner, ownerAlert, weekly, ownerTest } from './tugg-notices'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string
}

/**
 * Template registry — maps template names to their React Email components.
 * Import and register new templates here after creating them in this directory.
 *
 * Example:
 *   import { template as welcomeTemplate } from './welcome'
 *   // then add to TEMPLATES: 'welcome': welcomeTemplate
 */
export const TEMPLATES: Record<string, TemplateEntry> = {
  'purchase-receipt': receipt,
  'matchup-rejection': rejection,
  'contact-reply': contactReply,
  'contact-owner': contactOwner,
  'owner-alert': ownerAlert,
  'weekly-summary': weekly,
  'owner-test': ownerTest,
}

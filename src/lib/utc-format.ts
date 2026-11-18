const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * A stored timestamp as people read it, always in UTC and always labelled: "18 November 2026, 00:44 UTC".
 * Email recipients are worldwide and we never know their timezone, so nothing is localised.
 * Returns null for a missing or unreadable value so callers can omit the line rather than print raw text.
 */
export function formatUtcDateTime(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  // Postgres may hand back "2026-11-18 00:44:10.019322+00"; normalise to a form every JS engine parses.
  const d = value instanceof Date ? value : new Date(String(value).trim().replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

/** Matches raw ISO-8601 dates/timestamps, which must never appear in customer- or owner-facing text. */
export const RAW_ISO_DATE = /\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2})?/;

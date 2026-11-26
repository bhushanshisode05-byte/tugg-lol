import { usd } from "@/components/tugg/Rope";
import { matchupImagePath, pullImagePath, type CardSize } from "@/lib/og/card";
import { EMPTY_ROUND_TEXT } from "@/lib/rounds";

export type ShareInput = {
  slug: string;
  title: string;
  /** All-time totals (cents) let an empty round's text lead with history instead of "$0 vs $0". */
  sides: { name: string; all_time_cents?: number }[];
  a: number;
  b: number;
  /** Score-derived cache key for the live matchup card (see cardVersion). */
  v?: string | null | undefined;
  /** Set on the post-payment receipt: share this person's permanent pull card instead of the live card. */
  pull?: { id: string; count: number; sideName: string } | undefined;
};

export const SHARE_CHANNELS = ["native", "copy", "x", "whatsapp", "facebook", "linkedin", "image_save", "share_error"] as const;

/** Receipt shares use the personal pull card; everywhere else uses the live, score-versioned matchup card. */
export const shareImagePath = (m: Pick<ShareInput, "slug" | "v" | "pull">, size: CardSize) =>
  m.pull ? pullImagePath(m.pull.id, size) : matchupImagePath(m.slug, size, m.v);

export const shareUrl = (siteUrl: string, slug: string) => `${siteUrl.replace(/\/$/, "")}/m/${slug}`;

/** Pre-written text from real round totals (cents); first person for a personal pull card. */
export const shareText = (m: ShareInput) =>
  m.pull
    ? `I pulled ${m.pull.count} for ${m.pull.sideName} on Tugg: ${m.sides[0]?.name} ${usd(m.a)} vs ${m.sides[1]?.name} ${usd(m.b)}. Pull your side.`
    : m.a === 0 && m.b === 0
      ? emptyRoundText(m)
      : `${m.title} is live on Tugg: ${m.sides[0]?.name} ${usd(m.a)} vs ${m.sides[1]?.name} ${usd(m.b)}. Pull your side.`;

function emptyRoundText(m: ShareInput) {
  const [a, b] = m.sides;
  const ta = a?.all_time_cents ?? 0, tb = b?.all_time_cents ?? 0;
  return ta + tb > 0
    ? `${m.title} on Tugg: ${EMPTY_ROUND_TEXT} All-time: ${a?.name} ${usd(ta)} vs ${b?.name} ${usd(tb)}.`
    : `${m.title} on Tugg: ${EMPTY_ROUND_TEXT}`;
}

export function shareLinks(text: string, url: string) {
  const e = encodeURIComponent;
  return [
    { channel: "x", label: "X", href: `https://x.com/intent/post?text=${e(text)}&url=${e(url)}` },
    { channel: "whatsapp", label: "WhatsApp", href: `https://wa.me/?text=${e(`${text} ${url}`)}` },
    { channel: "facebook", label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${e(url)}` },
    { channel: "linkedin", label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${e(url)}` },
  ] as const;
}


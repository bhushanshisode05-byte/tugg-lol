import { usd } from "@/components/tugg/Rope";

export type ShareInput = { slug: string; title: string; sides: { name: string }[]; a: number; b: number };

export const shareUrl = (siteUrl: string, slug: string) => `${siteUrl.replace(/\/$/, "")}/m/${slug}`;

/** Pre-written text from the current real round totals (cents). */
export const shareText = (m: ShareInput) =>
  `${m.title} is live on Tugg: ${m.sides[0]?.name} ${usd(m.a)} vs ${m.sides[1]?.name} ${usd(m.b)}. Pull your side.`;

export function shareLinks(text: string, url: string) {
  const e = encodeURIComponent;
  return [
    { channel: "x", label: "X", href: `https://x.com/intent/post?text=${e(text)}&url=${e(url)}` },
    { channel: "whatsapp", label: "WhatsApp", href: `https://wa.me/?text=${e(`${text} ${url}`)}` },
    { channel: "facebook", label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${e(url)}` },
    { channel: "linkedin", label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${e(url)}` },
    { channel: "reddit", label: "Reddit", href: `https://www.reddit.com/submit?url=${e(url)}&title=${e(text)}` },
    { channel: "telegram", label: "Telegram", href: `https://t.me/share/url?url=${e(url)}&text=${e(text)}` },
  ] as const;
}

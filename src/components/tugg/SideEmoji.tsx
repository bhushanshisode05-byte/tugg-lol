import { useEffect, useRef, useState } from "react";
import { emojiArtUrl, looksLikeEmoji } from "@/lib/emoji-art";

/**
 * A side's emoji drawn as the same Noto Color Emoji artwork the share cards use, sized in em so it sits like a character.
 * Falls back to the plain character when the emoji has no Noto file or the image fails to load.
 */
export function SideEmoji({ emoji }: { emoji: string }) {
  const url = emoji && looksLikeEmoji(emoji) ? emojiArtUrl(emoji, "svg") : null;
  const [failed, setFailed] = useState<string | null>(null);
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    // An error during server-rendered load fires before React attaches onError; catch it after hydration.
    const img = ref.current;
    if (url && img && img.complete && img.naturalWidth === 0) setFailed(url);
  }, [url]);
  if (!url || failed === url) return <span>{emoji}</span>;
  return (
    <img
      ref={ref}
      src={url}
      alt={emoji}
      width={72}
      height={72}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailed(url)}
      data-emoji-art
      className="inline-block h-[1.1em] w-[1.1em] align-[-0.15em]"
    />
  );
}

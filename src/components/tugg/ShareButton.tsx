import { useState } from "react";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { trackShare, SHARE_CHANNELS } from "@/lib/recap.functions";
import { shareText, shareUrl, shareLinks, type ShareInput } from "@/lib/share";

type Channel = (typeof SHARE_CHANNELS)[number];

export function ShareButton({ m, siteUrl, className = "" }: { m: ShareInput; siteUrl: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const url = shareUrl(siteUrl || (typeof window !== "undefined" ? window.location.origin : ""), m.slug);
  const text = shareText(m);
  const track = (channel: Channel) => void trackShare({ data: { slug: m.slug, channel } }).catch(() => {});

  const onTrigger = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const phone = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
    if (phone && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: m.title, text, url });
        track("native");
      } catch {
        /* user cancelled */
      }
      return;
    }
    setOpen(true);
  };

  const links = shareLinks(text, url);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={onTrigger}
          onPointerDown={(e) => e.preventDefault()}
          aria-label={`Share ${m.title}`}
          className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-bold hover:border-primary ${className}`}
        >
          <Share2 className="h-4 w-4" /> Share
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {links.map((l) => (
          <DropdownMenuItem key={l.channel} asChild>
            <a href={l.href} target="_blank" rel="noopener noreferrer" onClick={() => track(l.channel)} className="cursor-pointer py-2">
              {l.label}
            </a>
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem
          className="cursor-pointer py-2"
          onSelect={async () => {
            try {
              await navigator.clipboard.writeText(`${text} ${url}`);
              toast.success("Link copied");
            } catch {
              toast.error("Couldn't copy. Long-press the address bar instead.");
            }
            track("copy");
          }}
        >
          Copy link
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

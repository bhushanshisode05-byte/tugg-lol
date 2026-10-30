import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { trackShare, SHARE_CHANNELS } from "@/lib/recap.functions";
import { shareText, shareUrl, shareLinks, APP_COPY_NOTICE, APP_DESTINATIONS, type ShareInput } from "@/lib/share";
import { Button } from "@/components/ui/button";
import { getShareCountry } from "@/lib/share-country.functions";
import { showTikTok } from "@/lib/share-country";

type Channel = (typeof SHARE_CHANNELS)[number];

export function ShareButton({ m, siteUrl, className = "" }: { m: ShareInput; siteUrl: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [nativeAvailable, setNativeAvailable] = useState(false);
  const [timeZone, setTimeZone] = useState<string>();
  useEffect(() => {
    setNativeAvailable(typeof navigator.share === "function");
    try { setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone); } catch { /* unknown */ }
  }, []);
  const countryQuery = useQuery({ queryKey: ["share-country"], queryFn: () => getShareCountry(), enabled: open, staleTime: Infinity, retry: false });
  const url = shareUrl(siteUrl || (typeof window !== "undefined" ? window.location.origin : ""), m.slug);
  const text = shareText(m);
  const track = (channel: Channel) => void trackShare({ data: { slug: m.slug, channel } }).catch(() => {});

  const copyForApp = async (channel: "instagram" | "tiktok") => {
    // Reserve a tab during the click so awaiting the clipboard cannot trigger popup blocking.
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    track(channel);
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      toast.success(APP_COPY_NOTICE);
      const destination = APP_DESTINATIONS[channel];
      if (tab) tab.location.replace(destination);
      else window.open(destination, "_blank", "noopener,noreferrer");
    } catch {
      tab?.close();
      toast.error("Couldn't copy. Please try again.");
    }
  };

  const links = shareLinks(text, url);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label={`Share ${m.title}`}
          className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-bold hover:border-primary ${className}`}
        >
          <Share2 className="h-4 w-4" /> Share
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {nativeAvailable && (
          <DropdownMenuItem className="cursor-pointer py-2" onSelect={async () => {
            try {
              await navigator.share({ title: m.title, text, url });
              track("native");
            } catch { /* user cancelled or share unavailable */ }
          }}>
            More apps...
          </DropdownMenuItem>
        )}
        <DropdownMenuItem className="cursor-pointer py-2" onSelect={() => void copyForApp("instagram")}>
          Instagram
        </DropdownMenuItem>
        {!countryQuery.isPending && showTikTok(countryQuery.data?.country, timeZone) && (
          <DropdownMenuItem className="cursor-pointer py-2" onSelect={() => void copyForApp("tiktok")}>
            TikTok
          </DropdownMenuItem>
        )}
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

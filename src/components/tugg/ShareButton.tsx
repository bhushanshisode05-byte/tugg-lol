import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from "@/components/ui/dropdown-menu";
import { CARD_SIZES, CARD_SIZE_LABELS, matchupImagePath, type CardSize } from "@/lib/og/card";
import { trackShare, SHARE_CHANNELS } from "@/lib/recap.functions";
import { shareText, shareUrl, shareLinks, APP_COPY_NOTICE, APP_DESTINATIONS, type ShareInput } from "@/lib/share";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { sharePhoneImage, PHONE_SAVE_NOTICES, shareFailureName, isShareCancelled, type PhonePlatform } from "@/lib/phone-share";
import { getShareCountry } from "@/lib/share-country.functions";
import { showTikTok } from "@/lib/share-country";

type Channel = (typeof SHARE_CHANNELS)[number];

export function ShareButton({ m, siteUrl, className = "" }: { m: ShareInput; siteUrl: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [nativeAvailable, setNativeAvailable] = useState(false);
  const [timeZone, setTimeZone] = useState<string>();
  const [isPhone, setIsPhone] = useState(false);
  const [savedNotice, setSavedNotice] = useState<"image" | PhonePlatform | null>(null);
  const story = useRef<Promise<Blob | null> | null>(null);
  const trackShareFn = useServerFn(trackShare);
  useEffect(() => {
    setNativeAvailable(typeof navigator.share === "function");
    setIsPhone(window.matchMedia("(pointer: coarse)").matches && window.matchMedia("(max-width: 1024px)").matches);
    try { setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone); } catch { /* unknown */ }
  }, []);
  const countryQuery = useQuery({ queryKey: ["share-country"], queryFn: () => getShareCountry(), enabled: open, staleTime: Infinity, retry: false });
  const url = shareUrl(siteUrl || (typeof window !== "undefined" ? window.location.origin : ""), m.slug);
  const text = shareText(m);
  const track = (channel: Channel) => void trackShareFn({ data: { slug: m.slug, channel } }).catch(() => {});
  const logFailure = (errorName: string) => void trackShareFn({ data: { slug: m.slug, channel: "share_error", errorName: shareFailureName({ name: errorName }) } }).catch(() => {});

  const fetchImage = (size: CardSize) =>
    fetch(matchupImagePath(m.slug, size)).then((r) => {
      if (!r.ok) throw new DOMException("Image unavailable", "NetworkError");
      return r.blob();
    });
  // Fetch the story image as soon as the menu opens so the share sheet opens within the tap.
  useEffect(() => {
    if (open && isPhone && !story.current) story.current = fetchImage("story").catch(() => null);
    if (!open) story.current = null;
  }, [open, isPhone]); // eslint-disable-line react-hooks/exhaustive-deps

  const download = (blob: Blob, filename: string) => {
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 10000);
  };

  const shareImage = async (platform?: PhonePlatform) => {
    if (platform) track(platform);
    const result = await sharePhoneImage({
      slug: m.slug, title: m.title, text, url,
      copy: (value) => navigator.clipboard.writeText(value),
      image: async () => (await story.current) ?? fetchImage("story"),
      canShare: (data) => typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare(data),
      share: (data) => navigator.share(data),
      save: download,
      failure: logFailure,
    });
    if (result === "shared") track("image_share");
    if (result === "saved") {
      track("image_save");
      setSavedNotice(platform ?? "image");
    }
    if (result === "failed") toast.error("Couldn't copy the link or save the image. Please try again.");
  };

  const saveImage = async (size: CardSize) => {
    try {
      const blob = await fetchImage(size);
      download(blob, `tugg-${m.slug}-${size}.png`);
      track("image_save");
      toast.success(
        isPhone
          ? "Image saved. Open Instagram, TikTok or any app and add it from your photos or files."
          : "Image saved. Upload it to any post, story or message.",
      );
    } catch (error) {
      if (isShareCancelled(error)) return;
      logFailure(shareFailureName(error));
      toast.error("Couldn't create the image. Please try again.");
    }
  };

  const saveMenu = (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="cursor-pointer py-2">Save image</DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {(Object.keys(CARD_SIZES) as CardSize[]).map((size) => (
          <DropdownMenuItem key={size} className="cursor-pointer py-2" onSelect={() => void saveImage(size)}>
            {CARD_SIZE_LABELS[size]}
            <span className="ml-auto pl-3 font-mono text-xs text-muted-foreground">{CARD_SIZES[size].join("×")}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );

  const copyForApp = async (channel: "instagram" | "tiktok") => {
    if (isPhone) { await shareImage(channel); return; }
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
    } catch (error) {
      tab?.close();
      if (isShareCancelled(error)) return;
      logFailure(shareFailureName(error));
      toast.error("Couldn't copy. Please try again.");
    }
  };

  const links = shareLinks(text, url);
  return (
    <>
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
      <DropdownMenuContent align="end" className="w-52">
        {isPhone && (
          <DropdownMenuItem className="cursor-pointer py-2 font-bold" onSelect={() => void shareImage()}>
            Share image
          </DropdownMenuItem>
        )}
        {nativeAvailable && (
          <DropdownMenuItem className="cursor-pointer py-2" onSelect={async () => {
            try {
              await navigator.share({ title: m.title, text, url });
              track("native");
            } catch (error) { if (!isShareCancelled(error)) logFailure(shareFailureName(error)); }
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
            } catch (error) {
              if (isShareCancelled(error)) return;
              logFailure(shareFailureName(error));
              toast.error("Couldn't copy. Long-press the address bar instead.");
            }
            track("copy");
          }}
        >
          Copy link
        </DropdownMenuItem>
        {saveMenu}
      </DropdownMenuContent>
    </DropdownMenu>
    <Dialog open={savedNotice !== null} onOpenChange={(value) => { if (!value) setSavedNotice(null); }}>
      <DialogContent className="max-w-sm">
        <DialogTitle>Image saved and link copied</DialogTitle>
        <DialogDescription>{savedNotice ? PHONE_SAVE_NOTICES[savedNotice] : ""}</DialogDescription>
        <Button onClick={() => {
          if (savedNotice && savedNotice !== "image") window.open(APP_DESTINATIONS[savedNotice], "_blank", "noopener,noreferrer");
          setSavedNotice(null);
        }}>{savedNotice === "instagram" ? "Open Instagram" : savedNotice === "tiktok" ? "Open TikTok" : "Done"}</Button>
      </DialogContent>
    </Dialog>
    </>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from "@/components/ui/dropdown-menu";
import { CARD_SIZES, CARD_SIZE_LABELS, matchupImagePath, type CardSize } from "@/lib/og/card";
import { trackShare, SHARE_CHANNELS } from "@/lib/recap.functions";
import { shareText, shareUrl, shareLinks, type ShareInput } from "@/lib/share";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { sharePhoneImage, PHONE_SAVE_NOTICE, shareFailureName, isShareCancelled } from "@/lib/phone-share";

type Channel = (typeof SHARE_CHANNELS)[number];

const fetchImage = async (slug: string, size: CardSize) => {
  const response = await fetch(matchupImagePath(slug, size));
  if (!response.ok) throw new DOMException("Image unavailable", "NetworkError");
  return response.blob();
};
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

export function ShareButton({ m, siteUrl, className = "" }: { m: ShareInput; siteUrl: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [nativeAvailable, setNativeAvailable] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const story = useRef<{ key: string; blob: Blob | null; pending: Promise<Blob> } | null>(null);
  const imageKey = `${m.slug}:${m.a}:${m.b}`;
  const preload = useCallback(() => {
    if (story.current?.key === imageKey) return story.current.pending;
    const entry = { key: imageKey, blob: null as Blob | null, pending: fetchImage(m.slug, "story") };
    story.current = entry;
    void entry.pending.then((blob) => { entry.blob = blob; }, () => {
      if (story.current === entry) story.current = null;
    });
    return entry.pending;
  }, [imageKey, m.slug]);
  useEffect(() => {
    const available = typeof navigator.share === "function";
    setNativeAvailable(available);
    if (!available || !button.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void preload().catch(() => {});
    });
    observer.observe(button.current.closest("article") ?? button.current);
    return () => observer.disconnect();
  }, [preload]);
  const trackShareFn = useServerFn(trackShare);
  const url = shareUrl(siteUrl, m.slug);
  const text = shareText(m);
  const track = (channel: Channel) => void trackShareFn({ data: { slug: m.slug, channel } }).catch(() => {});
  const logFailure = (errorName: string) => void trackShareFn({ data: { slug: m.slug, channel: "share_error", errorName: shareFailureName({ name: errorName }) } }).catch(() => {});

  const nativeShare = async () => {
    // No await before sharePhoneImage: navigator.share executes during this exact tap.
    const result = await sharePhoneImage({
      slug: m.slug, title: m.title, text, url,
      copy: (value) => navigator.clipboard.writeText(value),
      image: story.current?.key === imageKey ? story.current.blob : null,
      loadImage: preload,
      canShare: (data) => typeof navigator.canShare === "function" && navigator.canShare(data),
      share: (data) => navigator.share(data),
      save: download, failure: logFailure,
    });
    if (result === "shared") track("native");
    if (result === "saved") { track("image_save"); setSavedNotice(true); }
    if (result === "failed") toast.error("Couldn't copy the link or save the image. Please try again.");
  };
  const saveImage = async (size: CardSize) => {
    try {
      download(await fetchImage(m.slug, size), `tugg-${m.slug}-${size}.png`);
      track("image_save");
      toast.success("Image saved. Upload it to any post, story or message.");
    } catch (error) {
      if (isShareCancelled(error)) return;
      logFailure(shareFailureName(error));
      toast.error("Couldn't create the image. Please try again.");
    }
  };
  const shareButton = (
    <Button ref={button} variant="outline" type="button"
      onPointerDown={() => { if (typeof navigator.share === "function") void preload().catch(() => {}); }}
      onClick={(e) => {
        e.stopPropagation();
        if (typeof navigator.share === "function") { e.preventDefault(); void nativeShare(); }
      }}
      aria-label={`Share ${m.title}`}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-bold hover:border-primary ${className}`}>
      <Share2 className="h-4 w-4" /> Share
    </Button>
  );
  return <>
    {nativeAvailable ? shareButton : <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>{shareButton}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem className="cursor-pointer py-2" onSelect={async () => {
          try { await navigator.clipboard.writeText(`${text} ${url}`); toast.success("Link copied"); }
          catch (error) {
            if (isShareCancelled(error)) return;
            logFailure(shareFailureName(error));
            toast.error("Couldn't copy. Long-press the address bar instead.");
          }
          track("copy");
        }}>Copy link</DropdownMenuItem>
        {shareLinks(text, url).map((link) => <DropdownMenuItem key={link.channel} asChild>
          <a href={link.href} target="_blank" rel="noopener noreferrer" onClick={() => track(link.channel)} className="cursor-pointer py-2">{link.label}</a>
        </DropdownMenuItem>)}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="cursor-pointer py-2">Save image</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {(Object.keys(CARD_SIZES) as CardSize[]).map((size) => <DropdownMenuItem key={size} className="cursor-pointer py-2" onSelect={() => void saveImage(size)}>
              {CARD_SIZE_LABELS[size]}<span className="ml-auto pl-3 font-mono text-xs text-muted-foreground">{CARD_SIZES[size].join("×")}</span>
            </DropdownMenuItem>)}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>}
    <Dialog open={savedNotice} onOpenChange={setSavedNotice}>
      <DialogContent className="max-w-sm">
        <DialogTitle>Image saved and link copied</DialogTitle>
        <DialogDescription>{PHONE_SAVE_NOTICE}</DialogDescription>
        <Button onClick={() => setSavedNotice(false)}>Done</Button>
      </DialogContent>
    </Dialog>
  </>;
}

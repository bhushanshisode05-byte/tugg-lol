import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cropSideImage } from "@/lib/side-image-browser";
import { RIGHTS_NOTICE } from "@/lib/side-image";
export type DraftSideImage = { blob: Blob; preview: string; rights: boolean };
export function SideImageField({
  label,
  color,
  value,
  onChange,
}: {
  label: string;
  color: string;
  value?: DraftSideImage | undefined;
  onChange: (v: DraftSideImage | undefined) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [zoom, setZoom] = useState(1);
  const [x, setX] = useState(50);
  const [y, setY] = useState(50);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const callback = useRef(onChange);
  callback.current = onChange;
  const rights = useRef(value?.rights ?? false);
  rights.current = value?.rights ?? false;
  useEffect(() => {
    if (!file) return;
    let stopped = false;
    let url: string | undefined;
    setBusy(true);
    cropSideImage(file, zoom, x, y)
      .then((blob) => {
        if (stopped) return;
        url = URL.createObjectURL(blob);
        callback.current({ blob, preview: url, rights: rights.current });
        setError("");
      })
      .catch((e) => {
        if (!stopped) {
          setError(e instanceof Error ? e.message : "Could not read picture.");
          callback.current(undefined);
        }
      })
      .finally(() => {
        if (!stopped) setBusy(false);
      });
    return () => {
      stopped = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file, zoom, x, y]);
  return (
    <div className="mt-4 border-t border-border pt-3">
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label={`Add image for ${label}`}
        className="sr-only"
        onChange={(e) => {
          setZoom(1);
          setX(50);
          setY(50);
          rights.current = false;
          callback.current(undefined);
          setFile(e.target.files?.[0] ?? null);
        }}
      />
      <div className="flex items-center gap-3">
        {value && (
          <img
            src={value.preview}
            width={64}
            height={64}
            alt={`${label} crop preview`}
            className="h-16 w-16 rounded-full border-2 object-cover"
            style={{ borderColor: color }}
          />
        )}
        <Button variant="outline" onClick={() => input.current?.click()} disabled={busy}>
          <ImagePlus />
          {value ? "Change image" : "Add image"}
        </Button>
        {file && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Remove ${label} image`}
            title="Remove image"
            onClick={() => {
              setFile(null);
              onChange(undefined);
              setError("");
              if (input.current) input.current.value = "";
            }}
          >
            <X />
          </Button>
        )}
      </div>
      {value && (
        <div className="mt-3 space-y-2">
          {(
            [
              ["Zoom", zoom, setZoom, 1, 3, 0.05],
              ["Horizontal crop", x, setX, 0, 100, 1],
              ["Vertical crop", y, setY, 0, 100, 1],
            ] as const
          ).map(([name, v, set, min, max, step]) => (
            <label key={name} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-24 shrink-0">{name}</span>
              <input
                type="range"
                aria-label={`${label} ${name}`}
                value={v}
                min={min}
                max={max}
                step={step}
                onChange={(e) => set(Number(e.target.value))}
                className="min-w-0 flex-1 accent-primary"
              />
            </label>
          ))}
          <label className="flex items-start gap-2 text-xs leading-relaxed">
            <input
              type="checkbox"
              checked={value.rights}
              required
              onChange={(e) => onChange({ ...value, rights: e.target.checked })}
              className="mt-1 accent-primary"
            />
            {RIGHTS_NOTICE}
          </label>
        </div>
      )}
      {busy && (
        <p className="mt-2 text-xs text-muted-foreground" role="status">
          Preparing picture…
        </p>
      )}
      {error && (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

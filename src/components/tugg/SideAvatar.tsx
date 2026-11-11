import { useState } from "react";
import { imageVisible, sideImagePath } from "@/lib/side-image";
import { SIDE_IMAGES_ENABLED } from "@/lib/feature-flags";
import { SideEmoji } from "./SideEmoji";
export function SideAvatar({
  side,
  size = "sm",
}: {
  side?:
    | {
        name: string;
        emoji: string;
        color?: string;
        image_id?: string | null;
        image_status?: string | null;
        image_preview?: string | undefined;
      }
    | undefined;
  size?: "sm" | "lg";
}) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!side) return null;
  const src =
    SIDE_IMAGES_ENABLED && (side.image_preview ||
    (imageVisible(side) && side.image_id ? sideImagePath(side.image_id) : null));
  const dimensions = size === "lg" ? "h-10 w-10 text-4xl" : "h-7 w-7 text-xl";
  return (
    <span className={`inline-flex shrink-0 items-center justify-center align-middle ${dimensions}`}>
      {src && failed !== src ? (
        <img
          src={src}
          alt={side.name}
          width={size === "lg" ? 40 : 28}
          height={size === "lg" ? 40 : 28}
          loading="lazy"
          onError={() => setFailed(src)}
          className="h-full w-full rounded-full border-2 object-cover"
          style={{ borderColor: side.color }}
        />
      ) : (
        <SideEmoji emoji={side.emoji} />
      )}
    </span>
  );
}

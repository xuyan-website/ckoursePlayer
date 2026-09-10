import { useState } from "react";
import {
  CaretDownIcon as CaretDown,
  CameraIcon as Camera,
} from "@phosphor-icons/react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { ImageLightbox } from "./ImageLightbox";

interface CollapsibleImagesProps {
  imagePaths: string[];
  imgHeight?: string;
  rounded?: string;
  className?: string;
}

export function CollapsibleImages({
  imagePaths,
  imgHeight = "h-20",
  rounded = "rounded-md",
  className,
}: CollapsibleImagesProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (imagePaths.length === 0) return null;

  return (
    <div className={className}>
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center gap-1.5 font-sans text-[11px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <Camera className="size-3.5" />
        {t("noteEditor.images_other", { count: imagePaths.length })}
        <CaretDown
          className={cn("size-3 transition-transform", expanded && "rotate-180")}
        />
      </button>
      {expanded && (
        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
          {imagePaths.map((path, idx) => (
            <div
              key={idx}
              className={cn("overflow-hidden border border-border/50", rounded)}
            >
              <img
                src={convertFileSrc(path)}
                className={cn("w-full cursor-zoom-in object-cover", imgHeight)}
                onClick={() => setLightboxIndex(idx)}
                alt={`note-image-${idx}`}
              />
            </div>
          ))}
        </div>
      )}
      {lightboxIndex !== null && imagePaths[lightboxIndex] && (
        <ImageLightbox
          src={convertFileSrc(imagePaths[lightboxIndex])}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}

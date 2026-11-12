"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Loader2, Maximize2, Minimize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ViewerImage {
  label: string;
  url: string;
}

/**
 * Shows private document images (ID, selfie, certificate) over the page, so an
 * admin never leaves the console. The image fits the screen; clicking it (or
 * "Full size") shows it at its real size, scrollable. Arrow keys move between
 * images, Escape closes. `data-overlay-dialog` tells the drawer underneath to
 * leave the keyboard to this viewer.
 */
export function ImageViewer({
  images,
  index,
  onIndexChange,
  onClose,
}: {
  images: readonly ViewerImage[];
  /** Null when closed. */
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [fullSize, setFullSize] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "broken">("loading");
  const open = index !== null && images.length > 0;
  const current = open ? images[Math.min(index, images.length - 1)] : null;

  /* eslint-disable react-hooks/set-state-in-effect -- each image starts fitted and loading */
  useEffect(() => {
    setFullSize(false);
    setStatus("loading");
  }, [current?.url]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!open || index === null) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      } else if (e.key === "ArrowRight" && index! < images.length - 1) {
        onIndexChange(index! + 1);
      } else if (e.key === "ArrowLeft" && index! > 0) {
        onIndexChange(index! - 1);
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      previouslyFocused?.focus?.();
    };
  }, [open, index, images.length, onClose, onIndexChange]);

  if (!open || !current || index === null || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="ui-root theme-portal fixed inset-0 z-[210] flex flex-col bg-[rgba(10,12,16,0.94)] backdrop-blur-sm motion-safe:animate-[ui-fade-in_160ms_ease-out]"
      onClick={onClose}
      data-overlay-dialog=""
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={current.label}
        tabIndex={-1}
        className="flex min-h-0 flex-1 flex-col outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 text-[#fff]">
          <span className="text-[14px] font-semibold">{current.label}</span>
          {images.length > 1 && (
            <span className="text-[12px] text-[rgba(255,255,255,0.65)]">
              {index + 1} of {images.length}
            </span>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="border-[rgba(255,255,255,0.3)] bg-[rgba(255,255,255,0.12)] text-[#fff] hover:bg-[rgba(255,255,255,0.22)]"
              onClick={() => setFullSize((v) => !v)}
              disabled={status !== "ready"}
            >
              {fullSize ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
              {fullSize ? "Fit to screen" : "Full size"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-[rgba(255,255,255,0.3)] bg-[rgba(255,255,255,0.12)] text-[#fff] hover:bg-[rgba(255,255,255,0.22)]"
              onClick={onClose}
              aria-label="Close"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        <div className={cn("relative min-h-0 flex-1", fullSize ? "overflow-auto" : "flex items-center justify-center overflow-hidden px-14 pb-6")}>
          {status === "loading" && (
            <div className="absolute inset-0 flex items-center justify-center text-[rgba(255,255,255,0.75)]">
              <Loader2 className="size-6 animate-spin" aria-label="Loading image" />
            </div>
          )}
          {status === "broken" ? (
            <p role="alert" className="flex h-full items-center justify-center px-6 text-center text-[13px] text-[rgba(255,255,255,0.85)]">
              This file could not be shown. The link may have expired; close this and open it again.
            </p>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed Storage URL, not an optimizable static asset
            <img
              key={current.url}
              src={current.url}
              alt={current.label}
              onLoad={() => setStatus("ready")}
              onError={() => setStatus("broken")}
              onClick={() => status === "ready" && setFullSize((v) => !v)}
              className={cn(
                "select-none rounded-[6px] bg-[rgba(255,255,255,0.06)]",
                fullSize ? "m-auto max-w-none cursor-zoom-out" : "max-h-full max-w-full cursor-zoom-in object-contain",
                status !== "ready" && "invisible",
              )}
            />
          )}

          {images.length > 1 && !fullSize && (
            <>
              <button
                type="button"
                aria-label="Previous image"
                disabled={index === 0}
                onClick={() => onIndexChange(index - 1)}
                className="absolute left-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-[rgba(255,255,255,0.12)] text-[#fff] hover:bg-[rgba(255,255,255,0.22)] disabled:opacity-30"
              >
                <ChevronLeft className="size-5" />
              </button>
              <button
                type="button"
                aria-label="Next image"
                disabled={index === images.length - 1}
                onClick={() => onIndexChange(index + 1)}
                className="absolute right-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-[rgba(255,255,255,0.12)] text-[#fff] hover:bg-[rgba(255,255,255,0.22)] disabled:opacity-30"
              >
                <ChevronRight className="size-5" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

"use client";

import { useRef, useState } from "react";
import { X } from "lucide-react";

/** Fullscreen photo viewer: morphs from the grid thumbnail (matching `view-transition-name`,
 * wired up by the caller) and supports drag-to-dismiss — release past the threshold to close,
 * otherwise it springs back. */
export function PhotoLightbox({
  photoPath,
  photoId,
  alt,
  onClose,
}: {
  photoPath: string;
  photoId: string;
  alt: string;
  onClose: () => void;
}) {
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startYRef = useRef<number | null>(null);

  function handlePointerDown(e: React.PointerEvent<HTMLImageElement>) {
    startYRef.current = e.clientY;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLImageElement>) {
    if (startYRef.current === null) return;
    setDragY(e.clientY - startYRef.current);
  }

  function handlePointerUp() {
    setDragging(false);
    startYRef.current = null;
    if (Math.abs(dragY) > 120) {
      onClose();
    } else {
      setDragY(0);
    }
  }

  const dismissProgress = Math.min(Math.abs(dragY) / 300, 1);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ backgroundColor: `oklch(0 0 0 / ${0.85 * (1 - dismissProgress)})` }}
      onClick={onClose}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute right-4 top-4 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
        aria-label="Fechar"
      >
        <X className="size-5" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element -- plain <img> so drag transform +
          view-transition-name live directly on the transitioning element, no next/image layout math */}
      <img
        src={photoPath}
        alt={alt}
        className="max-h-[85vh] max-w-[90vw] touch-none rounded-lg object-contain select-none"
        style={{
          viewTransitionName: `cook-photo-${photoId}`,
          transform: `translateY(${dragY}px)`,
          transition: dragging ? "none" : "transform 0.25s ease-out",
          opacity: 1 - dismissProgress * 0.6,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

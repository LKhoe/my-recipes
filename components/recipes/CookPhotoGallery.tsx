"use client";

import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import Image from "next/image";
import { X, ImagePlus, Loader2 } from "lucide-react";
import { ALLOWED_MIME_TYPES, MAX_PHOTOS_PER_RECIPE } from "@/lib/image-constants";
import { PhotoLightbox } from "@/components/recipes/PhotoLightbox";
import { thumbnailSrc } from "@/lib/image-url";

type DocumentWithViewTransition = Document & {
  startViewTransition?: (callback: () => void) => void;
};

function withViewTransition(update: () => void) {
  const doc = document as DocumentWithViewTransition;
  if (doc.startViewTransition) doc.startViewTransition(() => flushSync(update));
  else update();
}

export type CookPhoto = {
  id: string;
  path: string;
  userId: string;
  userName: string | null;
  createdAt: string;
};

/** Circle-shared gallery of "I made this" photos — visible to everyone, deletable only by the uploader. */
export function CookPhotoGallery({
  recipeId,
  currentUserId,
  initialPhotos,
}: {
  recipeId: string;
  currentUserId: string;
  initialPhotos: CookPhoto[];
}) {
  const [photos, setPhotos] = useState(initialPhotos);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lightboxPhoto = photos.find((p) => p.id === lightboxId) ?? null;

  const ownCount = photos.filter((p) => p.userId === currentUserId).length;

  async function handleFiles(fileList: FileList | null) {
    if (!fileList) return;
    setError(null);
    const files = Array.from(fileList).slice(0, MAX_PHOTOS_PER_RECIPE - ownCount);

    setUploading(true);
    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/recipes/${recipeId}/cook-photos`, { method: "POST", body: formData });
      if (res.ok) {
        const created = await res.json();
        setPhotos((prev) => [
          { ...created, userId: currentUserId, userName: null, createdAt: new Date().toISOString() },
          ...prev,
        ]);
      } else {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "Falha ao enviar a foto.");
      }
    }
    setUploading(false);
  }

  async function handleDelete(photoId: string) {
    setError(null);
    const res = await fetch(`/api/recipes/${recipeId}/cook-photos/${photoId}`, { method: "DELETE" });
    if (res.ok) {
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
    } else {
      setError("Não foi possível remover a foto.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {photos.map((photo) => (
          <div key={photo.id} className="group relative size-24 overflow-hidden rounded-lg border border-border">
            <button
              type="button"
              className="absolute inset-0 cursor-zoom-in"
              onClick={() => withViewTransition(() => setLightboxId(photo.id))}
              aria-label="Ampliar foto"
            >
              <Image
                src={thumbnailSrc(photo.path)}
                alt=""
                fill
                className="object-cover transition-transform duration-200 group-hover:scale-105"
                unoptimized
                style={{ viewTransitionName: lightboxId === photo.id ? undefined : `cook-photo-${photo.id}` }}
              />
            </button>
            {photo.userId === currentUserId && (
              <button
                type="button"
                onClick={() => handleDelete(photo.id)}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white transition-opacity focus-visible:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100"
              >
                <X className="size-3" />
              </button>
            )}
            {photo.userName && (
              <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1 py-0.5 text-[10px] text-white">
                {photo.userName}
              </span>
            )}
          </div>
        ))}
        {ownCount < MAX_PHOTOS_PER_RECIPE && (
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="flex size-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-muted-foreground hover:bg-muted"
          >
            {uploading ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
            <span className="text-xs">Adicionar</span>
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_MIME_TYPES.join(",")}
        multiple
        className="hidden"
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {photos.length === 0 && !uploading && (
        <p className="text-xs text-muted-foreground">Ninguém enviou fotos ainda. Que tal ser o primeiro?</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {lightboxPhoto && (
        <PhotoLightbox
          photoId={lightboxPhoto.id}
          photoPath={`/api/uploads/${lightboxPhoto.path}`}
          alt=""
          onClose={() => withViewTransition(() => setLightboxId(null))}
        />
      )}
    </div>
  );
}

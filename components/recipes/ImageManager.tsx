"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Label } from "@/components/ui/label";
import { X, ImagePlus, Loader2 } from "lucide-react";
import { MAX_PHOTOS_PER_RECIPE } from "@/lib/image-constants";

export type UploadedImage = { id: string; path: string };

export function ImageManager({
  recipeId,
  images,
  onImagesChange,
  pendingFiles,
  onPendingFilesChange,
}: {
  /** Present in edit mode (recipe already exists) — new files upload immediately. */
  recipeId?: string;
  images: UploadedImage[];
  onImagesChange: (next: UploadedImage[]) => void;
  /** Create mode only — files staged locally, uploaded right after the recipe is created. */
  pendingFiles: File[];
  onPendingFilesChange: (next: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalCount = images.length + pendingFiles.length;

  async function handleFiles(fileList: FileList | null) {
    if (!fileList) return;
    setError(null);
    const files = Array.from(fileList).slice(0, MAX_PHOTOS_PER_RECIPE - totalCount);

    if (recipeId) {
      setUploading(true);
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(`/api/recipes/${recipeId}/images`, { method: "POST", body: formData });
        if (res.ok) {
          const created = await res.json();
          onImagesChange([...images, created]);
        } else {
          const body = await res.json().catch(() => null);
          setError(body?.error ?? "Falha ao enviar a imagem.");
        }
      }
      setUploading(false);
    } else {
      onPendingFilesChange([...pendingFiles, ...files]);
    }
  }

  async function handleRemoveUploaded(imageId: string) {
    if (!recipeId) return;
    setError(null);
    const res = await fetch(`/api/recipes/${recipeId}/images/${imageId}`, { method: "DELETE" });
    if (res.ok) {
      onImagesChange(images.filter((img) => img.id !== imageId));
    } else {
      setError("Não foi possível remover a foto.");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>Fotos</Label>
      <div className="flex flex-wrap gap-3">
        {images.map((img) => (
          <div key={img.id} className="group relative size-24 overflow-hidden rounded-lg border border-border">
            <Image src={`/api/uploads/${img.path}`} alt="" fill className="object-cover" unoptimized />
            <button
              type="button"
              onClick={() => handleRemoveUploaded(img.id)}
              className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
        {pendingFiles.map((file, index) => (
          <div key={index} className="group relative size-24 overflow-hidden rounded-lg border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL, not an optimizable remote asset */}
            <img src={URL.createObjectURL(file)} alt="" className="size-full object-cover" />
            <button
              type="button"
              onClick={() => onPendingFilesChange(pendingFiles.filter((_, i) => i !== index))}
              className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
        {totalCount < MAX_PHOTOS_PER_RECIPE && (
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
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple
        className="hidden"
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

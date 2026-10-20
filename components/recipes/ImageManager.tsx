"use client";

import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { Label } from "@/components/ui/label";
import { X, ImagePlus, Loader2, ClipboardPaste } from "lucide-react";
import { ALLOWED_MIME_TYPES, MAX_PHOTOS_PER_RECIPE } from "@/lib/image-constants";
import { thumbnailSrc } from "@/lib/image-url";

export type UploadedImage = { id: string; path: string };

const IMAGE_TYPE_EXTENSIONS: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

const noSubscription = () => () => {};

function isEditable(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA)$/.test(target.tagName));
}

/** Clipboard images have no useful name ("image.png"), so they get one the upload can carry. */
function clipboardFile(blob: Blob): File {
  const extension = IMAGE_TYPE_EXTENSIONS[blob.type] ?? "png";
  return new File([blob], `colada-${Date.now()}.${extension}`, { type: blob.type });
}

export function ImageManager({
  recipeId,
  images,
  onImagesChange,
  pendingFiles,
  onPendingFilesChange,
  remoteImageUrl,
  onRemoteImageRemove,
}: {
  /** Present in edit mode (recipe already exists) — new files upload immediately. */
  recipeId?: string;
  images: UploadedImage[];
  onImagesChange: (next: UploadedImage[]) => void;
  /** Create mode only — files staged locally, uploaded right after the recipe is created. */
  pendingFiles: File[];
  onPendingFilesChange: (next: File[]) => void;
  /** Create mode only — the imported page's or video's photo, attached first on save unless removed. */
  remoteImageUrl?: string | null;
  onRemoteImageRemove?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalCount = images.length + pendingFiles.length + (remoteImageUrl ? 1 : 0);

  // navigator.clipboard.read() is missing in older browsers and only exists on the client.
  const canReadClipboard = useSyncExternalStore(
    noSubscription,
    () => typeof navigator.clipboard?.read === "function",
    () => false,
  );

  // Ctrl/Cmd+V anywhere on the form adds a copied image. Pasting into a text field still pastes
  // text when the clipboard has some (copying from a page often carries both).
  const onPaste = useEffectEvent((event: ClipboardEvent) => {
    const data = event.clipboardData;
    if (!data) return;
    const files = Array.from(data.files).filter((f) => ALLOWED_MIME_TYPES.includes(f.type));
    if (files.length === 0) return;
    if (isEditable(event.target) && data.types.includes("text/plain")) return;
    event.preventDefault();
    void handleFiles(files.map(clipboardFile));
  });
  useEffect(() => {
    const listener = (event: ClipboardEvent) => onPaste(event);
    document.addEventListener("paste", listener);
    return () => document.removeEventListener("paste", listener);
  }, []);

  async function pasteFromClipboard() {
    setError(null);
    try {
      const items = await navigator.clipboard.read();
      const blobs: Blob[] = [];
      for (const item of items) {
        const type = item.types.find((t) => ALLOWED_MIME_TYPES.includes(t));
        if (type) blobs.push(await item.getType(type));
      }
      if (blobs.length === 0) {
        setError("Não há imagem na área de transferência. Copie uma foto e tente de novo.");
        return;
      }
      await handleFiles(blobs.map(clipboardFile));
    } catch {
      setError("O navegador não deixou ler a área de transferência. Tente colar com Ctrl+V (⌘V).");
    }
  }

  async function handleFiles(fileList: FileList | File[] | null) {
    if (!fileList) return;
    setError(null);
    const files = Array.from(fileList).slice(0, MAX_PHOTOS_PER_RECIPE - totalCount);
    if (files.length === 0) {
      setError(`Uma receita pode ter no máximo ${MAX_PHOTOS_PER_RECIPE} fotos.`);
      return;
    }

    if (recipeId) {
      setUploading(true);
      const added: UploadedImage[] = [];
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(`/api/recipes/${recipeId}/images`, { method: "POST", body: formData });
        if (res.ok) {
          const created = await res.json();
          added.push(created);
          onImagesChange([...images, ...added]);
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
        {remoteImageUrl && (
          <div className="group relative size-24 overflow-hidden rounded-lg border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element -- the source site's own photo, before it is re-hosted */}
            <img
              src={remoteImageUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="size-full object-cover"
              onError={(e) => (e.currentTarget.style.visibility = "hidden")}
            />
            <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5 text-center text-[10px] text-white">
              da importação
            </span>
            <button
              type="button"
              aria-label="Não usar a foto da importação"
              onClick={onRemoteImageRemove}
              className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white transition-opacity focus-visible:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100"
            >
              <X className="size-3" />
            </button>
          </div>
        )}
        {images.map((img) => (
          <div key={img.id} className="group relative size-24 overflow-hidden rounded-lg border border-border">
            <Image src={thumbnailSrc(img.path)} alt="" fill className="object-cover" unoptimized />
            <button
              type="button"
              onClick={() => handleRemoveUploaded(img.id)}
              className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white transition-opacity focus-visible:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100"
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
              className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white transition-opacity focus-visible:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100"
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
        {totalCount < MAX_PHOTOS_PER_RECIPE && canReadClipboard && (
          <button
            type="button"
            disabled={uploading}
            onClick={() => void pasteFromClipboard()}
            className="flex size-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-muted-foreground hover:bg-muted"
          >
            <ClipboardPaste className="size-5" />
            <span className="text-xs">Colar</span>
          </button>
        )}
      </div>
      {totalCount < MAX_PHOTOS_PER_RECIPE && (
        <p className="hidden text-xs text-muted-foreground pointer-fine:block">
          Dica: copie uma foto e cole aqui com Ctrl+V (⌘V no Mac).
        </p>
      )}
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
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

"use client";

import { useState } from "react";
import Image from "next/image";
import { Play } from "lucide-react";
import { parseYouTubeVideoId } from "@/lib/youtube-utils";

// The lite-youtube-embed pattern (SPEC §4.1): a thumbnail placeholder loads instantly; the
// heavy YouTube iframe (and its script payload) is only requested once the user clicks play.
export function YouTubeEmbed({ videoUrl }: { videoUrl: string }) {
  const [playing, setPlaying] = useState(false);
  const videoId = parseYouTubeVideoId(videoUrl);

  if (!videoId) return null;

  if (playing) {
    return (
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
        <iframe
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
          title="Vídeo da receita"
          allow="accelerate-compute; autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          className="size-full"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      className="group relative aspect-video w-full overflow-hidden rounded-2xl bg-black"
    >
      <Image
        src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
        alt="Miniatura do vídeo"
        fill
        unoptimized
        className="object-cover opacity-90 transition-opacity group-hover:opacity-100"
      />
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-white/90 shadow-soft-lg transition-transform group-hover:scale-110">
          <Play className="size-7 translate-x-0.5 fill-primary text-primary" />
        </span>
      </span>
    </button>
  );
}

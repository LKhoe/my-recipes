import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { DEFAULT_LLM_TIER, LLM_TIERS } from "@/lib/llm-tiers";
import {
  createImportBatch,
  getImportQueuePause,
  listImportBatches,
  MAX_BATCH_VIDEOS,
} from "@/lib/services/import-queue";

const bodySchema = z.object({
  title: z.string().max(300).nullable().default(null),
  tier: z.enum(LLM_TIERS).default(DEFAULT_LLM_TIER),
  videos: z
    .array(
      z.object({
        videoId: z.string().regex(/^[\w-]{6,20}$/),
        title: z.string().max(300),
        thumbnailUrl: z.string().url().nullable(),
      }),
    )
    .min(1)
    .max(MAX_BATCH_VIDEOS),
});

/**
 * The progress popup's data: the user's open batches with each video's status, and when the queue
 * resumes if it's paused because YouTube blocked the captions.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  return NextResponse.json({
    batches: await listImportBatches(session.user.id),
    pausedUntil: getImportQueuePause(),
  });
}

/** Queues the videos picked from a playlist; the server imports them one by one. */
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Escolha ao menos um vídeo para importar." }, { status: 400 });
  }

  const batch = await createImportBatch(session.user.id, parsed.data);
  return NextResponse.json(batch, { status: 201 });
}

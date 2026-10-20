import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { cancelImportBatch, dismissImportBatch, retryImportBatch } from "@/lib/services/import-queue";

const bodySchema = z.object({ action: z.enum(["cancel", "retry", "dismiss"]) });

const ACTIONS = { cancel: cancelImportBatch, retry: retryImportBatch, dismiss: dismissImportBatch };

/** cancel: drop the videos not started yet; retry: queue failed ones again; dismiss: close it. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  }

  const { id } = await params;
  const ok = await ACTIONS[parsed.data.action](session.user.id, id);
  if (!ok) {
    return NextResponse.json({ error: "Importação não encontrada." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

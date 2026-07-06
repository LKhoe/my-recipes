import { NextResponse } from "next/server";
import { headers } from "next/headers";
import fs from "fs/promises";
import { auth } from "@/lib/auth";
import { resolveUploadPath } from "@/lib/services/image";

const CONTENT_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { path: segments } = await params;
  const absolutePath = resolveUploadPath(segments);
  if (!absolutePath) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  const ext = absolutePath.slice(absolutePath.lastIndexOf("."));
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  try {
    const data = await fs.readFile(absolutePath);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }
}

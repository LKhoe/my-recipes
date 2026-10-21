import { NextResponse } from "next/server";
import { headers } from "next/headers";
import sharp from "sharp";
import { auth } from "@/lib/auth";
import { getObjectStream, isSafeObjectKey } from "@/lib/services/storage";

const CONTENT_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

// A recipe's own photos (`recipes/{recipeId}/{file}`) are public like the recipe pages. Anything
// deeper — cook photos under `recipes/{recipeId}/cooked/` — is the circle's.
const PUBLIC_KEY = /^recipes\/[^/]+\/[^/]+$/;

// Photos live in a private S3 bucket (lib/services/storage.ts); this route is the only way to
// reach them, so all but recipe photos stay behind the circle's login.
export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params;
  const key = segments.join("/");
  const contentType = CONTENT_TYPES[key.slice(key.lastIndexOf("."))];
  if (!isSafeObjectKey(key) || !contentType) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  if (!PUBLIC_KEY.test(key)) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
  }

  const object = await getObjectStream(key);
  if (!object) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  // `?format=jpeg`: the Echo Show's screens (lib/alexa/apl.ts) aren't documented to show WebP,
  // which is how uploads are stored. Recipe photos only, so the conversion can't be used on the
  // circle's private ones.
  if (new URL(request.url).searchParams.get("format") === "jpeg" && PUBLIC_KEY.test(key) && contentType !== "image/jpeg") {
    const input = Buffer.from(await new Response(object.body).arrayBuffer());
    const jpeg = await sharp(input).jpeg({ quality: 82 }).toBuffer();
    return new NextResponse(new Uint8Array(jpeg), {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(jpeg.length),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }

  return new NextResponse(object.body, {
    headers: {
      "Content-Type": contentType,
      ...(object.contentLength !== undefined && { "Content-Length": String(object.contentLength) }),
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}

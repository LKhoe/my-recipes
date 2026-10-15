import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { Readable } from "stream";
import { auth } from "@/lib/auth";
import { createBackupStream } from "@/lib/services/backup";
import { formatDateISO } from "@/lib/date-utils";

// A large photo library + dump can take a while to stream through pg_dump/tar/gzip.
export const maxDuration = 300;

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  // SPEC §4.9: "exports are logged".
  console.log(`[backup] Export requested by ${session.user.email} at ${new Date().toISOString()}`);

  const webStream = Readable.toWeb(createBackupStream() as Readable) as ReadableStream;
  const date = formatDateISO(new Date());

  return new NextResponse(webStream, {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="my-recipes-backup-${date}.tar.gz"`,
    },
  });
}

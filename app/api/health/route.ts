import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { checkBucket } from "@/lib/services/storage";

// Polled by the Docker healthcheck — reuses the app's pool instead of opening a connection per
// call. Also checks the photo bucket, so wrong S3 credentials fail the deploy instead of uploads.
export async function GET() {
  try {
    await Promise.all([db.execute(sql`SELECT 1`), checkBucket()]);
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "error" }, { status: 503 });
  }
}

import { NextResponse } from "next/server";
import pg from "pg";

export async function GET() {
  try {
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query("SELECT 1");
    await client.end();

    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "error" }, { status: 503 });
  }
}

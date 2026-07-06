import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

interface DatabaseCache {
  conn: ReturnType<typeof drizzle<typeof schema>> | null;
  promise: Promise<ReturnType<typeof drizzle<typeof schema>>> | null;
}

declare global {
  var dbCache: DatabaseCache | undefined;
}

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/my_recipes";

const cached: DatabaseCache = global.dbCache ?? { conn: null, promise: null };
global.dbCache = cached;

async function createConnection() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const client = postgres(DATABASE_URL, {
      max: 10,
      idle_timeout: 20,
    });
    cached.promise = Promise.resolve(drizzle(client, { schema }));
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

const db = await createConnection();

export { db };
export default createConnection;

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

let client: ReturnType<typeof postgres> | null = null;
let instance: Db | null = null;

export function getDb(): Db {
  if (!instance) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL não configurada. Copie .env.example para .env.");
    }
    client = postgres(url, {
      max: 10,
      prepare: false,
      onnotice: () => undefined,
    });
    instance = drizzle(client, { schema });
  }
  return instance;
}

export { schema };

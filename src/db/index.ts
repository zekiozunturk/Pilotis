import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const g = globalThis as unknown as { __pilotisPool?: Pool };
const pool = g.__pilotisPool ?? new Pool({ connectionString: process.env.DATABASE_URL });
if (process.env.NODE_ENV !== "production") g.__pilotisPool = pool;

export const db = drizzle(pool, { schema });
export { schema };

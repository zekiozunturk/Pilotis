import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "./index";
migrate(db, { migrationsFolder: "./drizzle" }).then(() => { console.log("Migration tamam"); process.exit(0); });

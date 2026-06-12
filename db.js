import pg from "pg";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dbUrl = process.env.DATABASE_URL;
let pool = null;

if (dbUrl) {
  console.log("Postgres DATABASE_URL detected. Initializing database pool...");
  pool = new pg.Pool({
    connectionString: dbUrl,
    ssl: dbUrl.includes("supabase.com") ? { rejectUnauthorized: false } : false
  });
} else {
  console.warn("WARNING: DATABASE_URL is not set. PostgreSQL-backed routes will be disabled.");
}

export { pool };

export async function query(text, params) {
  if (!pool) {
    throw new Error("Database pool is not initialized because DATABASE_URL is missing.");
  }
  return pool.query(text, params);
}

export async function withTransaction(fn) {
  if (!pool) {
    throw new Error("Database pool is not initialized because DATABASE_URL is missing.");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function runMigrations() {
  if (!pool) {
    console.log("Skipping database migrations (PostgreSQL not configured).");
    return;
  }

  try {
    console.log("Running PostgreSQL migrations...");
    const migrationsDir = path.join(__dirname, "migrations");
    
    // Ensure migrations directory exists
    await fs.mkdir(migrationsDir, { recursive: true });
    
    const files = await fs.readdir(migrationsDir);
    const sqlFiles = files.filter(f => f.endsWith(".sql")).sort();

    console.log(`Found ${sqlFiles.length} migration file(s) to process.`);

    for (const file of sqlFiles) {
      console.log(`Executing migration: ${file}`);
      const filePath = path.join(migrationsDir, file);
      const sql = await fs.readFile(filePath, "utf8");
      
      // Run each migration inside a transaction for safety
      await withTransaction(async (client) => {
        await client.query(sql);
      });
    }
    console.log("All PostgreSQL migrations executed successfully.");
  } catch (error) {
    console.error("Database migrations failed:", error.message);
  }
}

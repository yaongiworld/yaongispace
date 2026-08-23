/**
 * Apply pending migrations to whatever `DATABASE_URL` points at.
 *
 * Development rebuilds the schema from scratch on every test run, which is why
 * nothing like this existed until there was a production database to protect.
 * Production cannot work that way: the migrations are the only description of
 * the schema, and they have to be applied exactly once each, in order, without
 * anybody having to remember which ones already ran.
 *
 * So each file's name is recorded in `schema_migrations` as it is applied, and
 * a file already recorded is skipped. Running this twice is a no-op; running it
 * after adding migration 008 applies only 008.
 *
 * Each migration runs **inside a transaction**. A migration that fails halfway
 * leaves nothing behind, so the fix is to correct the file and run again rather
 * than to work out by hand which half of it landed.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const dir = join(import.meta.dirname, "..", "supabase", "migrations");
const db = new Client({
  connectionString: url,
  // Supabase terminates TLS with its own certificate chain; `pg` does not
  // bundle it. The connection is still encrypted.
  ssl: url.includes("localhost") || url.includes("127.0.0.1")
    ? undefined
    : { rejectUnauthorized: false },
});

await db.connect();

await db.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename    text PRIMARY KEY,
    applied_at  timestamptz NOT NULL DEFAULT now()
  )
`);

const { rows: done } = await db.query("SELECT filename FROM schema_migrations");
const applied = new Set(done.map((r) => r.filename));

const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
const pending = files.filter((f) => !applied.has(f));

if (pending.length === 0) {
  console.log(`nothing to apply — ${files.length} migrations already recorded`);
} else {
  for (const file of pending) {
    process.stdout.write(`applying ${file} … `);
    const sql = await readFile(join(dir, file), "utf8");
    try {
      await db.query("BEGIN");
      await db.query(sql);
      await db.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
      await db.query("COMMIT");
      console.log("ok");
    } catch (error) {
      await db.query("ROLLBACK").catch(() => {});
      console.log("failed");
      console.error(error);
      process.exit(1);
    }
  }
  console.log(`applied ${pending.length} migration(s)`);
}

await db.end();

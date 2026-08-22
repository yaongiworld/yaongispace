/**
 * Apply the migrations to the development database and seed the two of us.
 *
 * The test database rebuilds itself on every run; this one persists, so it
 * needs setting up once. Re-running is safe: it stops early if a Person
 * already exists rather than making a third.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "pg";

const url =
  process.env.DATABASE_URL ??
  "postgresql://postgres:yaongi@127.0.0.1:54330/postgres";

const db = new Client({ connectionString: url });
await db.connect();

const existing = await db.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'");
if (existing.rows[0].n === 0) {
  const dir = join(import.meta.dirname, "..", "supabase", "migrations");
  for (const file of (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort()) {
    process.stdout.write(`applying ${file}\n`);
    await db.query(await readFile(join(dir, file), "utf8"));
  }
} else {
  process.stdout.write("schema already present, skipping migrations\n");
}

const people = await db.query("SELECT count(*)::int AS n FROM person");
if (people.rows[0].n > 0) {
  process.stdout.write("already seeded\n");
} else {
  // The allowlist is a table, not a constant — these are the rows that would
  // admit us once a real Google OAuth client exists. Addresses are
  // placeholders; edit them to your own before signing in for real.
  const { rows } = await db.query(
    `INSERT INTO person (display_name) VALUES ('토위'), ('양초') RETURNING id, display_name`,
  );
  for (const p of rows) {
    const email = p.display_name === "토위" ? "towee@example.com" : "yangcho@example.com";
    await db.query(
      "INSERT INTO allowed_email (email, person_id, note) VALUES ($1, $2, $3)",
      [email, p.id, p.display_name],
    );
  }
  process.stdout.write(`seeded ${rows.map((r) => r.display_name).join(", ")}\n`);
}

// Printed so you can mint a session cookie without a Google round-trip.
const { rows } = await db.query("SELECT id, display_name FROM person ORDER BY display_name");
for (const p of rows) process.stdout.write(`${p.display_name}  ${p.id}\n`);

await db.end();

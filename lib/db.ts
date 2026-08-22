import { Pool } from "pg";

/**
 * The app's connection to Postgres.
 *
 * A single pool, reused across requests and across hot reloads in development
 * — Next re-evaluates modules on every edit, and a fresh pool each time
 * exhausts the database's connection slots within a few saves.
 *
 * Sign-in talks to Postgres directly rather than through a Supabase client
 * because the whole decision is one `sign_in_with_google` call, and that
 * function has to run before there is any session to authenticate a Supabase
 * request with. Supabase remains the host; this is the connection to it.
 */

const globalForDb = globalThis as unknown as { yaongiPool?: Pool };

export function db(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. See .env.example.");
  }

  globalForDb.yaongiPool ??= new Pool({ connectionString: url });
  return globalForDb.yaongiPool;
}

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "pg";

/**
 * Connection to the disposable test Postgres from `docker-compose.yml`.
 *
 * Deliberately not a mock. RLS, pgroonga's Korean segmentation and the Entry
 * triggers are the behaviour worth testing, and a mocked Supabase client
 * would assert only that we called it — not that any of them work.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:yaongi@127.0.0.1:54329/postgres";

export async function connect(): Promise<Client> {
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  try {
    await client.connect();
  } catch (cause) {
    throw new Error(
      `Could not reach the test database at ${TEST_DATABASE_URL}.\n` +
        `Start it with \`npm run db:up\` (needs Docker running).`,
      { cause },
    );
  }
  return client;
}

const MIGRATIONS_DIR = join(import.meta.dirname, "..", "supabase", "migrations");

/**
 * Apply every migration to a clean schema, and hand back a connection to it.
 *
 * The point of dropping and recreating `public` first is that a test run
 * proves the migrations themselves, not the accumulated state of whatever ran
 * against this database earlier. The container is disposable and shared, so a
 * run that depended on leftovers would pass locally and fail on a fresh
 * checkout — which is the failure mode a real-Postgres test exists to catch.
 *
 * Every `.sql` file in `supabase/migrations` is applied in filename order,
 * which is why they are numbered. Nothing here names an individual migration:
 * later tickets add files and inherit this for free.
 */
export async function migrate(): Promise<Client> {
  const client = await connect();

  await client.query("DROP SCHEMA IF EXISTS public CASCADE");
  await client.query("CREATE SCHEMA public");

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    throw new Error(`No migrations found in ${MIGRATIONS_DIR}`);
  }

  for (const file of files) {
    const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
    try {
      await client.query(sql);
    } catch (cause) {
      throw new Error(`Migration ${file} failed to apply.`, { cause });
    }
  }

  return client;
}

/**
 * Run `body` as if `person` were the signed-in Person, with RLS enforced.
 *
 * Tests connect as the database owner, who bypasses RLS entirely — so a
 * policy could be backwards and every test would still pass. This sets the
 * same JWT claim the app sets after sign-in and drops to a role that RLS
 * actually applies to, inside a transaction that always rolls back.
 *
 * Pass `null` to act as nobody, which is what an unauthenticated request is.
 */
export async function asPerson<T>(
  client: Client,
  person: string | null,
  body: () => Promise<T>,
): Promise<T> {
  await client.query("BEGIN");
  try {
    const claims = person === null ? "{}" : JSON.stringify({ person_id: person });
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [claims]);
    // `local` so the role reverts with the transaction.
    await client.query("SET LOCAL ROLE yaongi_signed_in");
    return await body();
  } finally {
    await client.query("ROLLBACK");
  }
}

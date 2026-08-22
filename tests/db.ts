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
  "postgresql://postgres:yaongi@127.0.0.1:54329/yaongispace_test";

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

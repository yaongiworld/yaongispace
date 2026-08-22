import type { PoolClient } from "pg";
import { db } from "@/lib/db";

/**
 * Run a unit of work as the signed-in Person, with RLS enforced.
 *
 * The app connects to Postgres as the owner, and **the owner bypasses every
 * policy**. That is fine for sign-in, which runs before there is a Person to be
 * — but for the photo routes it would mean the wall built in 002 and 006 is
 * never actually walked into. The policies would be tested (they are, via
 * `asPerson` in `tests/db.ts`) and then not used, which is the worst of both.
 *
 * So this does what the test harness does: sets the same JWT claim the policies
 * read, drops into `yaongi_signed_in`, and runs the work there. `SET LOCAL`
 * ties both to the transaction, so the connection cannot be handed back to the
 * pool still pretending to be somebody.
 *
 * The transaction is also what makes a multi-step import atomic — a Photo
 * written without its queue row settled would be a queue that disagrees with
 * the library.
 */
export async function asPerson<T>(
  personId: string,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ person_id: personId }),
    ]);
    await client.query("SET LOCAL ROLE yaongi_signed_in");

    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

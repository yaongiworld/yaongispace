import type { GoogleIdentity } from "./google";

/**
 * What happens after Google says who somebody is.
 *
 * This is the whole of the sign-in decision as the app sees it, and it is
 * deliberately thin: the rules live in the `sign_in_with_google` function in
 * migration 001, because deciding whether two simultaneous sign-ins are the
 * same person is something only the database can do atomically. A
 * check-then-insert here would occasionally produce two Persons for one human,
 * and it would do so rarely enough to reach production.
 */

/** Anything that can run a parameterised query — a `pg` Client or a pool. */
export interface Queryable {
  query<R extends Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: R[] }>;
}

/**
 * Admitted, or turned away.
 *
 * A discriminated union rather than a nullable Person id, so that a caller
 * cannot forget the refusal case — being refused is an ordinary outcome here,
 * not an error, and it has a page of its own.
 */
export type SignInResult =
  | { admitted: true; personId: string }
  | { admitted: false; reason: "not-allowlisted" };

/**
 * Resolve a completed Google sign-in to the Person it belongs to.
 *
 * Returns the Person on success. Returns a refusal — not a throw — when the
 * email is not on the allowlist, because a stranger arriving at the front door
 * is an expected event that deserves a warm Korean page rather than a stack
 * trace. Throwing is reserved for things that are actually broken.
 */
export async function completeGoogleSignIn(
  db: Queryable,
  identity: GoogleIdentity,
): Promise<SignInResult> {
  const { rows } = await db.query<{ person_id: string | null }>(
    "SELECT sign_in_with_google($1, $2, $3) AS person_id",
    [identity.subject, identity.email, identity.name],
  );

  const personId = rows[0]?.person_id ?? null;

  if (personId === null) {
    return { admitted: false, reason: "not-allowlisted" };
  }

  return { admitted: true, personId };
}

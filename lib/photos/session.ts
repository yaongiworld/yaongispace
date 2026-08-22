import { cookies } from "next/headers";
import { SESSION_COOKIE, readSessionValue } from "@/lib/auth/session";

/**
 * The signed-in Person, for the photo API routes.
 *
 * Every route here writes to somebody's library, so every one of them needs the
 * same first line. Factored out so that line cannot be *almost* right in one
 * place — an import endpoint that forgot it would let anyone on the internet
 * enqueue uploads into our archive.
 *
 * Returns null rather than throwing: an unauthenticated request is an ordinary
 * thing to receive, and the routes answer it with 401.
 */
export async function currentPersonId(): Promise<string | null> {
  const jar = await cookies();
  return readSessionValue(jar.get(SESSION_COOKIE)?.value);
}

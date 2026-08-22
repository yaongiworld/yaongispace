import { cookies } from "next/headers";
import { SESSION_COOKIE, readSessionValue } from "./session";

/**
 * Who is signed in, on the server.
 *
 * Ticket 02 mints the session cookie; nothing read it back until Letters
 * became the first section that has to know whose letters these are. This is
 * that reader, and it is deliberately the *only* one — a second place that
 * decodes the cookie is a second place that can get the answer wrong, and
 * "wrong" here means showing one of us the other's unsealed post.
 *
 * Returns the Person id, or null when the request carries no valid session.
 * Null is not an error: a signed-out visitor is an ordinary caller and the
 * page sends them to the front door.
 */
export async function currentPersonId(): Promise<string | null> {
  const jar = await cookies();
  return readSessionValue(jar.get(SESSION_COOKIE)?.value);
}

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The session cookie.
 *
 * Sessions effectively never expire, by decision: the phone's own lock screen
 * is the real boundary, and re-authing to look at your own photos is friction
 * with no security benefit for a two-person private app on personal devices.
 * So the cookie carries a ten-year lifetime and nothing renews it.
 *
 * It holds a Person id and a signature, and nothing else — no email, no Google
 * subject, no display name. A cookie is the wrong place to keep a copy of
 * anything the database already owns, because the copy is what goes stale.
 *
 * This is also the seam the "Yaongichu!" voice ritual attaches to later: a
 * greeting decorating a session that never lapsed, gating nothing.
 */

export const SESSION_COOKIE = "yaongi_session";

/**
 * Holds the random `state` value across the round-trip to Google, so the
 * callback can prove the code it receives belongs to a sign-in we started.
 * Without it anybody could feed our callback a code of their own and sign one
 * of us into their account.
 */
export const OAUTH_STATE_COOKIE = "yaongi_oauth_state";

/** Ten years. Not "forever" only because cookies cannot say forever. */
export const SESSION_MAX_AGE_SECONDS = 10 * 365 * 24 * 60 * 60;

/**
 * Only the variables these functions actually read, so a test can hand over a
 * two-line object instead of a whole environment. The index signature is what
 * makes `process.env` assignable to it.
 */
export type SessionEnv = { SESSION_SECRET?: string; [key: string]: string | undefined };

function secretFromEnv(env: SessionEnv = process.env): string {
  const secret = env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET must be set to at least 32 characters. See .env.example.",
    );
  }
  return secret;
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

/**
 * Mint a cookie value for a Person.
 *
 * Signed rather than encrypted: a Person id is not a secret, and what matters
 * is that a visitor cannot mint one for themselves.
 */
export function createSessionValue(
  personId: string,
  env: SessionEnv = process.env,
): string {
  return `${personId}.${sign(personId, secretFromEnv(env))}`;
}

/**
 * Read a Person id back out of a cookie, or null if it does not verify.
 *
 * Null covers every failure — malformed, truncated, forged — because from the
 * app's point of view they are the same event: this request is not signed in.
 */
export function readSessionValue(
  value: string | undefined,
  env: SessionEnv = process.env,
): string | null {
  if (!value) return null;

  const separator = value.lastIndexOf(".");
  if (separator <= 0) return null;

  const personId = value.slice(0, separator);
  const signature = value.slice(separator + 1);

  const expected = Buffer.from(sign(personId, secretFromEnv(env)));
  const actual = Buffer.from(signature);

  // Length must match before timingSafeEqual, which throws on a mismatch.
  if (expected.length !== actual.length) return null;
  if (!timingSafeEqual(expected, actual)) return null;

  return personId;
}

/** The cookie attributes a session is set with. */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  maxAge: SESSION_MAX_AGE_SECONDS,
  // Off on localhost, on everywhere else.
  secure: process.env.NODE_ENV === "production",
} as const;

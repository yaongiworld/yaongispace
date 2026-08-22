import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { googleAuthorizeUrl, googleConfigFromEnv } from "@/lib/auth/google";
import { OAUTH_STATE_COOKIE } from "@/lib/auth/session";

/**
 * Begin a sign-in: hand the visitor to Google.
 *
 * The `state` parameter is a random value stored in a short-lived cookie and
 * checked on the way back. Without it, anybody could feed our callback an
 * authorization code of their own choosing and sign one of us into *their*
 * account — a login CSRF, which is the one attack this flow is actually
 * exposed to.
 */

export async function GET() {
  const config = googleConfigFromEnv();
  const state = randomBytes(32).toString("base64url");

  const jar = await cookies();
  jar.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // Long enough to pick the right account, short enough not to linger.
    maxAge: 10 * 60,
    secure: process.env.NODE_ENV === "production",
  });

  return NextResponse.redirect(googleAuthorizeUrl(config, state));
}

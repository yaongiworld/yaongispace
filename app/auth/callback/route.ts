import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exchangeCodeForIdentity, googleConfigFromEnv } from "@/lib/auth/google";
import { completeGoogleSignIn } from "@/lib/auth/sign-in";
import {
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  createSessionValue,
} from "@/lib/auth/session";

/**
 * Where Google sends the visitor back.
 *
 * The whole of the flow, in order: check the state, exchange the code, resolve
 * a Person, set a session. Each step is somebody else's code — the interesting
 * decisions live in `lib/auth/google.ts` and in `sign_in_with_google`, and
 * this handler only sequences them and turns their outcomes into redirects.
 *
 * The two failure modes are deliberately different. A visitor who is simply
 * not one of us gets the warm refusal page; anything that is actually broken
 * gets sent back to the front door, because a stack trace on a public route is
 * both unfriendly and a small information leak.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const jar = await cookies();

  const expectedState = jar.get(OAUTH_STATE_COOKIE)?.value;
  jar.delete(OAUTH_STATE_COOKIE);

  // Google reports its own refusals here — the user tapping "cancel" on the
  // consent screen arrives with ?error=access_denied. Nothing went wrong;
  // they just changed their mind.
  if (url.searchParams.get("error")) {
    return NextResponse.redirect(new URL("/sign-in", url));
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(new URL("/sign-in", url));
  }

  let personId: string;
  try {
    const identity = await exchangeCodeForIdentity(googleConfigFromEnv(), code);
    const result = await completeGoogleSignIn(db(), identity);

    if (!result.admitted) {
      // Not one of us. A warm page, and no session.
      return NextResponse.redirect(new URL("/sign-in/refused", url));
    }
    personId = result.personId;
  } catch (error) {
    console.error("sign-in failed", error);
    return NextResponse.redirect(new URL("/sign-in", url));
  }

  const response = NextResponse.redirect(new URL("/", url));
  response.cookies.set(SESSION_COOKIE, createSessionValue(personId), {
    ...SESSION_COOKIE_OPTIONS,
  });
  return response;
}

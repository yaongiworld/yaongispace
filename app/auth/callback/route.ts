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
/**
 * The address the *browser* used, which is not always the one we received on.
 *
 * `request.url` is the URL as it arrived at the server. Behind a container or
 * a proxy that is the internal bind address — `http://0.0.0.0:3000` — so every
 * redirect built from it sends the browser to a host that, from the browser's
 * side, is either nothing or somebody else's dev server. It looks exactly like
 * a 404 on our own app.
 *
 * `GOOGLE_REDIRECT_URI` is the honest answer: it is already the canonical
 * public address of this route, it has to match the Cloud console exactly, and
 * it is the one URL Google itself was told to come back to. Falling back to
 * the request keeps this working if it is ever unset.
 */
function publicOrigin(request: NextRequest): URL {
  const configured = process.env.GOOGLE_REDIRECT_URI;
  if (configured) {
    try {
      return new URL(configured);
    } catch {
      // A malformed value should not take out sign-in; fall through.
    }
  }
  return new URL(request.url);
}

export async function GET(request: NextRequest) {
  const url = publicOrigin(request);
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
    /* The round-trip lost its state cookie, or somebody fed us a code of their
       own. Marked separately from an exchange failure because the causes are
       unrelated: this one is cookies (a domain that redirected mid-flow, an
       expired 10-minute window), not credentials. */
    const back = new URL("/sign-in", url);
    back.searchParams.set("error", "state");
    return NextResponse.redirect(back);
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
    /* Back to the front door, with a marker. The message itself is not shown —
       a stack trace on a public route is both unfriendly and a small
       information leak — but landing on a bare /sign-in with no explanation is
       indistinguishable from never having tried, which is precisely the state
       that is hard to debug. The marker says "it broke, look at the logs"
       rather than "nothing happened". */
    const back = new URL("/sign-in", url);
    back.searchParams.set("error", "exchange");
    return NextResponse.redirect(back);
  }

  const response = NextResponse.redirect(new URL("/", url));
  response.cookies.set(SESSION_COOKIE, createSessionValue(personId), {
    ...SESSION_COOKIE_OPTIONS,
  });
  return response;
}

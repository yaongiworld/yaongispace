/**
 * The Google boundary — the whole of it.
 *
 * Everything the app knows about Google is on this page: two scopes, one
 * redirect out, one identity back. It is kept this narrow deliberately, the
 * same way R2 and the AI APIs are, because it is the one part of sign-in that
 * cannot be tested without a live Google round-trip. Below this line is a
 * `GoogleIdentity` and ordinary Postgres, which is where every rule that
 * matters actually lives (see `sign-in.ts`).
 *
 * ADR-0005: Google is used for sign-in only.
 */

/**
 * The only scopes this app will ever request.
 *
 * `email` and `profile` are *non-sensitive*: no verification, no demo video, no
 * CASA assessment, and — the one that would actually hurt — no 7-day refresh
 * token fuse. The moment a sensitive scope is added (`calendar.events` is the
 * tempting one) that entire apparatus arrives with it, so this constant is a
 * decision and not a default. Photos never needed a scope at all: they arrive
 * by share target and Takeout, never by API.
 */
export const GOOGLE_SCOPES = ["email", "profile"] as const;

/**
 * Who Google says just signed in.
 *
 * This is the app's whole picture of a Google account, and the seam every test
 * below the boundary starts from. Note what is absent: no access token and no
 * refresh token. There is no Google API to call, so storing a token would be
 * keeping a credential we have no use for. When Calendar sync is eventually
 * picked up, API credentials get their own table with their own lifetime
 * rather than being read out of the auth session (ADR-0005).
 */
export interface GoogleIdentity {
  /**
   * The OAuth `sub` claim: Google's stable identifier for the account.
   *
   * This, not the email, is what a Credential is keyed on. An email can be
   * changed on a Google account; `sub` cannot.
   */
  subject: string;
  /** The account's email, used only to consult the allowlist. */
  email: string;
  /** The account's display name, used only to name a Person on first sign-in. */
  name: string | null;
}

/**
 * Where the Google configuration comes from.
 *
 * Read from the environment at the edge and never baked into the bundle — see
 * `.env.example`. Absent config is a startup-time failure rather than a
 * mysterious redirect loop at 11pm.
 */
export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  /** The URL Google returns to. Must match the Cloud console exactly. */
  redirectUri: string;
}

export function googleConfigFromEnv(env: NodeJS.ProcessEnv = process.env): GoogleConfig {
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  const redirectUri = env.GOOGLE_REDIRECT_URI;

  const missing = [
    ["GOOGLE_CLIENT_ID", clientId],
    ["GOOGLE_CLIENT_SECRET", clientSecret],
    ["GOOGLE_REDIRECT_URI", redirectUri],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(
      `Google sign-in is not configured: ${missing.join(", ")} missing. ` +
        `See .env.example.`,
    );
  }

  return {
    clientId: clientId as string,
    clientSecret: clientSecret as string,
    redirectUri: redirectUri as string,
  };
}

/**
 * The URL that starts a sign-in.
 *
 * `prompt=select_account` because two people share one phone often enough that
 * silently reusing whichever Google account the browser last saw is a real way
 * to sign in as the wrong yaongi.
 */
export function googleAuthorizeUrl(config: GoogleConfig, state: string): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

/**
 * Exchange the code Google sent back for the identity behind it.
 *
 * This is the only function in the app that talks to Google, and the only one
 * that cannot be tested without a live round-trip. Everything downstream takes
 * a `GoogleIdentity` and is ordinary, testable code — which is the entire
 * reason the boundary is drawn here.
 *
 * The `id_token` is a JWT that Google has just handed us over TLS from its own
 * token endpoint, in direct response to a code we generated. That is the
 * authorization-code flow's guarantee, so the claims are read without a second
 * signature check. (A token arriving by any other route — an implicit flow, or
 * one posted to us by a client — would have to be verified against Google's
 * JWKS. We never accept one that way.)
 */
export async function exchangeCodeForIdentity(
  config: GoogleConfig,
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleIdentity> {
  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    /* Google's body names the actual fault — `invalid_client` for a bad
       secret, `redirect_uri_mismatch` for a URI that does not match the Cloud
       console character for character, `invalid_grant` for a reused or expired
       code. Without it the status alone is 400 for all three, which is the
       difference between a one-line fix and an afternoon. It is safe to log:
       the body describes our configuration, and carries no user data and no
       part of the secret. */
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Google rejected the authorization code (${response.status}): ${detail.slice(0, 300)}`,
    );
  }

  const { id_token: idToken } = (await response.json()) as { id_token?: string };
  if (!idToken) {
    throw new Error("Google's token response carried no id_token.");
  }

  return identityFromIdToken(idToken);
}

/**
 * Read the claims out of a Google `id_token`.
 *
 * Exported so the shape of the parsing is testable without a network call. It
 * decodes; it does not verify — see the note above for why that is sound here
 * and where it would not be.
 */
export function identityFromIdToken(idToken: string): GoogleIdentity {
  const payload = idToken.split(".")[1];
  if (!payload) {
    throw new Error("Google's id_token was not a JWT.");
  }

  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
  };

  if (!claims.sub || !claims.email) {
    throw new Error("Google's id_token carried no subject or email.");
  }

  // An unverified email must never be matched against the allowlist: it would
  // let anybody claim one of our addresses on a Google account they made up.
  if (claims.email_verified === false) {
    throw new Error("Google reported this account's email as unverified.");
  }

  return {
    subject: claims.sub,
    email: claims.email,
    name: claims.name ?? null,
  };
}

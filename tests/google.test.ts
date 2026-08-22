import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
  GOOGLE_SCOPES,
  googleAuthorizeUrl,
  identityFromIdToken,
} from "@/lib/auth/google";

/**
 * The Google boundary.
 *
 * No network and no mock OAuth server. What is worth pinning here is the shape
 * of what we send and what we accept back — particularly the two rules that
 * would be security bugs if they drifted: the scopes stay non-sensitive, and
 * an unverified email is never trusted.
 */

const idToken = (claims: Record<string, unknown>) =>
  `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`;

test("only the two non-sensitive scopes are ever requested", () => {
  // ADR-0005. Adding a scope here brings verification, CASA and the 7-day
  // refresh-token fuse with it, so this is a decision and not a default.
  expect([...GOOGLE_SCOPES]).toEqual(["email", "profile"]);

  const url = new URL(
    googleAuthorizeUrl(
      { clientId: "id", clientSecret: "secret", redirectUri: "https://x/cb" },
      "state-123",
    ),
  );
  expect(url.searchParams.get("scope")).toBe("email profile");
  expect(url.searchParams.get("state")).toBe("state-123");
  // Two people share a phone; silently reusing the last Google account is a
  // real way to sign in as the wrong yaongi.
  expect(url.searchParams.get("prompt")).toBe("select_account");
});

test("an id_token becomes the identity behind it", () => {
  const identity = identityFromIdToken(
    idToken({ sub: "1234", email: "towee@example.com", email_verified: true, name: "토위" }),
  );
  expect(identity).toEqual({
    subject: "1234",
    email: "towee@example.com",
    name: "토위",
  });
});

test("an unverified email is refused", () => {
  // Otherwise anybody could claim one of our addresses on a Google account
  // they invented, and the allowlist would wave them straight through.
  expect(() =>
    identityFromIdToken(
      idToken({ sub: "1234", email: "towee@example.com", email_verified: false }),
    ),
  ).toThrow(/unverified/i);
});

test("a token missing its subject or email is refused", () => {
  expect(() => identityFromIdToken(idToken({ email: "towee@example.com" }))).toThrow();
  expect(() => identityFromIdToken(idToken({ sub: "1234" }))).toThrow();
  expect(() => identityFromIdToken("not-a-jwt")).toThrow();
});

test("the callback redirects to the browser's address, not the bind address", () => {
  // Inside a container `request.url` is http://0.0.0.0:3000/... — the address
  // the server listens on, not the one the browser typed. Redirects built
  // from it send you to a host that is somebody else's dev server or nothing
  // at all, which presents as a 404 on our own app after a *successful*
  // sign-in. Found exactly that way.
  const route = readFileSync(
    join(import.meta.dirname, "..", "app/auth/callback/route.ts"),
    "utf8",
  );
  expect(route).toContain("publicOrigin");
  expect(route).toContain("GOOGLE_REDIRECT_URI");
  // The bare form is what regressed; it may only appear as the fallback
  // inside the helper, never as the thing redirects are built from.
  expect(route).not.toMatch(/const url = new URL\(request\.url\)/);
});

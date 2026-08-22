import { expect, test } from "vitest";
import {
  SESSION_MAX_AGE_SECONDS,
  createSessionValue,
  readSessionValue,
} from "@/lib/auth/session";

/**
 * The session cookie.
 *
 * No database and no mocks — this is pure signing, and the property worth
 * proving is that a cookie cannot be forged. That is real behaviour, not a
 * stubbed collaborator, which is why these live beside the integration tests
 * rather than being the kind of unit test the workspace warns against.
 */

const env = { SESSION_SECRET: "x".repeat(48) };
const PERSON = "8f1c0f4e-1f2b-4c3d-9e5a-6b7c8d9e0f11";

test("a session round-trips to the Person it was minted for", () => {
  expect(readSessionValue(createSessionValue(PERSON, env), env)).toBe(PERSON);
});

test("a tampered Person id does not verify", () => {
  const forged = createSessionValue(PERSON, env).replace(PERSON, "somebody-else");
  expect(readSessionValue(forged, env)).toBeNull();
});

test("a cookie signed with another secret does not verify", () => {
  const elsewhere = { SESSION_SECRET: "y".repeat(48) };
  expect(readSessionValue(createSessionValue(PERSON, elsewhere), env)).toBeNull();
});

test("nonsense is simply not signed in", () => {
  for (const value of [undefined, "", ".", "no-dot", `${PERSON}.`]) {
    expect(readSessionValue(value, env)).toBeNull();
  }
});

test("a weak or missing secret is refused at the door", () => {
  expect(() => createSessionValue(PERSON, {})).toThrow(
    /SESSION_SECRET/,
  );
  expect(() =>
    createSessionValue(PERSON, { SESSION_SECRET: "short" }),
  ).toThrow(/SESSION_SECRET/);
});

test("a session effectively never expires", () => {
  // The phone's lock screen is the real boundary (ADR-0005 / ticket 005), so
  // this is a decision worth pinning: anything under a year means somebody has
  // quietly reintroduced a logout.
  expect(SESSION_MAX_AGE_SECONDS).toBeGreaterThan(365 * 24 * 60 * 60);
});

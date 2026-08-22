import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import type { Client } from "pg";
import { asPerson, migrate } from "./db";
import { completeGoogleSignIn } from "@/lib/auth/sign-in";
import type { GoogleIdentity } from "@/lib/auth/google";

/**
 * Sign-in, against the real database.
 *
 * Nothing here mocks Supabase. The three things worth proving — that the
 * allowlist admits and refuses, that one Google account resolves to one Person
 * forever, and that RLS keeps a Credential private — are all database
 * behaviour, and a mocked client would only assert that we called it.
 *
 * The Google round-trip is the one thing that is faked, because it is the one
 * thing that is not ours: `GoogleIdentity` is what Google hands back after a
 * successful sign-in, and every test below starts from the assumption that it
 * arrived. What Google does before that point is Google's to test.
 */

let db: Client;

const TOWEE = "towee@example.com";
const YANGCHO = "yangcho@example.com";
const STRANGER = "somebody-else@example.com";

const identity = (over: Partial<GoogleIdentity> = {}): GoogleIdentity => ({
  subject: "google-sub-1",
  email: TOWEE,
  name: "토위",
  ...over,
});

beforeAll(async () => {
  db = await migrate();
});

afterAll(async () => {
  await db?.end();
});

beforeEach(async () => {
  // Each test starts from an empty world with only the door configured, so no
  // test can depend on another having run first.
  await db.query("TRUNCATE person, credential, allowed_email CASCADE");
  await db.query(
    `INSERT INTO allowed_email (email, note) VALUES ($1, '토위'), ($2, '양초')`,
    [TOWEE, YANGCHO],
  );
});

test("an allowlisted email signs in and resolves to a Person", async () => {
  const result = await completeGoogleSignIn(db, identity());

  expect(result.admitted).toBe(true);
  if (!result.admitted) return;

  const { rows } = await db.query<{ display_name: string }>(
    "SELECT display_name FROM person WHERE id = $1",
    [result.personId],
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].display_name).toBe("토위");
});

test("a non-allowlisted account is refused and leaves nothing behind", async () => {
  const result = await completeGoogleSignIn(
    db,
    identity({ subject: "google-sub-stranger", email: STRANGER, name: "누군가" }),
  );

  expect(result.admitted).toBe(false);

  // Refusal must not be a half-open door: no Person, and no Credential that a
  // later change of the allowlist could quietly activate.
  const people = await db.query("SELECT 1 FROM person");
  expect(people.rowCount).toBe(0);
  const credentials = await db.query("SELECT 1 FROM credential");
  expect(credentials.rowCount).toBe(0);
});

test("signing in twice with the same Google account resolves to the same Person", async () => {
  const first = await completeGoogleSignIn(db, identity());
  const second = await completeGoogleSignIn(db, identity());

  expect(first.admitted && second.admitted).toBe(true);
  if (!first.admitted || !second.admitted) return;
  expect(second.personId).toBe(first.personId);

  const { rowCount } = await db.query("SELECT 1 FROM person");
  expect(rowCount).toBe(1);
});

test("a Google account that changed its email stays with the same Person", async () => {
  // The reason Credential keys on the OAuth subject and not the email. Google
  // lets you rename an address; that must not orphan four years of letters.
  const before = await completeGoogleSignIn(db, identity());
  const after = await completeGoogleSignIn(
    db,
    identity({ email: "towee-renamed@example.com" }),
  );

  expect(before.admitted && after.admitted).toBe(true);
  if (!before.admitted || !after.admitted) return;
  // Note the new address was never allowlisted: a known credential wins
  // outright, precisely so a rename cannot lock somebody out of their own life.
  expect(after.personId).toBe(before.personId);

  const { rowCount } = await db.query("SELECT 1 FROM person");
  expect(rowCount).toBe(1);
});

test("both of us sign in and get one Person each", async () => {
  const towee = await completeGoogleSignIn(db, identity());
  const yangcho = await completeGoogleSignIn(
    db,
    identity({ subject: "google-sub-2", email: YANGCHO, name: "양초" }),
  );

  expect(towee.admitted && yangcho.admitted).toBe(true);
  if (!towee.admitted || !yangcho.admitted) return;
  expect(yangcho.personId).not.toBe(towee.personId);

  const { rowCount } = await db.query("SELECT 1 FROM person");
  expect(rowCount).toBe(2);
});

test("the email is matched case-insensitively", async () => {
  // Google will hand back whatever the user typed. A case mismatch here would
  // be a lockout that looks exactly like a refusal.
  const result = await completeGoogleSignIn(db, identity({ email: "ToWeE@Example.COM" }));

  expect(result.admitted).toBe(true);
  const { rows } = await db.query<{ email: string }>("SELECT email FROM credential");
  expect(rows[0].email).toBe(TOWEE);
});

test("a second credential can attach to an existing Person", async () => {
  // ADR-0006: losing a Google account must cost a credential, never the data.
  // Admitting a replacement address to the same Person is one row.
  const first = await completeGoogleSignIn(db, identity());
  expect(first.admitted).toBe(true);
  if (!first.admitted) return;

  await db.query(`INSERT INTO allowed_email (email, person_id) VALUES ($1, $2)`, [
    "towee-backup@example.com",
    first.personId,
  ]);

  const second = await completeGoogleSignIn(
    db,
    identity({ subject: "google-sub-backup", email: "towee-backup@example.com" }),
  );

  expect(second.admitted).toBe(true);
  if (!second.admitted) return;
  expect(second.personId).toBe(first.personId);

  const people = await db.query("SELECT 1 FROM person");
  expect(people.rowCount).toBe(1);
  const credentials = await db.query("SELECT 1 FROM credential WHERE person_id = $1", [
    first.personId,
  ]);
  expect(credentials.rowCount).toBe(2);
});

test("removing an email from the allowlist does not fork an existing Person", async () => {
  const first = await completeGoogleSignIn(db, identity());
  expect(first.admitted).toBe(true);
  if (!first.admitted) return;

  await db.query("DELETE FROM allowed_email WHERE email = $1", [TOWEE]);

  const again = await completeGoogleSignIn(db, identity());
  expect(again.admitted).toBe(true);
  if (!again.admitted) return;
  expect(again.personId).toBe(first.personId);
});

test("a sign-in updates when the credential was last seen", async () => {
  await completeGoogleSignIn(db, identity());
  await db.query(
    "UPDATE credential SET last_seen_at = now() - interval '30 days' WHERE subject = 'google-sub-1'",
  );

  await completeGoogleSignIn(db, identity());

  const { rows } = await db.query<{ recent: boolean }>(
    "SELECT last_seen_at > now() - interval '1 minute' AS recent FROM credential",
  );
  expect(rows[0].recent).toBe(true);
});

test("RLS keeps a Credential to its owner and the door shut to everyone", async () => {
  const towee = await completeGoogleSignIn(db, identity());
  const yangcho = await completeGoogleSignIn(
    db,
    identity({ subject: "google-sub-2", email: YANGCHO, name: "양초" }),
  );
  expect(towee.admitted && yangcho.admitted).toBe(true);
  if (!towee.admitted || !yangcho.admitted) return;

  await asPerson(db, towee.personId, async () => {
    // We share everything, so both Persons are visible to a signed-in request.
    const people = await db.query("SELECT 1 FROM person");
    expect(people.rowCount).toBe(2);

    // A credential is not shared: it is the key to somebody's account.
    const mine = await db.query("SELECT 1 FROM credential");
    expect(mine.rowCount).toBe(1);

    // The allowlist is not part of the API surface at all.
    await expect(db.query("SELECT 1 FROM allowed_email")).rejects.toThrow(/permission/i);
  });

  // And nobody signed in sees nothing at all.
  await asPerson(db, null, async () => {
    const people = await db.query("SELECT 1 FROM person");
    expect(people.rowCount).toBe(0);
  });
});

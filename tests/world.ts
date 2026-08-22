import type { Client } from "pg";

/**
 * A small world to test against: two people and an empty archive.
 *
 * The two-people fixture is not incidental. Most of what is worth asserting
 * here — that a sealed Letter is invisible to its recipient, that News is
 * always the *other* person's doing, that a Note is editable only by its
 * author — is a statement about one Person seen from the other, and needs both
 * to exist before it can be tested at all.
 */

export const TOWEE_EMAIL = "towee@example.com";
export const YANGCHO_EMAIL = "yangcho@example.com";

/** Everything the migrations create, emptied, in dependency order. */
const TABLES = [
  "entry",
  "rendition",
  "photo",
  "visit",
  "letter",
  "note",
  "event",
  "place",
  "journey",
  "credential",
  "allowed_email",
  "person",
];

/**
 * Empty the archive so no test can depend on another having run first.
 *
 * `TRUNCATE ... CASCADE` fires no triggers, which is deliberate: it is the one
 * operation that should leave the Entry index empty rather than maintained,
 * so a test can prove the rebuild repairs it.
 */
export async function reset(db: Client): Promise<void> {
  await db.query(`TRUNCATE ${TABLES.join(", ")} CASCADE`);
}

export interface People {
  towee: string;
  yangcho: string;
}

/** Insert the two of us and hand back their Person ids. */
export async function twoPeople(db: Client): Promise<People> {
  const { rows } = await db.query<{ id: string; display_name: string }>(
    `INSERT INTO person (display_name) VALUES ('토위'), ('양초')
     RETURNING id, display_name`,
  );
  const find = (name: string) => {
    const row = rows.find((r) => r.display_name === name);
    if (!row) throw new Error(`fixture did not create ${name}`);
    return row.id;
  };
  return { towee: find("토위"), yangcho: find("양초") };
}

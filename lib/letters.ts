import type { QueryResultRow } from "pg";
import { asPerson as runAsPerson } from "./as-person";

/**
 * Reading and writing Letters.
 *
 * Every query here runs **as the signed-in Person**, not as the database
 * owner. That is the whole point of `asPerson` below and it is not a
 * formality: the owner bypasses RLS, so a letter sealed until 2036 would come
 * straight back from an owner query and the section would cheerfully render
 * it. The seal lives in the database (migrations 002 and 004) precisely so
 * that a forgotten `where` clause here cannot spoil something that has no
 * undo — and connecting as the owner would throw that protection away at the
 * first query.
 *
 * So this module composes no visibility rules of its own. There is no
 * `where unseal_at is null or unseal_at <= now()` anywhere below, deliberately:
 * that rule exists once, in `letter_visible`, and a second copy here would be
 * free to disagree with it.
 */

/** A Letter as the letterbox lists it. Never carries a sealed letter's row. */
export interface LetterSummary {
  id: string;
  title: string | null;
  /** A short opening, for the list. The body itself stays on the letter page. */
  preview: string;
  authorId: string;
  recipientId: string;
  authorName: string;
  occurredAt: Date;
  readAt: Date | null;
  unsealAt: Date | null;
}

/** A Letter as it is read. */
export interface Letter extends LetterSummary {
  body: string;
}

interface LetterRow {
  id: string;
  title: string | null;
  body: string;
  author_id: string;
  recipient_id: string;
  author_name: string;
  occurred_at: Date;
  read_at: Date | null;
  unseal_at: Date | null;
}

const toLetter = (row: LetterRow): Letter => ({
  id: row.id,
  title: row.title,
  body: row.body,
  preview: preview(row.body),
  authorId: row.author_id,
  recipientId: row.recipient_id,
  authorName: row.author_name,
  occurredAt: row.occurred_at,
  readAt: row.read_at,
  unsealAt: row.unseal_at,
});

/** The first line or so, for the letterbox. */
function preview(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > 60 ? `${flat.slice(0, 60)}…` : flat;
}

/**
 * Run `body` on a connection that RLS applies to, as `personId`.
 *
 * Two things happen here and both are load-bearing. The JWT claim is what
 * `current_person_id()` reads, and `SET LOCAL ROLE` is what makes the policies
 * apply at all — the owner is waved through every one of them, so setting the
 * claim without dropping the role would be theatre.
 *
 * `LOCAL` scopes both to the transaction, so a pooled connection cannot leak
 * one request's identity into the next. That is why this is a transaction even
 * for a single SELECT.
 */
async function asPerson<T>(
  personId: string,
  body: (query: QueryFn) => Promise<T>,
): Promise<T> {
  return runAsPerson(personId, (client) =>
    body(((sql: string, values?: unknown[]) => client.query(sql, values)) as QueryFn),
  );
}

/**
 * What the body of `asPerson` gets: `pg`'s query, narrowed to the two fields
 * this module reads. The cast at the call site is because `pg` constrains its
 * row type to `QueryResultRow` and the row interfaces here are plain shapes —
 * the constraint buys nothing and propagating it would spread `QueryResultRow`
 * through every signature in the file.
 */
type QueryFn = <R>(
  sql: string,
  values?: unknown[],
) => Promise<{ rows: R[]; rowCount: number | null }>;

const SELECT_LETTER = `
  SELECT l.id, l.title, l.body, l.author_id, l.recipient_id,
         p.display_name AS author_name,
         l.occurred_at, l.read_at, l.unseal_at
    FROM letter l
    JOIN person p ON p.id = l.author_id
`;

/**
 * Every Letter this Person may see, newest first.
 *
 * A letter sealed until a date is simply not in this list when it is not yet
 * time — not filtered out here, but absent from the query's results, because
 * RLS never showed it. The section renders what it is given and needs no rule
 * of its own.
 */
export async function lettersFor(personId: string): Promise<LetterSummary[]> {
  return asPerson(personId, async (query) => {
    const { rows } = await query<LetterRow>(
      `${SELECT_LETTER} ORDER BY l.occurred_at DESC`,
    );
    return rows.map(toLetter);
  });
}

/** One Letter, or null when it is not this Person's to see. */
export async function letterFor(
  personId: string,
  letterId: string,
): Promise<Letter | null> {
  return asPerson(personId, async (query) => {
    const { rows } = await query<LetterRow>(`${SELECT_LETTER} WHERE l.id = $1`, [
      letterId,
    ]);
    return rows[0] ? toLetter(rows[0]) : null;
  });
}

/**
 * Open a Letter, which is what seals it.
 *
 * The seal is `open_letter`'s to apply, not this function's — it decides
 * whether this opening is the one that counts (the recipient's, the first,
 * and only once the letter has unsealed). Reading the letter and sealing it
 * happen in the same transaction so a render that fails cannot leave a letter
 * marked read that nobody ever saw.
 */
export async function openLetter(
  personId: string,
  letterId: string,
): Promise<Letter | null> {
  return asPerson(personId, async (query) => {
    const { rows } = await query<LetterRow>(`${SELECT_LETTER} WHERE l.id = $1`, [
      letterId,
    ]);
    if (!rows[0]) return null;

    await query("SELECT open_letter($1)", [letterId]);

    // Re-read so the returned Letter carries the seal that was just applied.
    const { rows: after } = await query<LetterRow>(
      `${SELECT_LETTER} WHERE l.id = $1`,
      [letterId],
    );
    return after[0] ? toLetter(after[0]) : toLetter(rows[0]);
  });
}

/** What writing a Letter needs. The recipient is the other one of us. */
export interface Draft {
  title?: string | null;
  body: string;
  /** When it may be opened. Null is an ordinary letter. */
  unsealAt?: string | null;
  /** What the letter is about, when that is not today. */
  occurredAt?: string | null;
}

/**
 * 봉하기 — seal a Letter and put it in the other one's letterbox.
 *
 * The verb is sealing, never sending. Nothing is transmitted: both letters
 * live in the same archive and always did. What changes is that it is now
 * finished, and finishing it is the ceremony.
 */
export async function sealLetter(
  personId: string,
  recipientId: string,
  draft: Draft,
): Promise<string> {
  const body = draft.body.trim();
  if (!body) {
    throw new Error("빈 편지는 봉할 수 없어요");
  }

  return asPerson(personId, async (query) => {
    const { rows } = await query<{ id: string }>(
      `INSERT INTO letter (author_id, recipient_id, title, body, unseal_at, occurred_at)
       VALUES ($1, $2, $3, $4, $5, coalesce($6::timestamptz, now()))
       RETURNING id`,
      [
        personId,
        recipientId,
        draft.title?.trim() || null,
        body,
        draft.unsealAt || null,
        draft.occurredAt || null,
      ],
    );
    return rows[0].id;
  });
}

/**
 * Revise a Letter that has not been opened yet.
 *
 * Whether it may still be revised is the database's answer, not this
 * function's: `letter_stays_what_it_was` refuses the update once it has been
 * read. So this does not check `read_at` first — a check here would be a
 * second opinion, and the race between checking and writing is exactly the
 * window in which the recipient opens it.
 */
export async function reviseLetter(
  personId: string,
  letterId: string,
  draft: Draft,
): Promise<void> {
  const body = draft.body.trim();
  if (!body) {
    throw new Error("빈 편지는 봉할 수 없어요");
  }

  await asPerson(personId, async (query) => {
    await query(
      `UPDATE letter SET title = $2, body = $3, unseal_at = $4
        WHERE id = $1`,
      [letterId, draft.title?.trim() || null, body, draft.unsealAt || null],
    );
  });
}

/** The other one of us — who a Letter is addressed to. */
export async function theOtherPerson(
  personId: string,
): Promise<{ id: string; displayName: string } | null> {
  return asPerson(personId, async (query) => {
    const { rows } = await query<{ id: string; display_name: string }>(
      "SELECT id, display_name FROM person WHERE id <> $1 ORDER BY created_at LIMIT 1",
      [personId],
    );
    return rows[0] ? { id: rows[0].id, displayName: rows[0].display_name } : null;
  });
}

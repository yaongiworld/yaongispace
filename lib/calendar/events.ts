import { db } from "../db";

/**
 * Reading and writing Events.
 *
 * Every query here goes through migration 005's functions rather than hitting
 * `event` directly, so that the one piece of genuinely subtle logic — how
 * `repeats_yearly` becomes a date on the screen — has exactly one definition.
 * A page that filtered `event` by date itself would silently show no
 * anniversaries and look like it was working.
 *
 * The calendar is **shared**: no query here filters by Person, and none should.
 * `person_id` records who put a thing on the calendar, which News reads to show
 * you the other person's doing; it is not ownership and it grants nothing.
 */

/** One occurrence of an Event on one day. */
export interface Occurrence {
  id: string;
  title: string;
  description: string | null;
  /** When this occurrence lands — what the agenda sorts and groups by. */
  occursAt: Date;
  /** The row as stored, so "10주년" stays computable after a projection. */
  occurredAt: Date;
  endsAt: Date | null;
  allDay: boolean;
  repeatsYearly: boolean;
  /** True when this is a projected year rather than the stored date itself. */
  isRepeat: boolean;
  personId: string;
}

interface OccurrenceRow {
  id: string;
  title: string;
  description: string | null;
  occurs_at: Date;
  occurred_at: Date;
  ends_at: Date | null;
  all_day: boolean;
  repeats_yearly: boolean;
  is_repeat: boolean;
  person_id: string;
}

const toOccurrence = (row: OccurrenceRow): Occurrence => ({
  id: row.id,
  title: row.title,
  description: row.description,
  occursAt: row.occurs_at,
  occurredAt: row.occurred_at,
  endsAt: row.ends_at,
  allDay: row.all_day,
  repeatsYearly: row.repeats_yearly,
  isRepeat: row.is_repeat,
  personId: row.person_id,
});

/**
 * The agenda over a window, oldest first.
 *
 * Oldest-first because that is the direction the page reads: today at the top
 * of the viewport, tomorrow below it, and the past reachable by scrolling up.
 * Reversing it in the component would put yesterday under today.
 */
export async function occurrencesBetween(
  from: Date,
  to: Date,
): Promise<Occurrence[]> {
  const { rows } = await db().query<OccurrenceRow>(
    `SELECT id, title, description, occurs_at, occurred_at, ends_at,
            all_day, repeats_yearly, is_repeat, person_id
       FROM event_occurrences($1, $2)
      ORDER BY occurs_at, all_day DESC, title`,
    [from, to],
  );
  return rows.map(toOccurrence);
}

/**
 * The Events a Journey adopts, by date range.
 *
 * Opening a Journey shows the Events inside its span. Neither creates the
 * other — this reads dates and writes nothing, which is the whole mechanism
 * (ADR-0014). Exported here so the Photos section can call it when it builds
 * the Journey view; it belongs to the calendar because the projection does.
 */
export async function eventsInJourney(journeyId: string): Promise<Occurrence[]> {
  const { rows } = await db().query<OccurrenceRow>(
    `SELECT id, title, description, occurs_at, occurred_at, ends_at,
            all_day, repeats_yearly, is_repeat, person_id
       FROM journey_events($1)
      ORDER BY occurs_at, all_day DESC, title`,
    [journeyId],
  );
  return rows.map(toOccurrence);
}

/** What a Person may set on an Event. Everything else is the database's. */
export interface EventInput {
  title: string;
  description?: string | null;
  occurredAt: Date;
  endsAt?: Date | null;
  allDay?: boolean;
  repeatsYearly?: boolean;
}

/**
 * Put an Event on the calendar.
 *
 * `personId` records who added it — not who owns it. Both of us can edit and
 * delete either of our Events, which is what "shared by both" means and what
 * the RLS policy in 002 already says.
 */
export async function createEvent(
  personId: string,
  input: EventInput,
): Promise<string> {
  const { rows } = await db().query<{ id: string }>(
    `INSERT INTO event (title, description, occurred_at, ends_at, all_day, repeats_yearly, person_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [
      input.title.trim(),
      input.description?.trim() || null,
      input.occurredAt,
      input.endsAt ?? null,
      input.allDay ?? false,
      input.repeatsYearly ?? false,
      personId,
    ],
  );
  return rows[0].id;
}

/**
 * Edit an Event.
 *
 * `person_id` is deliberately not updatable: it says who put the thing on the
 * calendar, which is a fact about the past, and rewriting it when the other
 * person fixes a typo would quietly relabel whose doing it was in News.
 */
export async function updateEvent(id: string, input: EventInput): Promise<void> {
  await db().query(
    `UPDATE event
        SET title = $2, description = $3, occurred_at = $4,
            ends_at = $5, all_day = $6, repeats_yearly = $7
      WHERE id = $1`,
    [
      id,
      input.title.trim(),
      input.description?.trim() || null,
      input.occurredAt,
      input.endsAt ?? null,
      input.allDay ?? false,
      input.repeatsYearly ?? false,
    ],
  );
}

/**
 * Take an Event off the calendar.
 *
 * A real delete, not a tombstone. ADR-0013's immutability is about *photo
 * bytes* — a thing that cannot be regenerated. A calendar entry that turned
 * out to be wrong is meant to go away, and leaving tombstones would make the
 * agenda's emptiness untrustworthy. The Entry follows via the trigger in 003.
 */
export async function deleteEvent(id: string): Promise<void> {
  await db().query("DELETE FROM event WHERE id = $1", [id]);
}

/** One Event, for the edit form. */
export async function findEvent(id: string): Promise<Occurrence | null> {
  const { rows } = await db().query<OccurrenceRow>(
    `SELECT id, title, description, occurred_at AS occurs_at, occurred_at, ends_at,
            all_day, repeats_yearly, false AS is_repeat, person_id
       FROM event WHERE id = $1`,
    [id],
  );
  return rows[0] ? toOccurrence(rows[0]) : null;
}

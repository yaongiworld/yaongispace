import type { PoolClient } from "pg";
import { asPerson } from "@/lib/as-person";
import type { Cat, Couple } from "@/lib/couple";
import type { Day } from "./day";
import type { MoodId } from "./moods";

/**
 * 기분 · 퇴근 시간 · 한 줄 메모 — the three things a day holds per person.
 * Reads take a client already running as the signed-in Person; writes open
 * their own, and RLS keeps each of us to our own rows.
 */

export interface DayOf {
  mood: MoodId | null;
  leaveMinute: number | null;
  leftAt: Date | null;
  memo: string | null;
  /** Times they had some protein (migration 010). */
  protein: number;
}

const EMPTY: DayOf = { mood: null, leaveMinute: null, leftAt: null, memo: null, protein: 0 };

/** Both people's day, laid out by cat. */
export async function dayFor(
  client: PoolClient,
  couple: Couple,
  day: Day,
): Promise<Record<Cat, DayOf>> {
  const ids = [couple.yangcho?.id, couple.towee?.id].filter(Boolean) as string[];
  // One after another: these share a single client (one transaction), and
  // pg does not run two queries on one client at once.
  const moods = await client.query<{ person_id: string; mood: MoodId }>(
    "SELECT person_id, mood FROM day_mood WHERE day = $1 AND person_id = ANY($2)",
    [day, ids],
  );
  const offwork = await client.query<{ person_id: string; leave_minute: number | null; left_at: Date | null }>(
    "SELECT person_id, leave_minute, left_at FROM day_offwork WHERE day = $1 AND person_id = ANY($2)",
    [day, ids],
  );
  const memos = await client.query<{ person_id: string; body: string }>(
    "SELECT person_id, body FROM day_memo WHERE day = $1 AND person_id = ANY($2)",
    [day, ids],
  );

  const protein = await client.query<{ person_id: string; servings: number }>(
    "SELECT person_id, servings FROM day_protein WHERE day = $1 AND person_id = ANY($2)",
    [day, ids],
  );

  const of = (personId: string | undefined): DayOf => {
    if (!personId) return { ...EMPTY };
    const o = offwork.rows.find((r) => r.person_id === personId);
    return {
      mood: moods.rows.find((r) => r.person_id === personId)?.mood ?? null,
      leaveMinute: o?.leave_minute ?? null,
      leftAt: o?.left_at ?? null,
      memo: memos.rows.find((r) => r.person_id === personId)?.body ?? null,
      protein: protein.rows.find((r) => r.person_id === personId)?.servings ?? 0,
    };
  };

  return { yangcho: of(couple.yangcho?.id), towee: of(couple.towee?.id) };
}

export async function setMood(personId: string, day: Day, mood: MoodId): Promise<void> {
  await asPerson(personId, (c) =>
    c.query(
      `INSERT INTO day_mood (person_id, day, mood) VALUES ($1, $2, $3)
       ON CONFLICT (person_id, day) DO UPDATE
         SET mood = excluded.mood, updated_at = now()
       WHERE day_mood.mood IS DISTINCT FROM excluded.mood`,
      [personId, day, mood],
    ),
  );
}

export async function setLeaveMinute(personId: string, day: Day, minute: number): Promise<void> {
  await asPerson(personId, (c) =>
    c.query(
      `INSERT INTO day_offwork (person_id, day, leave_minute) VALUES ($1, $2, $3)
       ON CONFLICT (person_id, day) DO UPDATE
         SET leave_minute = excluded.leave_minute, updated_at = now()
       WHERE day_offwork.leave_minute IS DISTINCT FROM excluded.leave_minute`,
      [personId, day, minute],
    ),
  );
}

/** "회사에서 나왔어요" — once; pressing it again changes nothing. */
export async function markLeft(personId: string, day: Day): Promise<void> {
  await asPerson(personId, (c) =>
    c.query(
      `INSERT INTO day_offwork (person_id, day, left_at) VALUES ($1, $2, now())
       ON CONFLICT (person_id, day) DO UPDATE
         SET left_at = now(), updated_at = now()
       WHERE day_offwork.left_at IS NULL`,
      [personId, day],
    ),
  );
}

/** Take back "나왔어요" — a mis-tap should cost one tap to undo. */
export async function unmarkLeft(personId: string, day: Day): Promise<void> {
  await asPerson(personId, async (c) => {
    await c.query(
      `UPDATE day_offwork SET left_at = NULL, updated_at = now()
        WHERE person_id = $1 AND day = $2 AND leave_minute IS NOT NULL`,
      [personId, day],
    );
    await c.query(
      "DELETE FROM day_offwork WHERE person_id = $1 AND day = $2 AND leave_minute IS NULL",
      [personId, day],
    );
  });
}

/** One line for the day; an empty line removes it. */
export async function setMemo(personId: string, day: Day, body: string): Promise<void> {
  const line = body.replace(/\s+/g, " ").trim().slice(0, 80);
  await asPerson(personId, (c) =>
    line
      ? c.query(
          `INSERT INTO day_memo (person_id, day, body) VALUES ($1, $2, $3)
           ON CONFLICT (person_id, day) DO UPDATE SET body = excluded.body, updated_at = now()`,
          [personId, day, line],
        )
      : c.query("DELETE FROM day_memo WHERE person_id = $1 AND day = $2", [personId, day]),
  );
}

/** Most a day can count — a guard against a stuck finger, not a diet rule. */
export const MAX_PROTEIN = 20;

/**
 * 🥚 +1 (or −1 to undo a mis-tap). Clamped to 0…20 in one statement, so two
 * quick taps both land. Returns the new count.
 */
export async function addProtein(personId: string, day: Day, delta: 1 | -1): Promise<number> {
  return asPerson(personId, async (c) => {
    const { rows } = await c.query<{ servings: number }>(
      `INSERT INTO day_protein (person_id, day, servings) VALUES ($1, $2, greatest(0, $3::int))
       ON CONFLICT (person_id, day) DO UPDATE
         SET servings = least($4::int, greatest(0, day_protein.servings + $3::int)), updated_at = now()
       RETURNING servings`,
      [personId, day, delta, MAX_PROTEIN],
    );
    return rows[0].servings;
  });
}

/**
 * Move my one line to another day — a memo written on the wrong date.
 * Refuses rather than overwrites when that day already has a line of mine:
 * one of the two would be lost, and which one is the person's to choose.
 */
export async function moveMemo(
  personId: string,
  from: Day,
  to: Day,
): Promise<"moved" | "taken" | "missing"> {
  return asPerson(personId, async (c) => {
    const has = await c.query("SELECT 1 FROM day_memo WHERE person_id = $1 AND day = $2", [personId, from]);
    if (!has.rowCount) return "missing";
    const taken = await c.query("SELECT 1 FROM day_memo WHERE person_id = $1 AND day = $2", [personId, to]);
    if (taken.rowCount) return "taken";
    const { rowCount } = await c.query(
      "UPDATE day_memo SET day = $3, updated_at = now() WHERE person_id = $1 AND day = $2",
      [personId, from, to],
    );
    return rowCount ? "moved" : "missing";
  });
}

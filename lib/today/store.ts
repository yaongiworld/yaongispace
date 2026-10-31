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
}

const EMPTY: DayOf = { mood: null, leaveMinute: null, leftAt: null, memo: null };

/** Both people's day, laid out by cat. */
export async function dayFor(
  client: PoolClient,
  couple: Couple,
  day: Day,
): Promise<Record<Cat, DayOf>> {
  const ids = [couple.yangcho?.id, couple.towee?.id].filter(Boolean) as string[];
  const [moods, offwork, memos] = await Promise.all([
    client.query<{ person_id: string; mood: MoodId }>(
      "SELECT person_id, mood FROM day_mood WHERE day = $1 AND person_id = ANY($2)",
      [day, ids],
    ),
    client.query<{ person_id: string; leave_minute: number | null; left_at: Date | null }>(
      "SELECT person_id, leave_minute, left_at FROM day_offwork WHERE day = $1 AND person_id = ANY($2)",
      [day, ids],
    ),
    client.query<{ person_id: string; body: string }>(
      "SELECT person_id, body FROM day_memo WHERE day = $1 AND person_id = ANY($2)",
      [day, ids],
    ),
  ]);

  const of = (personId: string | undefined): DayOf => {
    if (!personId) return { ...EMPTY };
    const o = offwork.rows.find((r) => r.person_id === personId);
    return {
      mood: moods.rows.find((r) => r.person_id === personId)?.mood ?? null,
      leaveMinute: o?.leave_minute ?? null,
      leftAt: o?.left_at ?? null,
      memo: memos.rows.find((r) => r.person_id === personId)?.body ?? null,
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

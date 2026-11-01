import type { PoolClient } from "pg";
import type { Cat, Couple } from "@/lib/couple";
import type { Day } from "@/lib/today/day";
import type { MoodId } from "@/lib/today/moods";

/**
 * What the Moments grid shows for a stretch of days: both faces, whether
 * anyone worked out, and each of our one-line memos. Anniversaries come from
 * the existing Events (충돌 2) and are read separately.
 */
export interface MomentDay {
  mood: Partial<Record<Cat, MoodId>>;
  memo: Partial<Record<Cat, string>>;
  /** Times each of us had protein (migration 010). */
  protein: Partial<Record<Cat, number>>;
  /** "🏃 3.0km" style summaries of the day's workouts, in order. */
  workouts: { cat: Cat; kind: string; exerciseId: string; distanceM: number | null; weightDg: number | null; reps: number | null }[];
}

export async function momentsBetween(
  client: PoolClient,
  couple: Couple,
  from: Day,
  to: Day,
): Promise<Record<Day, MomentDay>> {
  const out: Record<Day, MomentDay> = {};
  const at = (day: Day) => (out[day] ??= { mood: {}, memo: {}, protein: {}, workouts: [] });
  const catOf = (id: string): Cat | null =>
    id === couple.yangcho?.id ? "yangcho" : id === couple.towee?.id ? "towee" : null;

  const moods = await client.query<{ person_id: string; day: string; mood: MoodId }>(
    `SELECT person_id, to_char(day, 'YYYY-MM-DD') AS day, mood FROM day_mood WHERE day BETWEEN $1 AND $2`,
    [from, to],
  );
  for (const r of moods.rows) {
    const cat = catOf(r.person_id);
    if (cat) at(r.day).mood[cat] = r.mood;
  }

  const memos = await client.query<{ person_id: string; day: string; body: string }>(
    `SELECT person_id, to_char(day, 'YYYY-MM-DD') AS day, body FROM day_memo WHERE day BETWEEN $1 AND $2`,
    [from, to],
  );
  for (const r of memos.rows) {
    const cat = catOf(r.person_id);
    if (cat) at(r.day).memo[cat] = r.body;
  }

  const protein = await client.query<{ person_id: string; day: string; servings: number }>(
    `SELECT person_id, to_char(day, 'YYYY-MM-DD') AS day, servings FROM day_protein
      WHERE day BETWEEN $1 AND $2 AND servings > 0`,
    [from, to],
  );
  for (const r of protein.rows) {
    const cat = catOf(r.person_id);
    if (cat) at(r.day).protein[cat] = r.servings;
  }

  const workouts = await client.query<{
    person_id: string;
    day: string;
    kind: string;
    exercise_id: string;
    distance_m: number | null;
    weight_dg: number | null;
    reps: number | null;
  }>(
    `SELECT person_id, to_char(day, 'YYYY-MM-DD') AS day, kind, exercise_id, distance_m, weight_dg, reps
       FROM workout WHERE day BETWEEN $1 AND $2 ORDER BY day, created_at`,
    [from, to],
  );
  for (const r of workouts.rows) {
    const cat = catOf(r.person_id);
    if (cat)
      at(r.day).workouts.push({
        cat,
        kind: r.kind,
        exerciseId: r.exercise_id,
        distanceM: r.distance_m,
        weightDg: r.weight_dg,
        reps: r.reps,
      });
  }

  return out;
}

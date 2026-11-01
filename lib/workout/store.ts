import type { PoolClient } from "pg";
import { asPerson } from "@/lib/as-person";
import { CURRENT_ERA_ID } from "@/lib/era/eras";
import type { Day } from "@/lib/today/day";
import type { WorkoutKind } from "./catalog";
import { measureColumns, type WorkoutInput } from "./input";
import { FIRST_CARDIO, FIRST_REPS, FIRST_WEIGHT_DG } from "./measures";

/**
 * Workouts in Postgres. Every call runs as the signed-in Person, so the RLS
 * in migration 009 is what decides who may write what — notably that a
 * workout can only ever be written down *as yourself*.
 */

export interface Workout {
  id: string;
  personId: string;
  enteredBy: string;
  day: Day;
  kind: WorkoutKind;
  exerciseId: string;
  distanceM: number | null;
  minutes: number | null;
  weightDg: number | null;
  reps: number | null;
  createdAt: Date;
}

interface Row {
  id: string;
  person_id: string;
  entered_by: string;
  day: string;
  kind: WorkoutKind;
  exercise_id: string;
  distance_m: number | null;
  minutes: number | null;
  weight_dg: number | null;
  reps: number | null;
  created_at: Date;
}

const COLUMNS = `id, person_id, entered_by, to_char(day, 'YYYY-MM-DD') AS day, kind, exercise_id,
  distance_m, minutes, weight_dg, reps, created_at`;

const toWorkout = (r: Row): Workout => ({
  id: r.id,
  personId: r.person_id,
  enteredBy: r.entered_by,
  day: r.day,
  kind: r.kind,
  exerciseId: r.exercise_id,
  distanceM: r.distance_m,
  minutes: r.minutes,
  weightDg: r.weight_dg,
  reps: r.reps,
  createdAt: r.created_at,
});

export async function listWorkouts(
  client: PoolClient,
  options: { from?: Day; to?: Day; limit?: number } = {},
): Promise<Workout[]> {
  const { rows } = await client.query<Row>(
    `SELECT ${COLUMNS} FROM workout
      WHERE ($1::date IS NULL OR day >= $1) AND ($2::date IS NULL OR day <= $2)
      ORDER BY day DESC, created_at DESC
      LIMIT $3`,
    [options.from ?? null, options.to ?? null, options.limit ?? 500],
  );
  return rows.map(toWorkout);
}

export async function addWorkout(actorId: string, input: WorkoutInput): Promise<Workout> {
  return asPerson(actorId, async (client) => {
    const m = measureColumns(input);
    const { rows } = await client.query<Row>(
      `INSERT INTO workout (person_id, entered_by, day, kind, exercise_id,
                            distance_m, minutes, weight_dg, reps, era_id, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $2)
       RETURNING ${COLUMNS}`,
      [
        input.personId,
        actorId,
        input.day,
        input.kind,
        input.exerciseId,
        m.distance_m,
        m.minutes,
        m.weight_dg,
        m.reps,
        input.kind === "cardio" ? CURRENT_ERA_ID : null,
      ],
    );
    return toWorkout(rows[0]);
  });
}

/**
 * Fix a workout — either of us may. Whose it is and what kind it is stay put:
 * a wrong person or kind is deleted and written down again.
 */
export async function updateWorkout(
  actorId: string,
  id: string,
  input: WorkoutInput,
): Promise<Workout | null> {
  return asPerson(actorId, async (client) => {
    const m = measureColumns(input);
    const { rows } = await client.query<Row>(
      `UPDATE workout
          SET day = $2, exercise_id = $3, distance_m = $4, minutes = $5,
              weight_dg = $6, reps = $7, updated_by = $8
        WHERE id = $1 AND kind = $9 AND person_id = $10
        RETURNING ${COLUMNS}`,
      [id, input.day, input.exerciseId, m.distance_m, m.minutes, m.weight_dg, m.reps, actorId, input.kind, input.personId],
    );
    return rows[0] ? toWorkout(rows[0]) : null;
  });
}

export async function deleteWorkout(actorId: string, id: string): Promise<boolean> {
  return asPerson(actorId, async (client) => {
    const { rowCount } = await client.query("DELETE FROM workout WHERE id = $1", [id]);
    return (rowCount ?? 0) > 0;
  });
}

/**
 * Where a person's form opens: their last kind and exercise, and the last
 * numbers they used — so an unchanged workout is "+ then 저장", two taps
 * (brief §4 "기록은 클릭 2번", §9 휠의 시작값은 지난번 값).
 */
export interface Defaults {
  kind: WorkoutKind;
  cardio: { exerciseId: string; distanceM: number; minutes: number };
  /** Last weight per strength exercise, in tenths of a kg. */
  weightDg: Record<string, number>;
  /** Last reps per core exercise. */
  reps: Record<string, number>;
  /** The strength / core exercise used last, if any. */
  lastStrength: string | null;
  lastCore: string | null;
}

export async function defaultsFor(client: PoolClient, personId: string): Promise<Defaults> {
  const { rows } = await client.query<Row>(
    `SELECT DISTINCT ON (kind, exercise_id) ${COLUMNS}
       FROM workout WHERE person_id = $1
      ORDER BY kind, exercise_id, created_at DESC`,
    [personId],
  );
  const latest = rows.map(toWorkout).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const lastOf = (k: WorkoutKind) => latest.find((w) => w.kind === k) ?? null;

  const cardio = lastOf("cardio");
  const weightDg: Record<string, number> = {};
  const reps: Record<string, number> = {};
  for (const w of latest) {
    if (w.kind === "strength" && w.weightDg !== null) weightDg[w.exerciseId] ??= w.weightDg;
    if (w.kind === "core" && w.reps !== null) reps[w.exerciseId] ??= w.reps;
  }

  return {
    kind: latest[0]?.kind ?? "cardio",
    cardio: cardio
      ? { exerciseId: cardio.exerciseId, distanceM: cardio.distanceM!, minutes: cardio.minutes! }
      : { exerciseId: "treadmill_run", ...FIRST_CARDIO },
    weightDg,
    reps,
    lastStrength: lastOf("strength")?.exerciseId ?? null,
    lastCore: lastOf("core")?.exerciseId ?? null,
  };
}

export { FIRST_REPS, FIRST_WEIGHT_DG };

/** How many workouts are a person's — what unlocks their cat's little items. */
export async function workoutCount(client: PoolClient, personId: string): Promise<number> {
  const { rows } = await client.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM workout WHERE person_id = $1",
    [personId],
  );
  return rows[0].n;
}

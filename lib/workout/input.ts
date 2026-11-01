import { isDay, type Day } from "@/lib/today/day";
import { exerciseOf, isWorkoutKind, type WorkoutKind } from "./catalog";
import { isValidDistanceM, isValidMinutes, isValidReps, isValidWeightDg } from "./measures";

/**
 * What a person may set on a workout, already shaped per kind (brief §4):
 * cardio = distance + time, strength = weight only, core = reps only,
 * stretch = done. Anything else is refused before it reaches the database,
 * which refuses it again (migration 009's check).
 */
export type WorkoutInput =
  | { personId: string; day: Day; kind: "cardio"; exerciseId: string; distanceM: number; minutes: number }
  | { personId: string; day: Day; kind: "strength"; exerciseId: string; weightDg: number }
  | { personId: string; day: Day; kind: "core"; exerciseId: string; reps: number }
  | { personId: string; day: Day; kind: "stretch"; exerciseId: string };

/** Parse an untrusted object (a server action's payload) into a WorkoutInput, or null. */
export function parseWorkoutInput(raw: unknown): WorkoutInput | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const { personId, day, kind, exerciseId } = r;
  if (typeof personId !== "string" || !/^[0-9a-f-]{36}$/.test(personId)) return null;
  if (!isDay(day) || !isWorkoutKind(kind) || typeof exerciseId !== "string") return null;
  if (!exerciseOf(kind as WorkoutKind, exerciseId)) return null;

  switch (kind) {
    case "cardio":
      return isValidDistanceM(r.distanceM) && isValidMinutes(r.minutes)
        ? { personId, day, kind, exerciseId, distanceM: r.distanceM, minutes: r.minutes }
        : null;
    case "strength":
      return isValidWeightDg(r.weightDg) ? { personId, day, kind, exerciseId, weightDg: r.weightDg } : null;
    case "core":
      return isValidReps(r.reps) ? { personId, day, kind, exerciseId, reps: r.reps } : null;
    case "stretch":
      return { personId, day, kind, exerciseId };
  }
}

/** The four measure columns, null where the kind does not carry one. */
export function measureColumns(input: WorkoutInput) {
  return {
    distance_m: input.kind === "cardio" ? input.distanceM : null,
    minutes: input.kind === "cardio" ? input.minutes : null,
    weight_dg: input.kind === "strength" ? input.weightDg : null,
    reps: input.kind === "core" ? input.reps : null,
  };
}

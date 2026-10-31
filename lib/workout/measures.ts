/**
 * The numbers a workout carries, and the wheels that pick them.
 *
 * Distance follows the rule carried over from PR #1
 * (`lib/south-america/domain/exercise/distance.ts`): integer metres on a
 * 0.1km grid, never a float, never rounded. The wheels (brief §9 "유산소 거리
 * 입력 방식") only ever offer values on that grid — 0–49 on the left, 0–9 on
 * the right — so there is no input to reject and no error message to show.
 */

export const KM_WHOLE: readonly number[] = Array.from({ length: 50 }, (_, i) => i); // 0–49
export const KM_TENTH: readonly number[] = Array.from({ length: 10 }, (_, i) => i); // 0–9
export const MINUTES: readonly number[] = Array.from({ length: 300 }, (_, i) => i + 1); // 1–300
export const KG_WHOLE: readonly number[] = Array.from({ length: 201 }, (_, i) => i); // 0–200
export const KG_HALF: readonly number[] = [0, 5]; // .0 / .5
export const REPS: readonly number[] = Array.from({ length: 300 }, (_, i) => i + 1); // 1–300

/** Wheels → metres. 5 . 2 → 5200. */
export const wheelsToMeters = (whole: number, tenth: number): number => whole * 1000 + tenth * 100;

/** Metres → wheels. 5200 → [5, 2]. */
export function metersToWheels(m: number): [number, number] {
  const tenths = Math.floor(m / 100);
  return [Math.floor(tenths / 10), tenths % 10];
}

/** Storable distance: positive, whole metres, on the 0.1km grid, at most 49.9km. */
export const isValidDistanceM = (m: unknown): m is number =>
  typeof m === "number" && Number.isSafeInteger(m) && m >= 100 && m <= 49_900 && m % 100 === 0;

/** Integer metres → "11.2", integer arithmetic only (from PR #1). */
export function formatKm(meters: number): string {
  const tenths = Math.floor(meters / 100);
  return `${Math.floor(tenths / 10)}.${tenths % 10}`;
}

/** Weight in tenths of a kilogram (22.5kg → 225). */
export const wheelsToDg = (whole: number, half: number): number => whole * 10 + half;
export function dgToWheels(dg: number): [number, number] {
  return [Math.floor(dg / 10), dg % 10 === 5 ? 5 : 0];
}
export const isValidWeightDg = (dg: unknown): dg is number =>
  typeof dg === "number" && Number.isSafeInteger(dg) && dg >= 0 && dg <= 2005 && dg % 5 === 0;

/** 225 → "22.5", 200 → "20". */
export function formatKg(dg: number): string {
  return dg % 10 === 0 ? String(dg / 10) : `${Math.floor(dg / 10)}.${dg % 10}`;
}

export const isValidMinutes = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 300;
export const isValidReps = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 300;

/** Where the wheels start before anything has ever been logged. */
export const FIRST_CARDIO = { distanceM: 3000, minutes: 30 };
export const FIRST_WEIGHT_DG = 100;
export const FIRST_REPS = 15;

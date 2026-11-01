import type { Workout } from "./store";

/**
 * The one summary line above the Workout list (brief §4): this week, for
 * whoever the chip shows. Counts and kilometres only — never a comparison,
 * never a ranking (brief §2).
 */
export interface WeekSummary {
  sessions: number;
  cardioM: number;
  /** Distinct days with anything logged. */
  days: number;
}

export function weekSummary(workouts: Workout[]): WeekSummary {
  const days = new Set<string>();
  let cardioM = 0;
  for (const w of workouts) {
    days.add(w.day);
    if (w.kind === "cardio" && w.distanceM) cardioM += w.distanceM;
  }
  return { sessions: workouts.length, cardioM, days: days.size };
}

/** Workouts grouped by day, newest day first, keeping each day's order. */
export function byDay(workouts: Workout[]): { day: string; workouts: Workout[] }[] {
  const groups = new Map<string, Workout[]>();
  for (const w of workouts) {
    const list = groups.get(w.day) ?? [];
    list.push(w);
    groups.set(w.day, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([day, list]) => ({ day, workouts: list }));
}

import { seoulDayKey } from "@/lib/calendar/dates";

/**
 * Days, as the couple app counts them: the Seoul calendar day, `YYYY-MM-DD`.
 * The same key the agenda already groups by, so Moments and the old calendar
 * agree about which day an anniversary falls on.
 */

export type Day = string;

export function today(now: Date = new Date()): Day {
  return seoulDayKey(now);
}

export function isDay(value: unknown): value is Day {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function addDays(day: Day, n: number): Day {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The Monday of the week a day is in — weeks run Monday to Sunday. */
export function weekStart(day: Day): Day {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(day, -((dow + 6) % 7));
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** "11월 1일 (토)". */
export function shortDayLabel(day: Day): string {
  const [, m, d] = day.split("-").map(Number);
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  return `${m}월 ${d}일 (${WEEKDAYS[dow]})`;
}

/** "오늘" / "어제" / "11월 1일 (토)". */
export function relativeDayLabel(day: Day, now: Day): string {
  if (day === now) return "오늘";
  if (day === addDays(now, -1)) return "어제";
  return shortDayLabel(day);
}

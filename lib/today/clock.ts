/**
 * The 퇴근 clock. Since 2026-11-01 (PO) it is the time of **arriving at
 * 신도림역**, not of leaving the office as the brief first said; the stored
 * column keeps its old name, `day_offwork.leave_minute`. Starts at 17:30, turns in
 * 10-minute steps. Times are minutes after midnight.
 */

export const DEFAULT_LEAVE_MINUTE = 17 * 60 + 30;
export const LEAVE_STEP = 10;

/** Every time the wheel offers, 00:00 … 23:50. */
export const LEAVE_MINUTES: readonly number[] = Array.from(
  { length: (24 * 60) / LEAVE_STEP },
  (_, i) => i * LEAVE_STEP,
);

export function isLeaveMinute(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 24 * 60 && v % LEAVE_STEP === 0;
}

/** 1050 → "17:30". */
export function clockLabel(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** A Date → "18:07" in Seoul. */
export function seoulClock(at: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at);
}

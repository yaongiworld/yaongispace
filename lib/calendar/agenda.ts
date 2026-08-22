import { seoulDayKey, seoulParts } from "./dates";
import type { Occurrence } from "./events";

/**
 * Turning a flat list of occurrences into the days an agenda scrolls through.
 *
 * Separate from both the database and the component because it is where the
 * agenda's one real decision lives: **which days exist**. An agenda that
 * emitted only the days that have Events would collapse February into a single
 * line and make "next week" impossible to find by scrolling; one that emitted
 * every day between two dates would be a month grid drawn vertically, which is
 * the shape this ticket exists to reject.
 *
 * The answer is in between and it is stated in `buildAgenda` below.
 */

/** One day in the agenda. */
export interface AgendaDay {
  /** `YYYY-MM-DD` in Seoul. Stable, and what React keys on. */
  key: string;
  /** Noon in Seoul on this day — a safe instant to format from. */
  date: Date;
  occurrences: Occurrence[];
  /** Whether this is today in Seoul, which is where the agenda opens. */
  isToday: boolean;
}

/**
 * Midday in Seoul on the day a key names.
 *
 * Noon rather than midnight on purpose: midnight is the instant that lands on
 * the wrong side of a day boundary under any rounding, and every formatter
 * here reads the Seoul civil day, so the middle of it is the safe choice.
 */
function seoulNoon(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  // 12:00 KST is 03:00 UTC.
  return new Date(Date.UTC(year, month - 1, day, 3, 0, 0));
}

/** The `YYYY-MM-DD` key `days` days after the one given. */
function shiftKey(key: string, days: number): string {
  const at = new Date(seoulNoon(key).getTime() + days * 86_400_000);
  return seoulDayKey(at);
}

/**
 * Group occurrences into the days the agenda renders.
 *
 * **Which days exist**: every day that has an Event, plus today. Nothing else.
 *
 * Today is included even when empty because the agenda opens at today, and
 * opening onto whatever happens to be the next Event — possibly weeks away —
 * loses the "you are here" that makes a scrolling list readable. Every *other*
 * empty day is omitted, because rendering them is the month grid this ticket
 * rules out: for two people a fortnight of blanks is chrome, not information.
 *
 * The gap between two days is therefore visible as a jump in the dates rather
 * than as empty rows, which is the honest rendering of "nothing happened".
 */
export function buildAgenda(
  occurrences: Occurrence[],
  now: Date = new Date(),
): AgendaDay[] {
  const todayKey = seoulDayKey(now);

  const byDay = new Map<string, Occurrence[]>();
  for (const occurrence of occurrences) {
    const key = seoulDayKey(occurrence.occursAt);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(occurrence);
    else byDay.set(key, [occurrence]);
  }

  // Today always has a row, even with nothing in it.
  if (!byDay.has(todayKey)) byDay.set(todayKey, []);

  return [...byDay.keys()]
    // Lexicographic sort is chronological because the keys are zero-padded.
    .sort()
    .map((key) => ({
      key,
      date: seoulNoon(key),
      occurrences: (byDay.get(key) ?? []).sort(
        (a, b) =>
          // All-day things head the day: they have no clock time, and the UI
          // must not invent one to sort them by.
          Number(b.allDay) - Number(a.allDay) ||
          a.occursAt.getTime() - b.occursAt.getTime() ||
          a.title.localeCompare(b.title, "ko"),
      ),
      isToday: key === todayKey,
    }));
}

/**
 * The window the agenda loads on open.
 *
 * Asymmetric on purpose, and this is the ticket's shape in one function: the
 * past is *reachable*, the future is what you came for. A month back is enough
 * that scrolling up immediately finds something; a year forward covers every
 * anniversary exactly once, which is what makes a yearly repeat feel like a
 * calendar rather than a setting.
 *
 * `widenWindow` below exists to move both bounds outward, and it is tested —
 * but **nothing calls it yet**. The agenda fetches this window once on the
 * server and the scroller never asks for more, so today the bounds *are* the
 * limit: a month back and a year forward. The ticket asks that the past be
 * reachable by scrolling up, and one month of it is, which is why this is a
 * shortfall rather than a broken promise. Wiring `widenWindow` to the
 * scroller is the whole of the remaining work.
 */
export function initialWindow(now: Date = new Date()): { from: Date; to: Date } {
  const { year, month, day } = seoulParts(now);
  const startOfToday = Date.UTC(year, month - 1, day) - 9 * 3_600_000;
  return {
    from: new Date(startOfToday - 30 * 86_400_000),
    to: new Date(startOfToday + 366 * 86_400_000),
  };
}

/**
 * Widen a window in one direction.
 *
 * Widening rather than paging: the agenda is one continuous scroll and a page
 * boundary in the middle of it would be a seam the reader can feel. Scrolling
 * up asks for more past, reaching the end asks for more future, and the window
 * only ever grows within a session.
 */
export function widenWindow(
  window: { from: Date; to: Date },
  direction: "past" | "future",
  days = 180,
): { from: Date; to: Date } {
  return direction === "past"
    ? { from: new Date(window.from.getTime() - days * 86_400_000), to: window.to }
    : { from: window.from, to: new Date(window.to.getTime() + days * 86_400_000) };
}

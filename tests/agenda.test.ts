import { describe, expect, test } from "vitest";
import { buildAgenda, initialWindow, widenWindow } from "../lib/calendar/agenda";
import type { Occurrence } from "../lib/calendar/events";
import { seoulDayKey } from "../lib/calendar/dates";

/**
 * How occurrences become the days an agenda scrolls through.
 *
 * Pure logic, unit tested, and the place the agenda's one real decision lives:
 * **which days exist**. Getting that wrong in either direction is what turns an
 * agenda back into a month grid or collapses a February into a single line.
 */

/**
 * An Occurrence from ISO strings, which is how they are written here.
 *
 * The date fields are declared as strings rather than intersected onto
 * `Partial<Occurrence>` — that produces `Date & string`, which nothing can
 * satisfy, and an `as Occurrence` cast at the end hides it from the function
 * while leaving every call site failing to typecheck.
 */
function occurrence(fields: {
  occursAt: string;
  occurredAt?: string;
  id?: string;
  title?: string;
  description?: string | null;
  allDay?: boolean;
  repeatsYearly?: boolean;
  isRepeat?: boolean;
  personId?: string;
}): Occurrence {
  return {
    id: fields.id ?? crypto.randomUUID(),
    title: fields.title ?? "일정",
    description: fields.description ?? null,
    occursAt: new Date(fields.occursAt),
    occurredAt: new Date(fields.occurredAt ?? fields.occursAt),
    endsAt: null,
    allDay: fields.allDay ?? false,
    repeatsYearly: fields.repeatsYearly ?? false,
    isRepeat: fields.isRepeat ?? false,
    personId: fields.personId ?? "person",
  };
}

const NOW = new Date("2026-08-22T12:00:00+09:00");

describe("which days the agenda renders", () => {
  test("a day with an Event, and today, and nothing else", () => {
    // The whole decision in one assertion: no empty days between, because
    // rendering them is the month grid this ticket rules out.
    const days = buildAgenda(
      [
        occurrence({ occursAt: "2026-08-25T19:00:00+09:00", title: "저녁" }),
        occurrence({ occursAt: "2026-09-10T19:00:00+09:00", title: "치과" }),
      ],
      NOW,
    );

    expect(days.map((d) => d.key)).toEqual(["2026-08-22", "2026-08-25", "2026-09-10"]);
  });

  test("today gets a row even when nothing is on it", () => {
    // The agenda opens at today, and opening onto an Event three weeks away
    // loses the "you are here" that makes a scrolling list readable.
    const days = buildAgenda([], NOW);
    expect(days).toHaveLength(1);
    expect(days[0].key).toBe(seoulDayKey(NOW));
    expect(days[0].isToday).toBe(true);
    expect(days[0].occurrences).toEqual([]);
  });

  test("today is not duplicated when it does have Events", () => {
    const days = buildAgenda(
      [occurrence({ occursAt: "2026-08-22T19:00:00+09:00" })],
      NOW,
    );
    expect(days).toHaveLength(1);
    expect(days[0].isToday).toBe(true);
    expect(days[0].occurrences).toHaveLength(1);
  });

  test("the past comes first, because scrolling up is how it is reached", () => {
    const days = buildAgenda(
      [
        occurrence({ occursAt: "2026-09-01T19:00:00+09:00", title: "나중" }),
        occurrence({ occursAt: "2026-07-01T19:00:00+09:00", title: "지난달" }),
      ],
      NOW,
    );
    expect(days.map((d) => d.key)).toEqual(["2026-07-01", "2026-08-22", "2026-09-01"]);
  });

  test("groups by the Seoul day, not the UTC one", () => {
    // 23:00 UTC on the 21st is the morning of the 22nd in Seoul. Grouping in
    // UTC would file it under yesterday, and only in the evening.
    const days = buildAgenda([occurrence({ occursAt: "2026-08-21T23:00:00Z" })], NOW);
    expect(days).toHaveLength(1);
    expect(days[0].key).toBe("2026-08-22");
  });
});

describe("the order within a day", () => {
  test("all-day things head the day, since they have no clock time", () => {
    const days = buildAgenda(
      [
        occurrence({ occursAt: "2026-08-22T09:00:00+09:00", title: "아침 운동" }),
        occurrence({ occursAt: "2026-08-22T00:00:00+09:00", title: "기념일", allDay: true }),
      ],
      NOW,
    );
    expect(days[0].occurrences.map((o) => o.title)).toEqual(["기념일", "아침 운동"]);
  });

  test("otherwise by time", () => {
    const days = buildAgenda(
      [
        occurrence({ occursAt: "2026-08-22T19:00:00+09:00", title: "저녁" }),
        occurrence({ occursAt: "2026-08-22T09:00:00+09:00", title: "아침" }),
        occurrence({ occursAt: "2026-08-22T13:00:00+09:00", title: "점심" }),
      ],
      NOW,
    );
    expect(days[0].occurrences.map((o) => o.title)).toEqual(["아침", "점심", "저녁"]);
  });
});

describe("the window the agenda loads", () => {
  test("reaches back a month and forward a year", () => {
    // Asymmetric on purpose: the past is reachable, the future is what you
    // came for. A year forward covers every anniversary exactly once.
    const { from, to } = initialWindow(NOW);
    const days = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86_400_000);

    expect(days(from, NOW)).toBeGreaterThanOrEqual(29);
    expect(days(from, NOW)).toBeLessThanOrEqual(31);
    expect(days(NOW, to)).toBeGreaterThanOrEqual(365);
  });

  test("covers today itself, which is where it opens", () => {
    const { from, to } = initialWindow(NOW);
    expect(from.getTime()).toBeLessThan(NOW.getTime());
    expect(to.getTime()).toBeGreaterThan(NOW.getTime());
  });

  test("widens in one direction at a time and never shrinks", () => {
    const initial = initialWindow(NOW);

    const older = widenWindow(initial, "past");
    expect(older.from.getTime()).toBeLessThan(initial.from.getTime());
    expect(older.to.getTime()).toBe(initial.to.getTime());

    const newer = widenWindow(initial, "future");
    expect(newer.to.getTime()).toBeGreaterThan(initial.to.getTime());
    expect(newer.from.getTime()).toBe(initial.from.getTime());
  });
});

describe("what the agenda is not", () => {
  test("never emits a run of empty days — that would be a grid drawn sideways", () => {
    // Two Events a month apart produce three rows, not thirty-one.
    const days = buildAgenda(
      [
        occurrence({ occursAt: "2026-08-01T19:00:00+09:00" }),
        occurrence({ occursAt: "2026-08-31T19:00:00+09:00" }),
      ],
      NOW,
    );
    expect(days).toHaveLength(3);
    // And every rendered day except today carries something.
    for (const day of days) {
      if (!day.isToday) expect(day.occurrences.length).toBeGreaterThan(0);
    }
  });
});

import { describe, expect, test } from "vitest";
import {
  agendaDayHeading,
  anniversaryLabel,
  daysBetween,
  koreanDate,
  koreanDateShort,
  koreanTime,
  koreanWeekday,
  relativeKoreanDate,
  seoulDayKey,
  seoulParts,
} from "../lib/calendar/dates";

/**
 * Korean date formatting, in `Asia/Seoul`.
 *
 * Unit tests rather than integration tests, because this is pure logic with no
 * database behind it — and it is the kind of pure logic that is easy to get
 * subtly wrong: the failures all live near midnight, across a year boundary,
 * or on the 29th of February, and none of them are visible by looking at the
 * screen on an ordinary afternoon.
 *
 * Every instant below is written with an explicit offset, so these tests assert
 * the same thing whatever `TZ` the machine running them is set to. A test that
 * passed only in Seoul would be testing the laptop, not the code.
 */

describe("the Seoul day an instant falls in", () => {
  test("is read in Seoul, not in the runtime's zone", () => {
    // 23:00 UTC is 08:00 the next morning in Seoul. A formatter reading the
    // runtime's clock on a UTC server would call this the 21st, and the Event
    // would file itself under yesterday every evening.
    const at = new Date("2026-08-21T23:00:00Z");
    expect(seoulParts(at)).toEqual({ year: 2026, month: 8, day: 22 });
    expect(koreanDate(at)).toBe("2026년 8월 22일");
  });

  test("just before Seoul midnight is still the earlier day", () => {
    const at = new Date("2026-08-22T14:59:00Z"); // 23:59 KST on the 22nd
    expect(koreanDate(at)).toBe("2026년 8월 22일");
  });

  test("just after Seoul midnight is the later day", () => {
    const at = new Date("2026-08-22T15:01:00Z"); // 00:01 KST on the 23rd
    expect(koreanDate(at)).toBe("2026년 8월 23일");
  });

  test("gives a stable grouping key", () => {
    expect(seoulDayKey(new Date("2026-08-21T23:00:00Z"))).toBe("2026-08-22");
    // Zero-padded, so keys sort lexicographically the way the agenda scrolls.
    expect(seoulDayKey(new Date("2026-01-05T03:00:00+09:00"))).toBe("2026-01-05");
  });
});

describe("the Korean long date", () => {
  test("is 년/월/일 and not the numeric ko-KR form", () => {
    // Intl's ko-KR gives "2026. 8. 22." — the form nobody writes by hand.
    expect(koreanDate(new Date("2026-08-22T12:00:00+09:00"))).toBe("2026년 8월 22일");
  });

  test("does not zero-pad, because Korean does not", () => {
    expect(koreanDate(new Date("2026-01-05T12:00:00+09:00"))).toBe("2026년 1월 5일");
  });

  test("drops the year for headings inside one year", () => {
    expect(koreanDateShort(new Date("2026-08-22T12:00:00+09:00"))).toBe("8월 22일");
  });
});

describe("the weekday", () => {
  test("is the Seoul weekday", () => {
    // 2026-08-22 is a Saturday.
    expect(koreanWeekday(new Date("2026-08-22T12:00:00+09:00"))).toBe("토요일");
  });

  test("rolls over with the Seoul day, not the UTC one", () => {
    // 2026-08-21T23:00Z is Saturday morning in Seoul, though Friday in UTC.
    expect(koreanWeekday(new Date("2026-08-21T23:00:00Z"))).toBe("토요일");
  });
});

describe("the clock time", () => {
  test("puts 오전/오후 before the number, as Korean does", () => {
    expect(koreanTime(new Date("2026-08-22T19:30:00+09:00"))).toBe("오후 7:30");
    expect(koreanTime(new Date("2026-08-22T09:05:00+09:00"))).toBe("오전 9:05");
  });

  test("renders both noon and midnight as 12, never 0", () => {
    expect(koreanTime(new Date("2026-08-22T12:00:00+09:00"))).toBe("오후 12:00");
    expect(koreanTime(new Date("2026-08-22T00:00:00+09:00"))).toBe("오전 12:00");
  });

  test("is Seoul's clock whatever the instant's offset says", () => {
    expect(koreanTime(new Date("2026-08-22T00:00:00Z"))).toBe("오전 9:00");
  });
});

describe("counting days", () => {
  test("counts civil days, not elapsed hours", () => {
    // Two hours apart, but yesterday and today: a person says "1일 전".
    const lateLastNight = new Date("2026-08-21T23:00:00+09:00");
    const earlyToday = new Date("2026-08-22T01:00:00+09:00");
    expect(daysBetween(lateLastNight, earlyToday)).toBe(1);
  });

  test("is zero across a whole single day", () => {
    expect(
      daysBetween(
        new Date("2026-08-22T00:01:00+09:00"),
        new Date("2026-08-22T23:59:00+09:00"),
      ),
    ).toBe(0);
  });

  test("is negative into the past and crosses a year boundary", () => {
    expect(
      daysBetween(
        new Date("2027-01-01T09:00:00+09:00"),
        new Date("2026-12-31T09:00:00+09:00"),
      ),
    ).toBe(-1);
  });
});

describe("the relative date", () => {
  const now = new Date("2026-08-22T12:00:00+09:00");
  const days = (n: number) =>
    new Date(new Date("2026-08-22T12:00:00+09:00").getTime() + n * 86_400_000);

  test("names the days that have names", () => {
    expect(relativeKoreanDate(now, now)).toBe("오늘");
    expect(relativeKoreanDate(days(1), now)).toBe("내일");
    expect(relativeKoreanDate(days(2), now)).toBe("모레");
    expect(relativeKoreanDate(days(-1), now)).toBe("어제");
    expect(relativeKoreanDate(days(-2), now)).toBe("그저께");
  });

  test("counts days for the recent past, which is what the ticket asks for", () => {
    expect(relativeKoreanDate(days(-3), now)).toBe("3일 전");
    expect(relativeKoreanDate(days(-7), now)).toBe("7일 전");
  });

  test("counts days for the near future too, since an agenda reads forwards", () => {
    expect(relativeKoreanDate(days(3), now)).toBe("3일 후");
    expect(relativeKoreanDate(days(7), now)).toBe("7일 후");
  });

  test("falls back to the absolute date beyond a week, where a count stops helping", () => {
    // "437일 전" is a worse answer than the date itself.
    expect(relativeKoreanDate(days(-8), now)).toBe("2026년 8월 14일");
    expect(relativeKoreanDate(days(8), now)).toBe("2026년 8월 30일");
    expect(relativeKoreanDate(new Date("2016-11-11T12:00:00+09:00"), now)).toBe(
      "2016년 11월 11일",
    );
  });

  test("is relative to the Seoul day, not to twenty-four elapsed hours", () => {
    // 22:00 last night, read at 01:00 tonight: three hours ago, but "어제".
    const lateNow = new Date("2026-08-22T01:00:00+09:00");
    expect(relativeKoreanDate(new Date("2026-08-21T22:00:00+09:00"), lateNow)).toBe(
      "어제",
    );
  });
});

describe("the agenda day heading", () => {
  const now = new Date("2026-08-22T12:00:00+09:00");

  test("leads with the date and trails the relative note", () => {
    // Scanning an agenda you are looking for a date; "오늘" is orientation.
    expect(agendaDayHeading(now, now)).toBe("8월 22일 토요일 · 오늘");
  });

  test("omits the year within the current year and shows it outside", () => {
    expect(agendaDayHeading(new Date("2026-11-11T12:00:00+09:00"), now)).toBe(
      "11월 11일 수요일",
    );
    expect(agendaDayHeading(new Date("2027-01-01T12:00:00+09:00"), now)).toBe(
      "2027년 1월 1일 금요일",
    );
  });

  test("does not print the date twice when there is no relative form", () => {
    const heading = agendaDayHeading(new Date("2027-01-01T12:00:00+09:00"), now);
    expect(heading).toBe("2027년 1월 1일 금요일");
    expect(heading).not.toContain("·");
  });
});

describe("the anniversary label", () => {
  test("counts years from the stored Event", () => {
    expect(
      anniversaryLabel(
        new Date("2026-11-11T00:00:00+09:00"),
        new Date("2016-11-11T00:00:00+09:00"),
      ),
    ).toBe("10주년");
  });

  test("is null in the Event's own year, which is not an anniversary of itself", () => {
    const at = new Date("2016-11-11T00:00:00+09:00");
    expect(anniversaryLabel(at, at)).toBeNull();
  });
});

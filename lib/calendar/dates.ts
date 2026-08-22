/**
 * Korean dates, in `Asia/Seoul`.
 *
 * The app speaks Korean and there is no language switcher, so these are not
 * "the ko-KR locale of a formatter that could be swapped" — they are how a date
 * is written here, hardcoded on purpose (CLAUDE.md, "The app speaks Korean").
 *
 * Everything reasons in `Asia/Seoul` regardless of where the device is. Both of
 * us live in Seoul; a calendar that showed an anniversary on a different day
 * because someone opened it on a plane would be worse, not more correct. The
 * zone is a constant rather than a parameter for the same reason it is a
 * literal in migration 005: a shared calendar with two time zones is a
 * different product.
 *
 * This module is pure and has no database and no React in it, which is why it
 * is unit tested rather than integration tested — date arithmetic near
 * midnight, across a year boundary and on the 29th of February is exactly the
 * logic that is easy to get subtly wrong and impossible to notice.
 */

export const SEOUL = "Asia/Seoul";

/**
 * The civil date in Seoul, as its year/month/day parts.
 *
 * `Intl` with an explicit `timeZone` is what does the conversion. The naive
 * approach — reading `getFullYear()` and friends — reports the *runtime's*
 * zone, so the server (UTC on Vercel) and the phone (KST) would disagree about
 * what day it is for nine hours out of every twenty-four. That disagreement
 * shows up as an Event filed under yesterday, and only in the evening.
 */
export function seoulParts(at: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/**
 * "2026년 8월 22일" — the Korean long date.
 *
 * Written by hand rather than via `Intl.DateTimeFormat("ko-KR", …)`, which
 * emits "2026. 8. 22." — the numeric form, not the one a person writes. The
 * 년/월/일 form is what the ticket asks for, and getting it out of `Intl`
 * means `dateStyle: "long"`, which also drags in a weekday on some runtimes.
 * Composing three numbers is smaller and cannot drift between Node versions.
 */
export function koreanDate(at: Date): string {
  const { year, month, day } = seoulParts(at);
  return `${year}년 ${month}월 ${day}일`;
}

/** "8월 22일" — the same date without the year, for headings inside one year. */
export function koreanDateShort(at: Date): string {
  const { month, day } = seoulParts(at);
  return `${month}월 ${day}일`;
}

/** 일요일 first, matching `Date.getDay()` and the Korean week. */
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** "토요일" — the weekday in Seoul. */
export function koreanWeekday(at: Date): string {
  const { year, month, day } = seoulParts(at);
  // Reconstructed as a UTC date purely to get the day-of-week index; the parts
  // are already Seoul's, so no further shifting is wanted.
  const index = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${WEEKDAYS[index]}요일`;
}

/**
 * "오후 7:30" — the clock time in Seoul.
 *
 * Korean puts 오전/오후 *before* the number, which is the opposite of English
 * AM/PM and the reason this is not `toLocaleTimeString` with a swap.
 */
export function koreanTime(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SEOUL,
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const hour24 = get("hour") % 24;
  const minute = get("minute");

  const meridiem = hour24 < 12 ? "오전" : "오후";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;

  return `${meridiem} ${hour12}:${String(minute).padStart(2, "0")}`;
}

/**
 * Whole days between two instants, counted in *civil days* in Seoul.
 *
 * Not `(a - b) / 86400000`. Yesterday at 11pm and today at 1am are two hours
 * apart and are still "1일 전", which is what a person means by a day. Counting
 * elapsed milliseconds gets that wrong for exactly the cases — late evening,
 * early morning — when somebody is most likely to be reading the agenda.
 */
export function daysBetween(from: Date, to: Date): number {
  const a = seoulParts(from);
  const b = seoulParts(to);
  const utcA = Date.UTC(a.year, a.month - 1, a.day);
  const utcB = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((utcB - utcA) / 86_400_000);
}

/**
 * How a date reads relative to today: "오늘", "3일 전", "2026년 8월 22일".
 *
 * The ticket asks for relative phrasing **for the recent past** specifically,
 * and that qualifier is the whole design. A relative label is kind at short
 * range and useless past it — "437일 전" is a worse answer than the date — so
 * the relative form is used within a week and the absolute date beyond it.
 *
 * The near future gets the same treatment, because an agenda that opens at
 * today is mostly read forwards: "3일 후" is exactly as useful as "3일 전", and
 * omitting it would leave the tomorrow-to-next-week band — the busiest part of
 * the screen — reading as bare dates.
 */
export function relativeKoreanDate(at: Date, now: Date = new Date()): string {
  const days = daysBetween(now, at);

  if (days === 0) return "오늘";
  if (days === 1) return "내일";
  if (days === 2) return "모레";
  if (days === -1) return "어제";
  if (days === -2) return "그저께";

  // Inside a week either way, a count of days is the friendlier reading.
  if (days < 0 && days >= -7) return `${-days}일 전`;
  if (days > 0 && days <= 7) return `${days}일 후`;

  return koreanDate(at);
}

/**
 * The heading above a day in the agenda: "8월 22일 토요일 · 오늘".
 *
 * The absolute date leads and the relative note trails, rather than the other
 * way round. Scrolling an agenda you are scanning for a date; "오늘" is
 * orientation, not the answer, and putting it first would make every heading
 * start with the same handful of words.
 *
 * The year appears only when it is not the current one — repeating it on every
 * heading is noise for a calendar mostly read within a few months of today.
 */
export function agendaDayHeading(at: Date, now: Date = new Date()): string {
  const sameYear = seoulParts(at).year === seoulParts(now).year;
  const date = sameYear ? koreanDateShort(at) : koreanDate(at);
  const weekday = koreanWeekday(at);
  const relative = relativeKoreanDate(at, now);

  // When the relative form *is* the absolute date, saying it twice is silly.
  const suffix = relative === koreanDate(at) ? "" : ` · ${relative}`;
  return `${date} ${weekday}${suffix}`;
}

/**
 * A stable `YYYY-MM-DD` key for the Seoul day an instant falls in.
 *
 * What the agenda groups by. A key rather than a formatted string so that
 * grouping never depends on how a date happens to be displayed.
 */
export function seoulDayKey(at: Date): string {
  const { year, month, day } = seoulParts(at);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * "10주년" — which anniversary this occurrence is, or null.
 *
 * Only meaningful for a repeating Event, and only from its second year: the
 * original is not an anniversary of itself. Null rather than 0 so a caller
 * renders nothing instead of "0주년".
 */
export function anniversaryLabel(
  occursAt: Date,
  occurredAt: Date,
): string | null {
  const years = seoulParts(occursAt).year - seoulParts(occurredAt).year;
  return years > 0 ? `${years}주년` : null;
}

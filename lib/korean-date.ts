/**
 * Dates the way we say them.
 *
 * Korean convention, `Asia/Seoul`, relative for the recent past — "3일 전" for
 * something from this week, "2026년 8월 22일" for anything older. Hardcoded
 * like the rest of the UI: there is no locale to switch and no i18n
 * scaffolding, because the only two people who will ever read this both read
 * Korean.
 *
 * The timezone is pinned rather than taken from the browser. Both of us are in
 * Korea, and a server rendering in UTC would otherwise show yesterday's letter
 * as having arrived today — a small wrongness that would be permanent in an
 * archive meant to last decades.
 */

const SEOUL = "Asia/Seoul";

const full = new Intl.DateTimeFormat("ko-KR", {
  timeZone: SEOUL,
  year: "numeric",
  month: "long",
  day: "numeric",
});

/** "2026년 8월 22일" */
export function koreanDate(date: Date): string {
  return full.format(date);
}

/**
 * How long ago, in the words we would use.
 *
 * Anything beyond a week gets the date instead: "37일 전" is arithmetic, not
 * memory, and nobody thinks of last month that way.
 */
export function koreanRelative(date: Date, now: Date = new Date()): string {
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 0) return koreanDate(date);
  if (seconds < 60) return "방금";
  if (seconds < 60 * 60) return `${Math.floor(seconds / 60)}분 전`;
  if (seconds < 60 * 60 * 24) return `${Math.floor(seconds / 3600)}시간 전`;

  const days = Math.floor(seconds / 86400);
  if (days === 1) return "어제";
  if (days < 7) return `${days}일 전`;

  return koreanDate(date);
}

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
 *
 * `koreanDate` itself lives in `lib/calendar/dates.ts` and is re-exported here.
 * Letters and the calendar were built in parallel and each grew a version —
 * they agreed in every timezone, but two functions with one name and one job
 * only stay agreeing by luck. The calendar's is the one kept: it composes
 * 년/월/일 by hand rather than going through `Intl`, which emits the numeric
 * "2026. 8. 22." unless coaxed with `dateStyle: "long"` — and that drags in a
 * weekday on some runtimes. Three numbers cannot drift between Node versions.
 */

import { koreanDate } from "./calendar/dates";

export { koreanDate };

const SEOUL = "Asia/Seoul";

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

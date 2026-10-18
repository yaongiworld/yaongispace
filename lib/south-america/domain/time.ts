// 시간 도우미. 타임라인의 시각은 "그날 00:00부터 지난 분"이에요.
// 하루의 경계는 새벽 4시라서, 00:00~03:59는 전날 일정의 연장(1440분 이상)으로 세요 [P-130].
import { TIMELINE_RULES } from '../config/timeSettings';

export type Minute = number;

export const MINUTES_PER_DAY = 1440;

/** "19:40" 같은 시계 시각을 계획 하루 기준 분으로 바꿔요. 00:30은 전날 일정의 연장이라 1470이에요. */
export function clockToPlanMinutes(hhmm: string): Minute {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) throw new RangeError(`시각 형식이 맞지 않아요: ${hhmm}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new RangeError(`시각 범위가 맞지 않아요: ${hhmm}`);
  const base = h * 60 + min;
  return h < TIMELINE_RULES.dayBoundaryHour ? base + MINUTES_PER_DAY : base;
}

/** 분을 "HH:MM"과 하루 넘김(0 또는 1)으로 나타내요. 1이면 화면에 +1을 붙여요. */
export function formatClock(t: Minute): { hhmm: string; dayOffset: number } {
  const dayOffset = Math.floor(t / MINUTES_PER_DAY);
  const inDay = t - dayOffset * MINUTES_PER_DAY;
  const hh = String(Math.floor(inDay / 60)).padStart(2, '0');
  const mm = String(inDay % 60).padStart(2, '0');
  return { hhmm: `${hh}:${mm}`, dayOffset };
}

/** 사람이 읽는 짧은 표기: "19:40", 자정을 넘기면 "00:20+1" */
export function fmt(t: Minute): string {
  const { hhmm, dayOffset } = formatClock(t);
  return dayOffset > 0 ? `${hhmm}+${dayOffset}` : hhmm;
}

/**
 * 어떤 순간이 "어느 날의 일정"에 속하는지 알려 줘요 (Asia/Seoul, 새벽 4시 경계).
 * 예: 10/16 00:30 은 10/15 일정이에요.
 */
export function planDayOf(instant: Date | string, timeZone = 'Asia/Seoul'): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  if (Number.isNaN(d.getTime())) throw new RangeError('날짜 형식이 맞지 않아요');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  let utc = Date.UTC(get('year'), get('month') - 1, get('day'));
  if (get('hour') < TIMELINE_RULES.dayBoundaryHour) utc -= MINUTES_PER_DAY * 60_000;
  return new Date(utc).toISOString().slice(0, 10);
}

/** 지금 이 순간이 그날(계획 하루) 00:00부터 몇 분째인지. 한국 시간 새벽 4시 전이면 1440분 이상이에요. */
export function planMinutesOf(instant: Date, timeZone = 'Asia/Seoul'): Minute {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const base = get('hour') * 60 + get('minute');
  return get('hour') < TIMELINE_RULES.dayBoundaryHour ? base + MINUTES_PER_DAY : base;
}

/** 두 날짜("YYYY-MM-DD") 사이의 일수 (b - a) */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / (MINUTES_PER_DAY * 60_000));
}

/** "YYYY-MM-DD" 의 요일 (한글 한 글자) */
export function weekdayKo(day: string): string {
  return ['일', '월', '화', '수', '목', '금', '토'][new Date(`${day}T00:00:00Z`).getUTCDay()];
}

/* ───────── 날짜(계획 하루)와 실제 순간 사이의 변환 ─────────
 * 계획 하루 "YYYY-MM-DD"의 00:00은 그 날짜의 한국 시간(Asia/Seoul) 자정이에요.
 * 분이 1440 이상이면 다음 달력 날짜의 새벽이고, 04:00 전까지는 여전히 같은 계획 하루예요 [P-130].
 * 한국은 서머타임이 없어서 +09:00 고정으로 계산해도 돼요.
 */

/** "YYYY-MM-DD" 모양이고 실제로 있는 날짜인지 */
export function isPlanDay(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
}

/** 날짜에 n일을 더하거나 빼요 (n은 음수 가능) */
export function addDays(day: string, n: number): string {
  if (!isPlanDay(day)) throw new RangeError(`날짜 형식이 맞지 않아요: ${day}`);
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * MINUTES_PER_DAY * 60_000).toISOString().slice(0, 10);
}

/** 계획 하루 00:00(한국 시간 자정)의 실제 순간 */
export function planDayStart(day: string): Date {
  if (!isPlanDay(day)) throw new RangeError(`날짜 형식이 맞지 않아요: ${day}`);
  return new Date(`${day}T00:00:00+09:00`);
}

/** 계획 하루의 "분"을 실제 순간으로 (예: 2026-10-15의 1470분 = 10/16 00:30 한국 시간) */
export function instantOfPlanMinute(day: string, minute: Minute): Date {
  return new Date(planDayStart(day).getTime() + minute * 60_000);
}

/** 실제 순간을 그 계획 하루 기준 분으로 (1분 미만은 버려요) */
export function planMinuteOfInstant(day: string, instant: Date | string): Minute {
  const t = typeof instant === 'string' ? new Date(instant) : instant;
  if (Number.isNaN(t.getTime())) throw new RangeError('날짜 형식이 맞지 않아요');
  return Math.floor((t.getTime() - planDayStart(day).getTime()) / 60_000);
}

// 유산소 거리 누적 계산 [5-A]. 저장하지 않고 매번 기록에서 계산해요 (수정·취소·복구하면 저절로 다시 계산돼요).
// 입력한 거리를 환산 없이 1:1로 더해요: 러닝 3.0km + 사이클 8.2km = 11.2km (정수 미터 덧셈이라 오차가 없어요).
// 이 합계는 "실제 입력된 유산소 거리"예요. Adventure KM(게임 속 가상 거리, D-100~D-104)과 별개이고 연결하지 않아요.
// 취소된 기록과 알 수 없는 종류의 기록은 합계에 넣지 않아요.
import { SEASON_ID, type CardioExerciseId } from '../../config/cardio';
import { addDays, isPlanDay } from '../time';
import { isCardioLog, type LogBook } from './types';

/**
 * 어떤 날의 기록을 더할지.
 * - all(기본): 모든 유효 기록 (혼자 한 날 포함)
 * - withSession: ❤️ 공동 운동 세션이 있었던 날의 기록만
 * - solo: 세션이 없던 날(혼자 운동)의 기록만
 * 혼자 한 유산소를 하이킹 패스포트에 인정할지는 아직 미결정이라, 규칙은 정하지 않고 계산만 고를 수 있게 해 둬요.
 */
export type DistanceScope = 'all' | 'withSession' | 'solo';

export type TotalsOptions = {
  /** 시즌 (기본 시즌 1) */
  season?: number;
  scope?: DistanceScope;
  /** ❤️ 세션이 있었던 날들. scope가 all이 아니면 꼭 필요해요 (days.ts의 sessionDayKeys로 만들어요) */
  sessionDays?: ReadonlySet<string>;
  /** 이 날짜부터 / 이 날짜까지 (포함, "YYYY-MM-DD") */
  from?: string;
  to?: string;
};

export type DistanceTotals = {
  /** 더한 기록 수 */
  count: number;
  /** 사람별 합계 (미터) */
  yangchoM: number;
  tawiM: number;
  /** 공동 합계 = 두 사람의 합계 */
  jointM: number;
  /** 종목별 합계 (미터, 기타는 하나로) */
  byExercise: Partial<Record<CardioExerciseId, number>>;
};

const emptyTotals = (): DistanceTotals => ({ count: 0, yangchoM: 0, tawiM: 0, jointM: 0, byExercise: {} });

function accepts(day: string, o: TotalsOptions): boolean {
  if (o.from !== undefined && day < o.from) return false;
  if (o.to !== undefined && day > o.to) return false;
  const scope = o.scope ?? 'all';
  if (scope === 'all') return true;
  if (!o.sessionDays) throw new RangeError('세션이 있는 날 목록(sessionDays)이 필요해요');
  return scope === 'withSession' ? o.sessionDays.has(day) : !o.sessionDays.has(day);
}

/** 시즌 전체(또는 날짜 범위)의 유산소 거리 합계. 주가 바뀌어도, 35km를 넘어도 초기화하지 않아요 */
export function totalDistance(book: LogBook, options: TotalsOptions = {}): DistanceTotals {
  const season = options.season ?? SEASON_ID;
  const t = emptyTotals();
  for (const l of book.logs) {
    if (!isCardioLog(l) || l.status !== 'active' || l.season !== season || !accepts(l.day, options)) continue;
    t.count += 1;
    if (l.person === 'yangcho') t.yangchoM += l.distanceM;
    else t.tawiM += l.distanceM;
    t.jointM += l.distanceM;
    t.byExercise[l.exerciseId] = (t.byExercise[l.exerciseId] ?? 0) + l.distanceM;
  }
  return t;
}

/** 그 날이 속한 주의 월요일 (주는 월~일) */
export function weekStartOf(day: string): string {
  if (!isPlanDay(day)) throw new RangeError(`날짜 형식이 맞지 않아요: ${day}`);
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay(); // 0=일요일
  return addDays(day, -((dow + 6) % 7));
}

export type WeeklyDistance = DistanceTotals & {
  /** 주의 월요일 */
  weekStart: string;
  /** 주의 일요일 */
  weekEnd: string;
};

/** 주(월~일)별 합계, 오래된 주부터. 기록이 있는 주만 나와요 (시즌 누적과는 별개 계산) */
export function weeklyDistance(book: LogBook, options: Omit<TotalsOptions, 'from' | 'to'> = {}): WeeklyDistance[] {
  const days = new Set<string>();
  const season = options.season ?? SEASON_ID;
  for (const l of book.logs) if (isCardioLog(l) && l.status === 'active' && l.season === season) days.add(weekStartOf(l.day));
  return [...days]
    .sort()
    .map((weekStart) => {
      const weekEnd = addDays(weekStart, 6);
      return { ...totalDistance(book, { ...options, from: weekStart, to: weekEnd }), weekStart, weekEnd };
    })
    .filter((w) => w.count > 0);
}

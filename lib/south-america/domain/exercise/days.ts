// "날짜별 운동" 목록의 계산 [5-A, 화면은 5-B]. ❤️ 공동 운동 세션이 있는 날과 유산소 기록만 있는 날을 함께 보여 주려고 준비해요.
// 읽기만 해요: 유산소 기록을 저장했다는 이유로 하루 상태나 공동 운동 세션, 운동 완료 기록을 만들지 않아요.
import type { DayState } from '../day/day';
import { sessionOf } from '../day/session';
import type { WorkoutSessionRow } from '../day/workout';
import { cardioLogs } from './logs';
import type { CardioLog, LogBook } from './types';

/** ❤️ 공동 시작이 있었던 날들 (오늘 + 보관된 날). 합계 범위(withSession/solo)를 고를 때 써요 */
export function sessionDayKeys(days: { day: string; state: DayState }[], current: DayState): Set<string> {
  const out = new Set<string>();
  for (const d of [...days, { day: current.day, state: current }]) if (sessionOf(d.state)) out.add(d.day);
  return out;
}

export type WorkoutDayRow = {
  day: string;
  /** ❤️ 세션이 있는 날이면 그 세션 (없으면 null = 혼자 운동한 날) */
  session: WorkoutSessionRow | null;
  /** 그 날의 유산소 기록 (취소된 것 포함, 최근 입력부터) */
  cardio: CardioLog[];
  /** 유효한 유산소 기록 수 / 거리 합계(미터) */
  activeCount: number;
  distanceM: { yangcho: number; tawi: number; joint: number };
};

/**
 * 세션이 있는 날 ∪ 유산소 기록이 있는 날을 최신 날짜부터. 같은 날이면 한 줄로 합쳐요.
 * (세션 목록은 listWorkoutSessions의 결과를 그대로 받아요.)
 */
export function listWorkoutDays(sessions: WorkoutSessionRow[], book: LogBook): WorkoutDayRow[] {
  const rows = new Map<string, WorkoutDayRow>();
  const row = (day: string): WorkoutDayRow => {
    let r = rows.get(day);
    if (!r) {
      r = { day, session: null, cardio: [], activeCount: 0, distanceM: { yangcho: 0, tawi: 0, joint: 0 } };
      rows.set(day, r);
    }
    return r;
  };
  for (const s of sessions) row(s.day).session = s;
  const logs = cardioLogs(book)
    .map((l, i) => ({ l, i }))
    .sort((a, b) => (a.l.recordedAt !== b.l.recordedAt ? (a.l.recordedAt < b.l.recordedAt ? 1 : -1) : b.i - a.i));
  for (const { l } of logs) {
    const r = row(l.day);
    r.cardio.push(l);
    if (l.status !== 'active') continue;
    r.activeCount += 1;
    r.distanceM[l.person] += l.distanceM;
    r.distanceM.joint += l.distanceM;
  }
  return [...rows.values()].sort((a, b) => (a.day < b.day ? 1 : -1));
}

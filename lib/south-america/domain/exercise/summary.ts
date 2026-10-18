// 유산소 화면용 요약 계산 [5-B]. 5-A의 합계 함수를 화면에 필요한 묶음으로 모을 뿐, 규칙은 새로 만들지 않아요.
// 모두 읽기만 해요: 이 요약을 만든다고 기록·하루 상태·세션이 생기지 않아요.
import { addDays } from '../time';
import { totalDistance, weekStartOf, type DistanceTotals } from './aggregate';
import { listCardioLogs } from './logs';
import type { CardioLog, LogBook } from './types';

export type CardioTotalsView = {
  /** 시즌 전체 (주가 바뀌어도, 35km를 넘어도 초기화하지 않아요) */
  season: DistanceTotals;
  /** 오늘이 속한 주(월~일). 기록이 없어도 0으로 나와요 */
  week: DistanceTotals & { weekStart: string; weekEnd: string };
};

/**
 * 시즌·이번 주 합계. 혼자 한 날도 포함해요(scope all): 이 숫자는 "실제로 입력된 유산소 거리"이고
 * Adventure KM(게임 속 가상 거리)과 별개예요. 혼자 한 유산소를 패스포트에 인정할지는 아직 미결정이라 구분 합계는 만들지 않아요.
 */
export function cardioTotalsView(book: LogBook, today: string): CardioTotalsView {
  const weekStart = weekStartOf(today);
  const weekEnd = addDays(weekStart, 6);
  return { season: totalDistance(book), week: { ...totalDistance(book, { from: weekStart, to: weekEnd }), weekStart, weekEnd } };
}

/** 그 날의 유산소 기록 (취소된 것 포함, 최근 입력부터). 취소된 기록은 화면에서 흐리게 보여 줘요 */
export const cardioOfDay = (book: LogBook, day: string): CardioLog[] => listCardioLogs(book, { day, includeCancelled: true });

/** 그 날 유효한 기록의 사람별·공동 합계(미터) */
export function dayDistance(logs: CardioLog[]): { yangcho: number; tawi: number; joint: number } {
  const t = { yangcho: 0, tawi: 0, joint: 0 };
  for (const l of logs) {
    if (l.status !== 'active') continue;
    t[l.person] += l.distanceM;
    t.joint += l.distanceM;
  }
  return t;
}

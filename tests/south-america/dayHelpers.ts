import { createDayState, liveDay, setEtaMode, type ActionResult, type DayState } from '@/lib/south-america/domain/day/day';
import type { Timeline } from '@/lib/south-america/domain/timeline/types';
import { C, at, node } from './helpers';

export { C, at, node };
export const DAY = '2026-10-15';

/** 둘 다 지하철, 본인이 직접 입력한 ETA (기본 18:20 / 18:50) */
export function newDay(y = '18:20', t = '18:50'): DayState {
  let s = createDayState(DAY);
  s = setEtaMode(s, 'yangcho', 'subway', { station_arrival: C(y) }, 'yangcho');
  s = setEtaMode(s, 'tawi', 'subway', { station_arrival: C(t) }, 'tawi');
  return s;
}

/** 동작이 성공해야 하는 곳에서 쓰는 도우미 */
export function must(r: ActionResult): DayState {
  if (!r.ok) throw new Error(`동작이 거부됐어요: ${r.reason}`);
  return r.state;
}

export const tlOf = (s: DayState, now: number | null = null): Timeline => liveDay(s, now).timeline;

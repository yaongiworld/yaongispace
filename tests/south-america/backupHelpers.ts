import { createDayState, liveDay, pressHeart, setDesiredMealStart, setEtaMode, setPlan, type ActionResult, type DayState } from '@/lib/south-america/domain/day/day';
import { archiveEntry, emptyBook, putArchive, type DayBook } from '@/lib/south-america/domain/day/daybook';
import { KEYS, serializeHistory } from '@/lib/south-america/domain/day/persist';
import { completeWorkout, editWorkoutTime } from '@/lib/south-america/domain/day/workout';
import { LOGS_KEYS, serializeLogBook } from '@/lib/south-america/domain/exercise/storage';
import type { LogBook } from '@/lib/south-america/domain/exercise/types';
import { MemStore, KST, add, book0 } from './exerciseHelpers';
import { clockToPlanMinutes as C } from '@/lib/south-america/domain/time';

export { C, KST, MemStore };
export const TODAY = '2026-10-18';
export const NOW = KST(TODAY, '18:00');

export function ok(r: ActionResult): DayState {
  if (!r.ok) throw new Error(`동작이 거부됐어요: ${r.reason}`);
  return r.state;
}

/** 오늘의 ETA·PLAN B·희망 저녁·❤️ 시작·양쪽 운동 완료(대신 입력과 시각 수정 이력 포함)가 모두 있는 하루 */
export function richDay(day = TODAY): DayState {
  let s = createDayState(day);
  s = setEtaMode(s, 'yangcho', 'subway', { station_arrival: C('18:20') }, 'yangcho'); // 본인 입력 ✅
  s = setEtaMode(s, 'tawi', 'subway', { station_arrival: C('18:50') }, 'yangcho'); // 양초가 넣은 타위의 ETA → 상대 추정 🙋
  s = ok(setPlan(s, 'B', 'yangcho'));
  s = ok(setDesiredMealStart(s, C('22:00')));
  s = ok(pressHeart(s, C('19:40'), 'tawi'));
  const rec = (by: 'yangcho' | 'tawi', hhmm: string) => ({ by, recordedAt: KST(day, hhmm) });
  s = ok(completeWorkout(s, 'yangcho', C('20:50'), rec('yangcho', '20:51')));
  s = ok(completeWorkout(s, 'tawi', C('21:00'), rec('yangcho', '21:02'))); // 양초가 대신 입력
  s = ok(editWorkoutTime(s, 'tawi', C('21:05'), rec('tawi', '21:10'))); // 시각 수정 이력
  return s;
}

export const sessionDay = (day: string): DayState => ok(pressHeart(setEtaMode(createDayState(day), 'tawi', 'subway', { station_arrival: C('18:50') }, 'tawi'), C('20:00'), 'yangcho'));
export const etaDay = (day: string, hhmm: string): DayState => setEtaMode(createDayState(day), 'yangcho', 'subway', { station_arrival: C(hhmm) }, 'yangcho');

export function bookOf(current: DayState, archived: DayState[] = []): DayBook {
  let b = emptyBook(current);
  for (const a of archived) b = putArchive(b, archiveEntry(a, 'rollover', '2026-10-17T20:00:00.000Z'));
  return b;
}

export function logsOf(): LogBook {
  let l = book0();
  l = add(l, { logId: 'solo-1', day: '2026-10-12', person: 'yangcho', distanceM: 3000, recordedAt: KST('2026-10-18', '09:00') });
  l = add(l, { logId: 'solo-2', day: '2026-10-12', person: 'tawi', exerciseId: 'indoor_bike', distanceM: 8200, recordedAt: KST('2026-10-18', '09:01') });
  return l;
}

/** 저장소에 하루 장부와 유산소 기록을 앱이 쓰는 방식 그대로 심어요 */
export function seed(store: MemStore, book: DayBook, logs?: LogBook): void {
  store.setItem(KEYS.day, JSON.stringify(book.current));
  store.setItem(KEYS.days, serializeHistory(book));
  if (logs) store.setItem(LOGS_KEYS.logs, serializeLogBook(logs));
}

export const timelineEnd = (s: DayState) => liveDay(s, null).timeline.summary.workoutEnd;
export const live = (book: DayBook, storageBlocked = false) => ({ book, storageBlocked });
export const CTX = { nowIso: NOW, app: { name: 'south-america-prototype', version: '0.0.1' }, origin: 'http://127.0.0.1:5174', persona: 'yangcho' as const };

// 5-A: ❤️ 세션이 있는 날과 유산소 기록만 있는 날을 함께 조회하는 준비, 그리고 유산소 기록이 세션·완료를 만들지 않는 것.
import { describe, expect, it } from 'vitest';
import { createDayState, pressHeart, type DayState } from '@/lib/south-america/domain/day/day';
import { sessionOf } from '@/lib/south-america/domain/day/session';
import { completeWorkout, listWorkoutSessions, pendingWorkoutSessions, workoutSession } from '@/lib/south-america/domain/day/workout';
import { listWorkoutDays, sessionDayKeys } from '@/lib/south-america/domain/exercise/days';
import { cancelCardio } from '@/lib/south-america/domain/exercise/logs';
import { add, book0, KST, must } from './exerciseHelpers';

const C = (hh: number, mm = 0) => hh * 60 + mm;
const withHeart = (day: string): DayState => {
  const r = pressHeart(createDayState(day), C(20), 'yangcho');
  if (!r.ok) throw new Error(r.reason);
  return r.state;
};

describe('날짜별 운동 목록 계산 (세션 날 ∪ 유산소 날)', () => {
  it('세션만 있는 날, 유산소만 있는 날(혼자 운동), 둘 다 있는 날이 한 목록에 최신순으로 나온다', () => {
    const today = createDayState('2026-10-18');
    const archived = [
      { day: '2026-10-16', state: withHeart('2026-10-16') }, // 세션만
      { day: '2026-10-15', state: withHeart('2026-10-15') }, // 세션 + 유산소
    ];
    const sessions = listWorkoutSessions(archived, today);
    let logs = add(book0(), { logId: 'a', day: '2026-10-15', person: 'yangcho', distanceM: 3000, recordedAt: KST('2026-10-18', '09:00') });
    logs = add(logs, { logId: 'b', day: '2026-10-15', person: 'tawi', exerciseId: 'indoor_bike', distanceM: 8200, recordedAt: KST('2026-10-18', '09:01') });
    logs = add(logs, { logId: 'c', day: '2026-10-17', person: 'tawi', distanceM: 5000, recordedAt: KST('2026-10-18', '09:02') }); // ❤️ 없는 날
    logs = add(logs, { logId: 'd', day: '2026-10-01', person: 'yangcho', distanceM: 1000, recordedAt: KST('2026-10-18', '09:03') }); // 아주 오래된 ❤️ 없는 날
    const rows = listWorkoutDays(sessions, logs);
    expect(rows.map((r) => [r.day, r.session !== null, r.cardio.map((l) => l.logId)])).toEqual([
      ['2026-10-17', false, ['c']],
      ['2026-10-16', true, []],
      ['2026-10-15', true, ['b', 'a']],
      ['2026-10-01', false, ['d']],
    ]);
    expect(rows[0]).toMatchObject({ activeCount: 1, distanceM: { yangcho: 0, tawi: 5000, joint: 5000 } });
    expect(rows[2]).toMatchObject({ activeCount: 2, distanceM: { yangcho: 3000, tawi: 8200, joint: 11200 } });
    expect(rows[1]).toMatchObject({ activeCount: 0, distanceM: { yangcho: 0, tawi: 0, joint: 0 } });
  });

  it('취소된 기록만 있는 날도 목록에 남아서 복구할 수 있다 (합계는 0)', () => {
    const b = must(cancelCardio(add(book0(), { logId: 'a', day: '2026-10-10' }), 'a', { by: 'yangcho', at: KST('2026-10-18', '12:00') }));
    const rows = listWorkoutDays([], b);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ day: '2026-10-10', session: null, activeCount: 0 });
    expect(rows[0].cardio.map((l) => [l.logId, l.status])).toEqual([['a', 'cancelled']]);
  });

  it('세션이 있는 날 목록(합계 범위 계산용)에는 ❤️가 있는 날만 들어간다', () => {
    const keys = sessionDayKeys([{ day: '2026-10-16', state: withHeart('2026-10-16') }, { day: '2026-10-14', state: createDayState('2026-10-14') }], withHeart('2026-10-18'));
    expect([...keys].sort()).toEqual(['2026-10-16', '2026-10-18']);
  });
});

describe('유산소 기록은 공동 운동 세션이나 운동 완료를 만들지 않는다', () => {
  it('❤️ 없는 날에 유산소를 기록해도 세션·완료·미기록 입구가 생기지 않는다', () => {
    const day = createDayState('2026-10-17');
    const before = JSON.stringify(day);
    const logs = add(add(book0(), { day: '2026-10-17', person: 'yangcho' }), { day: '2026-10-17', person: 'tawi', logId: 'x' });
    // 하루 상태는 건드리지 않았고(도메인이 상태를 받지도 않음), 세션은 ❤️ 기록으로만 생긴다
    expect(JSON.stringify(day)).toBe(before);
    expect(sessionOf(day)).toBeNull();
    expect(workoutSession(day).status).toBe('none');
    expect(listWorkoutSessions([{ day: '2026-10-17', state: day }], createDayState('2026-10-18'))).toEqual([]);
    expect(pendingWorkoutSessions([{ day: '2026-10-17', state: day }], '2026-10-18')).toEqual([]);
    expect(Object.keys(day.actuals.steps)).toEqual([]);
    // 운동 완료는 세션이 없으면 기록할 수도 없다(유산소 기록이 있어도)
    expect(completeWorkout(day, 'yangcho', C(21), { by: 'yangcho', recordedAt: KST('2026-10-17', '21:10') })).toMatchObject({ ok: false, reason: 'no_session' });
    // 목록에는 "세션 없는 날"로 나온다
    expect(listWorkoutDays([], logs)[0]).toMatchObject({ day: '2026-10-17', session: null, activeCount: 2 });
  });

  it('반대로 ❤️ 세션과 완료 기록이 있는 날에 유산소를 더해도 완료 상태가 바뀌지 않는다', () => {
    const day = withHeart('2026-10-17');
    const done = completeWorkout(day, 'yangcho', C(21), { by: 'yangcho', recordedAt: KST('2026-10-17', '21:10') });
    if (!done.ok) throw new Error(done.reason);
    const before = JSON.stringify(done.state);
    add(book0(), { day: '2026-10-17', person: 'yangcho' });
    expect(JSON.stringify(done.state)).toBe(before);
    expect(workoutSession(done.state).status).toBe('in_progress');
  });
});

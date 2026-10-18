// 5-A 유산소 누적: 개인별·공동·종목별·주간·시즌 합계. 환산 없는 1:1 정수 합산, 수정·취소·복구하면 저절로 다시 계산.
import { describe, expect, it } from 'vitest';
import { formatKm } from '@/lib/south-america/domain/exercise/distance';
import { sessionDayKeys } from '@/lib/south-america/domain/exercise/days';
import { totalDistance, weekStartOf, weeklyDistance } from '@/lib/south-america/domain/exercise/aggregate';
import { cancelCardio, editCardio, restoreCardio } from '@/lib/south-america/domain/exercise/logs';
import type { LogBook } from '@/lib/south-america/domain/exercise/types';
import { createDayState, pressHeart } from '@/lib/south-america/domain/day/day';
import { add, book0, KST, must } from './exerciseHelpers';

const AT = KST('2026-10-18', '12:00');
const km = (m: number) => formatKm(m);

describe('시즌 누적: 개인별 + 공동', () => {
  it('양초 러닝 3.0km + 타위 사이클 8.2km → 공동 11.2km (환산 없음)', () => {
    let b = add(book0(), { person: 'yangcho', exerciseId: 'treadmill_run', distanceM: 3000, day: '2026-10-18' });
    b = add(b, { person: 'tawi', exerciseId: 'indoor_bike', distanceM: 8200, day: '2026-10-18' });
    const t = totalDistance(b);
    expect(t).toMatchObject({ count: 2, yangchoM: 3000, tawiM: 8200, jointM: 11200 });
    expect(km(t.jointM)).toBe('11.2');
    expect(t.byExercise).toEqual({ treadmill_run: 3000, indoor_bike: 8200 });
  });

  it('종목·강도에 따른 환산이 없다: 같은 거리는 종목과 상관없이 같은 값', () => {
    const exercises = ['treadmill_run', 'treadmill_walk', 'incline_walk', 'indoor_bike', 'outdoor_run', 'outdoor_walk'];
    for (const exerciseId of exercises) {
      expect(totalDistance(add(book0(), { exerciseId, distanceM: 5500 })).jointM).toBe(5500);
    }
    const other = add(book0(), { exerciseId: 'other', customName: '줄넘기', distanceM: 700 });
    expect(totalDistance(other).jointM).toBe(700);
    // 시간이 길어도 거리는 그대로
    expect(totalDistance(add(book0(), { minutes: 600, distanceM: 1000 })).jointM).toBe(1000);
  });

  it('두 사람이 각각 입력한 거리는 그대로 더한다 (대신 입력해도 운동한 사람 몫)', () => {
    const b = add(add(book0(), { person: 'yangcho', enteredBy: 'tawi', distanceM: 3000 }), { person: 'tawi', enteredBy: 'tawi', distanceM: 2000 });
    expect(totalDistance(b)).toMatchObject({ yangchoM: 3000, tawiM: 2000, jointM: 5000 });
  });

  it('주가 바뀌어도, 35km를 넘어도 시즌 누적은 초기화되지 않는다 (바퀴 계산 없음)', () => {
    let b = book0();
    for (let i = 0; i < 12; i++) b = add(b, { day: `2026-10-${String(1 + i).padStart(2, '0')}`, person: i % 2 ? 'tawi' : 'yangcho', distanceM: 4000 });
    const t = totalDistance(b);
    expect(t.jointM).toBe(48000);
    expect(km(t.jointM)).toBe('48.0'); // 35.0에서 멈추거나 되돌아가지 않음
    expect(t.count).toBe(12);
  });

  it('0.1km 기록 1000건 합계에 오차가 없다', () => {
    let b = book0();
    for (let i = 0; i < 1000; i++) b = add(b, { distanceM: 100, day: '2026-10-10' });
    expect(totalDistance(b).jointM).toBe(100_000);
    expect(km(totalDistance(b).jointM)).toBe('100.0');
  });
});

describe('수정·취소·복구하면 합계가 다시 계산된다', () => {
  const base = () => {
    let b = add(book0(), { logId: 'a', person: 'yangcho', distanceM: 3000, day: '2026-10-18' });
    b = add(b, { logId: 'b', person: 'tawi', exerciseId: 'indoor_bike', distanceM: 8200, day: '2026-10-18' });
    return b;
  };

  it('취소하면 빠지고 복구하면 돌아오며, 여러 번 반복해도 한 번만 센다', () => {
    let b = base();
    expect(totalDistance(b).jointM).toBe(11200);
    b = must(cancelCardio(b, 'b', { by: 'yangcho', at: AT }));
    expect(totalDistance(b)).toMatchObject({ count: 1, tawiM: 0, jointM: 3000 });
    b = must(restoreCardio(b, 'b', { by: 'yangcho', at: AT }));
    expect(totalDistance(b).jointM).toBe(11200);
    for (let i = 0; i < 5; i++) {
      b = must(cancelCardio(b, 'b', { by: 'tawi', at: AT }));
      b = must(restoreCardio(b, 'b', { by: 'tawi', at: AT }));
    }
    expect(totalDistance(b)).toMatchObject({ count: 2, jointM: 11200 });
  });

  it('거리·종목을 고치면 새 값으로 합계와 종목별 합계가 바뀐다', () => {
    const b = must(editCardio(base(), 'a', { distanceM: 4500, exerciseId: 'outdoor_run' }, { by: 'yangcho', at: AT }));
    const t = totalDistance(b);
    expect(t).toMatchObject({ yangchoM: 4500, jointM: 12700 });
    expect(t.byExercise).toEqual({ outdoor_run: 4500, indoor_bike: 8200 });
  });

  it('날짜를 고치면 주간 합계가 따라 옮겨 간다 (시즌 합계는 그대로)', () => {
    const b0 = base(); // 둘 다 2026-10-18(일, 10/12 주)
    expect(weeklyDistance(b0).map((w) => [w.weekStart, w.jointM])).toEqual([['2026-10-12', 11200]]);
    const b = must(editCardio(b0, 'a', { day: '2026-10-19' }, { by: 'yangcho', at: KST('2026-10-19', '10:00') }));
    expect(weeklyDistance(b).map((w) => [w.weekStart, w.jointM])).toEqual([['2026-10-12', 8200], ['2026-10-19', 3000]]);
    expect(totalDistance(b).jointM).toBe(11200);
  });
});

describe('주간 누적 (월~일)', () => {
  it('주의 시작은 월요일이다', () => {
    expect(weekStartOf('2026-10-19')).toBe('2026-10-19'); // 월
    expect(weekStartOf('2026-10-18')).toBe('2026-10-12'); // 일 → 그 주의 월요일
    expect(weekStartOf('2026-10-14')).toBe('2026-10-12'); // 수
    expect(weekStartOf('2026-10-12')).toBe('2026-10-12');
    expect(weekStartOf('2026-03-01')).toBe('2026-02-23'); // 달을 넘어감
    expect(() => weekStartOf('아님')).toThrow();
  });

  it('주별 합계는 오래된 주부터, 기록이 있는 주만, 개인별·공동으로 나온다', () => {
    let b = book0();
    b = add(b, { day: '2026-10-05', person: 'yangcho', distanceM: 3000 }); // 10/5 주
    b = add(b, { day: '2026-10-11', person: 'tawi', distanceM: 2000 }); // 일요일 = 10/5 주
    b = add(b, { day: '2026-10-12', person: 'yangcho', distanceM: 4000 }); // 월요일 = 다음 주
    b = add(b, { day: '2026-10-18', person: 'tawi', distanceM: 8200 }); // 일요일
    b = add(b, { day: '2026-09-28', person: 'yangcho', distanceM: 1000, logId: 'old' }); // 지지난주
    const w = weeklyDistance(b);
    expect(w.map((x) => [x.weekStart, x.weekEnd, x.yangchoM, x.tawiM, x.jointM, x.count])).toEqual([
      ['2026-09-28', '2026-10-04', 1000, 0, 1000, 1],
      ['2026-10-05', '2026-10-11', 3000, 2000, 5000, 2],
      ['2026-10-12', '2026-10-18', 4000, 8200, 12200, 2],
    ]);
    // 지난주·지지난주를 포함한 시즌 합계
    expect(totalDistance(b).jointM).toBe(18200);
  });

  it('취소만 남은 주는 나오지 않는다', () => {
    const b = must(cancelCardio(add(book0(), { logId: 'a', day: '2026-10-05' }), 'a', { by: 'yangcho', at: AT }));
    expect(weeklyDistance(b)).toEqual([]);
  });

  it('날짜 범위(from/to)로도 합계를 낼 수 있다', () => {
    let b = add(book0(), { day: '2026-10-01', distanceM: 1000 });
    b = add(b, { day: '2026-10-10', distanceM: 2000 });
    b = add(b, { day: '2026-10-17', distanceM: 4000 });
    expect(totalDistance(b, { from: '2026-10-05', to: '2026-10-15' }).jointM).toBe(2000);
    expect(totalDistance(b, { from: '2026-10-10' }).jointM).toBe(6000);
  });
});

describe('시즌과 알 수 없는 기록', () => {
  it('다른 시즌의 기록은 시즌 합계에 섞이지 않는다 (시즌을 넘어서도 원본은 보존)', () => {
    const b = add(book0(), { distanceM: 3000 });
    const s2: LogBook = { ...b, logs: [...b.logs, { ...(b.logs[0] as object), logId: 'next-season', season: 2, distanceM: 9000 } as never] };
    expect(totalDistance(s2).jointM).toBe(3000);
    expect(totalDistance(s2, { season: 2 }).jointM).toBe(9000);
    expect(s2.logs).toHaveLength(2);
  });

  it('알 수 없는 종류의 기록은 합계에 넣지 않는다', () => {
    const b: LogBook = { logs: [{ kind: 'strength', logId: 'w', distanceM: 99999, weightKg: 20 }], quarantine: [] };
    expect(totalDistance(add(b, { distanceM: 3000 })).jointM).toBe(3000);
  });
});

describe('범위 선택 (혼자 한 유산소의 패스포트 인정은 미정이라 계산만 지원)', () => {
  it('기본은 전체이고, 세션이 있던 날/없던 날로 나눠 계산할 수 있다', () => {
    let current = createDayState('2026-10-18');
    current = must2(pressHeart(current, 20 * 60, 'yangcho'));
    const sessionDays = sessionDayKeys([{ day: '2026-10-17', state: createDayState('2026-10-17') }], current);
    expect([...sessionDays]).toEqual(['2026-10-18']);
    let b = add(book0(), { day: '2026-10-18', distanceM: 3000 }); // 함께 운동한 날
    b = add(b, { day: '2026-10-17', person: 'tawi', distanceM: 8200 }); // 혼자 한 날
    expect(totalDistance(b).jointM).toBe(11200); // 기본: 전체
    expect(totalDistance(b, { scope: 'withSession', sessionDays }).jointM).toBe(3000);
    expect(totalDistance(b, { scope: 'solo', sessionDays })).toMatchObject({ jointM: 8200, tawiM: 8200 });
    expect(() => totalDistance(b, { scope: 'solo' })).toThrow(RangeError);
  });
});

function must2(r: ReturnType<typeof pressHeart>) {
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

// 5-B 화면용 요약: 시즌·주 합계, 그 날의 기록. 5-A 합계 규칙과 같은 값이 나와야 한다.
import { describe, expect, it } from 'vitest';
import { totalDistance } from '@/lib/south-america/domain/exercise/aggregate';
import { cancelCardio } from '@/lib/south-america/domain/exercise/logs';
import { cardioOfDay, cardioTotalsView, dayDistance } from '@/lib/south-america/domain/exercise/summary';
import { add, book0, KST } from './exerciseHelpers';

// 2026-10-18은 일요일 → 그 주는 10/12(월)~10/18(일)
const base = () => {
  let b = book0();
  b = add(b, { logId: 'w1', day: '2026-10-12', person: 'yangcho', distanceM: 3000 }); // 월
  b = add(b, { logId: 'w2', day: '2026-10-18', person: 'tawi', exerciseId: 'indoor_bike', distanceM: 8200 }); // 일
  b = add(b, { logId: 'old', day: '2026-10-11', person: 'yangcho', distanceM: 5000 }); // 지난주 일요일
  return b;
};

describe('시즌·이번 주 합계', () => {
  it('시즌은 전체를, 이번 주는 월~일만 더한다 (정수 미터, 1:1 합산)', () => {
    const v = cardioTotalsView(base(), '2026-10-18');
    expect(v.season).toMatchObject({ count: 3, yangchoM: 8000, tawiM: 8200, jointM: 16200 });
    expect(v.week).toMatchObject({ weekStart: '2026-10-12', weekEnd: '2026-10-18', count: 2, yangchoM: 3000, tawiM: 8200, jointM: 11200 });
  });

  it('주 경계: 월요일이 되면 새 주가 시작되고 시즌 누적은 그대로다', () => {
    const v = cardioTotalsView(base(), '2026-10-19');
    expect(v.week).toMatchObject({ weekStart: '2026-10-19', weekEnd: '2026-10-25', count: 0, jointM: 0 });
    expect(v.season.jointM).toBe(16200);
  });

  it('기록이 없어도 0으로 나온다', () => {
    const v = cardioTotalsView(book0(), '2026-10-18');
    expect(v.season).toMatchObject({ count: 0, jointM: 0 });
    expect(v.week).toMatchObject({ count: 0, jointM: 0, weekStart: '2026-10-12' });
  });

  it('5-A 합계와 같은 값이다 (새 규칙을 만들지 않는다)', () => {
    expect(cardioTotalsView(base(), '2026-10-18').season).toEqual(totalDistance(base()));
  });

  it('취소하면 빠지고 ❤️ 없는 날의 기록도 들어간다', () => {
    const r = cancelCardio(base(), 'w2', { by: 'yangcho', at: KST('2026-10-18', '12:00') });
    if (!r.ok) throw new Error(r.reason);
    const v = cardioTotalsView(r.book, '2026-10-18');
    expect(v.week.jointM).toBe(3000);
    expect(v.season.jointM).toBe(8000);
  });
});

describe('그 날의 기록', () => {
  it('취소된 기록도 포함하고 최근 입력이 먼저, 합계는 유효 기록만', () => {
    let b = book0();
    b = add(b, { logId: 'a', day: '2026-10-17', person: 'yangcho', distanceM: 3000, recordedAt: KST('2026-10-17', '10:00') });
    b = add(b, { logId: 'b', day: '2026-10-17', person: 'tawi', distanceM: 2000, recordedAt: KST('2026-10-17', '11:00') });
    b = add(b, { logId: 'c', day: '2026-10-16', person: 'tawi', distanceM: 9000, recordedAt: KST('2026-10-17', '12:00') });
    const c = cancelCardio(b, 'b', { by: 'tawi', at: KST('2026-10-17', '12:00') });
    if (!c.ok) throw new Error(c.reason);
    const logs = cardioOfDay(c.book, '2026-10-17');
    expect(logs.map((l) => l.logId)).toEqual(['b', 'a']);
    expect(logs[0].status).toBe('cancelled');
    expect(dayDistance(logs)).toEqual({ yangcho: 3000, tawi: 0, joint: 3000 });
    expect(cardioOfDay(c.book, '2026-10-15')).toEqual([]);
  });
});

// 5-A 유산소 기록 도메인: 필수 필드, 날짜, 중복 방지, 수정·취소·복구 이력, 읽기.
import { describe, expect, it } from 'vitest';
import { cancelCardio, cardioLogs, editCardio, findSimilarLogs, latestCardio, listCardioLogs, recordCardio, restoreCardio } from '@/lib/south-america/domain/exercise/logs';
import { isCardioLog, type CardioLog, type LogBook } from '@/lib/south-america/domain/exercise/types';
import { add, book0, input, KST, must } from './exerciseHelpers';

const one = (book: LogBook, id: string): CardioLog => {
  const l = book.logs.find((x) => x.logId === id);
  if (!l || !isCardioLog(l)) throw new Error('기록이 없어요');
  return l;
};
const AT = KST('2026-10-18', '12:00');

describe('기록하기: 종목·시간·거리 필수, 속도·경사 없음', () => {
  it('유효한 입력이면 원본 값과 첫 이력(recorded)이 보존된다', () => {
    const b = must(recordCardio(book0(), input({ logId: 'a', person: 'tawi', enteredBy: 'yangcho', exerciseId: 'indoor_bike', minutes: 45, distanceM: 8200, recordedAt: KST('2026-10-18', '09:30') })));
    const l = one(b, 'a');
    expect(l).toMatchObject({ kind: 'cardio', season: 1, day: '2026-10-18', person: 'tawi', enteredBy: 'yangcho', exerciseId: 'indoor_bike', customName: null, minutes: 45, distanceM: 8200, status: 'active' });
    expect(l.recordedAt).toBe(KST('2026-10-18', '09:30'));
    expect(l.revisions).toEqual([{ kind: 'recorded', by: 'yangcho', at: KST('2026-10-18', '09:30'), snapshot: { day: '2026-10-18', person: 'tawi', exerciseId: 'indoor_bike', customName: null, minutes: 45, distanceM: 8200 } }]);
  });

  it('속도·경사·거리 없음 같은 필드는 기록에 없다', () => {
    const l = one(add(book0(), { logId: 'a' }), 'a');
    expect(Object.keys(l).sort()).toEqual(['customName', 'day', 'distanceM', 'enteredBy', 'exerciseId', 'kind', 'logId', 'minutes', 'person', 'recordedAt', 'revisions', 'season', 'status']);
  });

  it('시간(분)은 1 이상의 정수여야 한다', () => {
    for (const minutes of [0, -5, 1.5, Number.NaN, '30' as unknown as number, Number.POSITIVE_INFINITY]) {
      expect(recordCardio(book0(), input({ minutes }))).toEqual({ ok: false, reason: 'invalid_minutes' });
    }
    expect(recordCardio(book0(), input({ minutes: 1 })).ok).toBe(true);
  });

  it('거리는 필수이고 0보다 큰 100의 배수 정수 미터여야 한다 (거리 없는 기록·반올림 없음)', () => {
    for (const distanceM of [0, -100, 150, 2750, 3000.5, Number.NaN, undefined as unknown as number, null as unknown as number]) {
      expect(recordCardio(book0(), input({ distanceM }))).toEqual({ ok: false, reason: 'invalid_distance' });
    }
    expect(recordCardio(book0(), input({ distanceM: 100 })).ok).toBe(true);
  });

  it('종목은 등록된 고정 ID여야 하고, 기타는 운동명 1~30글자가 필요하다', () => {
    expect(recordCardio(book0(), input({ exerciseId: 'stepmill' })).ok).toBe(false);
    expect(recordCardio(book0(), input({ exerciseId: '러닝머신 달리기' }))).toEqual({ ok: false, reason: 'unknown_exercise' });
    for (const id of ['treadmill_run', 'treadmill_walk', 'incline_walk', 'indoor_bike', 'outdoor_run', 'outdoor_walk']) expect(recordCardio(book0(), input({ exerciseId: id })).ok).toBe(true);
    // 기타
    expect(recordCardio(book0(), input({ exerciseId: 'other' }))).toEqual({ ok: false, reason: 'invalid_custom_name' });
    expect(recordCardio(book0(), input({ exerciseId: 'other', customName: '   ' }))).toEqual({ ok: false, reason: 'invalid_custom_name' });
    expect(recordCardio(book0(), input({ exerciseId: 'other', customName: 'a'.repeat(31) }))).toEqual({ ok: false, reason: 'invalid_custom_name' });
    const ok30 = must(recordCardio(book0(), input({ logId: 'x', exerciseId: 'other', customName: `  ${'가'.repeat(30)} ` })));
    expect(one(ok30, 'x').customName).toBe('가'.repeat(30)); // 앞뒤 공백은 지움, 30글자 허용
    const emoji = must(recordCardio(book0(), input({ logId: 'e', exerciseId: 'other', customName: '🏃'.repeat(30) })));
    expect(one(emoji, 'e').customName).toBe('🏃'.repeat(30)); // 이모지도 한 글자로 셈
    expect(recordCardio(book0(), input({ exerciseId: 'other', customName: '🏃'.repeat(31) }))).toEqual({ ok: false, reason: 'invalid_custom_name' });
  });

  it('기타가 아닌 종목에 운동명을 줘도 저장하지 않는다', () => {
    const b = must(recordCardio(book0(), input({ logId: 'a', exerciseId: 'outdoor_run', customName: '아무 이름' })));
    expect(one(b, 'a').customName).toBeNull();
  });

  it('운동한 사람·입력한 사람은 양초/타위만 가능하고 입력 순간은 올바른 시각이어야 한다', () => {
    expect(recordCardio(book0(), input({ person: 'x' as never }))).toEqual({ ok: false, reason: 'invalid_person' });
    expect(recordCardio(book0(), input({ enteredBy: 'x' as never }))).toEqual({ ok: false, reason: 'invalid_person' });
    expect(recordCardio(book0(), input({ recordedAt: '아님' }))).toEqual({ ok: false, reason: 'invalid_time' });
    expect(recordCardio(book0(), input({ logId: '  ' }))).toEqual({ ok: false, reason: 'invalid_log_id' });
  });
});

describe('날짜: 과거 허용, 미래 금지, 04:00 경계', () => {
  it('날짜를 안 주면 입력 순간의 계획 하루가 운동한 날이다 (00:30은 전날)', () => {
    const b = must(recordCardio(book0(), input({ logId: 'a', recordedAt: KST('2026-10-16', '00:30') })));
    expect(one(b, 'a').day).toBe('2026-10-15');
    const c = must(recordCardio(book0(), input({ logId: 'b', recordedAt: KST('2026-10-16', '04:00') })));
    expect(one(c, 'b').day).toBe('2026-10-16');
  });

  it('과거 날짜는 몇 달 전이어도 입력할 수 있다', () => {
    const b = must(recordCardio(book0(), input({ logId: 'a', day: '2026-01-05' })));
    expect(one(b, 'a').day).toBe('2026-01-05');
  });

  it('미래 날짜는 거부한다 (04:00 경계 기준)', () => {
    expect(recordCardio(book0(), input({ day: '2026-10-19', recordedAt: KST('2026-10-18', '10:00') }))).toEqual({ ok: false, reason: 'future_day' });
    // 10/19 03:30은 아직 10/18 계획 하루라서 10/19로 입력하면 미래
    expect(recordCardio(book0(), input({ day: '2026-10-19', recordedAt: KST('2026-10-19', '03:30') }))).toEqual({ ok: false, reason: 'future_day' });
    expect(recordCardio(book0(), input({ day: '2026-10-19', recordedAt: KST('2026-10-19', '04:00') })).ok).toBe(true);
    expect(recordCardio(book0(), input({ day: '2026-10-18', recordedAt: KST('2026-10-19', '03:30') })).ok).toBe(true);
  });

  it('날짜 형식이 이상하거나 없는 날짜는 거부한다', () => {
    for (const day of ['2026-13-01', '2026-02-30', '10/18', '', 'abc']) expect(recordCardio(book0(), input({ day }))).toEqual({ ok: false, reason: 'invalid_day' });
  });
});

describe('같은 logId 중복 저장 방지와 비슷한 기록 찾기', () => {
  it('같은 logId·같은 내용이면 변화 없음 (한 건), 내용이 다르면 거부한다', () => {
    const base = input({ logId: 'dup' });
    const b1 = must(recordCardio(book0(), base));
    const again = recordCardio(b1, { ...base, recordedAt: KST('2026-10-18', '10:05') });
    expect(again).toMatchObject({ ok: true, changed: false });
    if (again.ok) expect(again.book).toBe(b1); // 묶음 자체가 그대로
    expect(cardioLogs(b1)).toHaveLength(1);
    expect(recordCardio(b1, { ...base, minutes: 31 })).toEqual({ ok: false, reason: 'duplicate_log_id' });
    expect(recordCardio(b1, { ...base, person: 'tawi' })).toEqual({ ok: false, reason: 'duplicate_log_id' });
  });

  it('알 수 없는 종류의 기록과 logId가 겹쳐도 덮어쓰지 않는다', () => {
    const b: LogBook = { logs: [{ kind: 'strength', logId: 'same', weight: 20 }], quarantine: [] };
    expect(recordCardio(b, input({ logId: 'same' }))).toEqual({ ok: false, reason: 'duplicate_log_id' });
  });

  it('같은 내용이라도 logId가 다르면 막지 않는다 (경고는 화면에서)', () => {
    let b = add(book0(), { logId: 'a' });
    expect(findSimilarLogs(b, { person: 'yangcho', day: '2026-10-18', exerciseId: 'treadmill_run', minutes: 30, distanceM: 3000 }).map((l) => l.logId)).toEqual(['a']);
    b = add(b, { logId: 'b' });
    expect(cardioLogs(b)).toHaveLength(2);
    expect(findSimilarLogs(b, { person: 'yangcho', day: '2026-10-18', exerciseId: 'treadmill_run', minutes: 30, distanceM: 3000 }).map((l) => l.logId)).toEqual(['a', 'b']);
    // 자기 자신은 제외, 다른 사람·다른 값은 비슷하지 않음
    expect(findSimilarLogs(b, { person: 'yangcho', day: '2026-10-18', exerciseId: 'treadmill_run', minutes: 30, distanceM: 3000, exceptLogId: 'a' }).map((l) => l.logId)).toEqual(['b']);
    expect(findSimilarLogs(b, { person: 'tawi', day: '2026-10-18', exerciseId: 'treadmill_run', minutes: 30, distanceM: 3000 })).toEqual([]);
    expect(findSimilarLogs(b, { person: 'yangcho', day: '2026-10-18', exerciseId: 'treadmill_run', minutes: 30, distanceM: 3100 })).toEqual([]);
    // 취소된 기록은 비슷한 기록으로 세지 않는다
    const c = must(cancelCardio(b, 'a', { by: 'yangcho', at: AT }));
    expect(findSimilarLogs(c, { person: 'yangcho', day: '2026-10-18', exerciseId: 'treadmill_run', minutes: 30, distanceM: 3000 }).map((l) => l.logId)).toEqual(['b']);
  });
});

describe('수정: 원래 값과 이력 보존, 날짜 변경 허용', () => {
  const start = () => add(book0(), { logId: 'a', recordedAt: KST('2026-10-18', '10:00'), minutes: 30, distanceM: 3000 });

  it('바뀐 값마다 이전 값 → 새 값이 이력에 남고, 처음 값은 첫 이력에 그대로 있다', () => {
    const r = editCardio(start(), 'a', { minutes: 40, distanceM: 4500, exerciseId: 'outdoor_run' }, { by: 'tawi', at: AT });
    if (!r.ok) throw new Error(r.reason);
    expect(r.changed).toBe(true);
    const l = one(r.book, 'a');
    expect(l).toMatchObject({ minutes: 40, distanceM: 4500, exerciseId: 'outdoor_run', person: 'yangcho', enteredBy: 'yangcho', recordedAt: KST('2026-10-18', '10:00') });
    expect(l.revisions).toHaveLength(2);
    expect(l.revisions[1]).toEqual({ kind: 'edited', by: 'tawi', at: AT, changes: [{ field: 'exerciseId', before: 'treadmill_run', after: 'outdoor_run' }, { field: 'minutes', before: 30, after: 40 }, { field: 'distanceM', before: 3000, after: 4500 }] });
    expect(l.revisions[0]).toMatchObject({ kind: 'recorded', snapshot: { exerciseId: 'treadmill_run', minutes: 30, distanceM: 3000 } });
  });

  it('잘못 고른 날짜를 다른 날짜로 고칠 수 있고, 원래 날짜가 이력에 남는다 (미래는 안 됨)', () => {
    const r = editCardio(start(), 'a', { day: '2026-10-12' }, { by: 'yangcho', at: AT });
    if (!r.ok) throw new Error(r.reason);
    expect(one(r.book, 'a').day).toBe('2026-10-12');
    expect(one(r.book, 'a').revisions[1]).toMatchObject({ kind: 'edited', changes: [{ field: 'day', before: '2026-10-18', after: '2026-10-12' }] });
    expect(editCardio(start(), 'a', { day: '2026-10-19' }, { by: 'yangcho', at: AT })).toEqual({ ok: false, reason: 'future_day' });
    expect(editCardio(start(), 'a', { day: '아님' }, { by: 'yangcho', at: AT })).toEqual({ ok: false, reason: 'invalid_day' });
  });

  it('달라진 게 없으면 변화 없음이고 이력도 늘지 않는다', () => {
    const b = start();
    const r = editCardio(b, 'a', { minutes: 30, distanceM: 3000, day: '2026-10-18' }, { by: 'yangcho', at: AT });
    expect(r).toMatchObject({ ok: true, changed: false });
    if (r.ok) expect(r.book).toBe(b);
    expect(editCardio(b, 'a', {}, { by: 'yangcho', at: AT })).toMatchObject({ ok: true, changed: false });
  });

  it('잘못된 값으로는 고칠 수 없고 기록은 그대로다', () => {
    const b = start();
    expect(editCardio(b, 'a', { minutes: 0 }, { by: 'yangcho', at: AT })).toEqual({ ok: false, reason: 'invalid_minutes' });
    expect(editCardio(b, 'a', { distanceM: 2750 }, { by: 'yangcho', at: AT })).toEqual({ ok: false, reason: 'invalid_distance' });
    expect(editCardio(b, 'a', { exerciseId: 'stepmill' }, { by: 'yangcho', at: AT })).toEqual({ ok: false, reason: 'unknown_exercise' });
    expect(editCardio(b, 'a', { exerciseId: 'other' }, { by: 'yangcho', at: AT })).toEqual({ ok: false, reason: 'invalid_custom_name' });
    expect(editCardio(b, 'zzz', { minutes: 5 }, { by: 'yangcho', at: AT })).toEqual({ ok: false, reason: 'not_found' });
    expect(editCardio(b, 'a', { minutes: 5 }, { by: 'x' as never, at: AT })).toEqual({ ok: false, reason: 'invalid_person' });
    expect(editCardio(b, 'a', { minutes: 5 }, { by: 'yangcho', at: '아님' })).toEqual({ ok: false, reason: 'invalid_time' });
    expect(one(b, 'a').revisions).toHaveLength(1);
  });

  it('기타 ↔ 다른 종목: 운동명은 기타일 때만 있다', () => {
    let b = editCardio(start(), 'a', { exerciseId: 'other', customName: '줄넘기' }, { by: 'yangcho', at: AT });
    if (!b.ok) throw new Error(b.reason);
    expect(one(b.book, 'a')).toMatchObject({ exerciseId: 'other', customName: '줄넘기' });
    b = editCardio(b.book, 'a', { customName: '훌라후프' }, { by: 'yangcho', at: AT });
    if (!b.ok) throw new Error(b.reason);
    expect(one(b.book, 'a').customName).toBe('훌라후프');
    b = editCardio(b.book, 'a', { exerciseId: 'indoor_bike' }, { by: 'tawi', at: AT });
    if (!b.ok) throw new Error(b.reason);
    expect(one(b.book, 'a')).toMatchObject({ exerciseId: 'indoor_bike', customName: null });
    const last = one(b.book, 'a').revisions.at(-1);
    expect(last).toMatchObject({ kind: 'edited', changes: [{ field: 'exerciseId', before: 'other', after: 'indoor_bike' }, { field: 'customName', before: '훌라후프', after: null }] });
  });

  it('운동한 사람은 바꿀 수 없다 (잘못 넣었다면 취소하고 다시 기록)', () => {
    const r = editCardio(start(), 'a', { person: 'tawi' } as never, { by: 'yangcho', at: AT });
    expect(r).toMatchObject({ ok: true, changed: false });
    if (r.ok) expect(one(r.book, 'a').person).toBe('yangcho');
  });
});

describe('취소·복구: 기록은 남고 같은 logId로 돌아온다', () => {
  it('취소해도 기록과 이력은 지워지지 않고, 복구하면 같은 기록이 된다', () => {
    const b0 = add(book0(), { logId: 'a' });
    const b1 = must(cancelCardio(b0, 'a', { by: 'tawi', at: KST('2026-10-18', '12:00') }));
    expect(one(b1, 'a')).toMatchObject({ status: 'cancelled', minutes: 30, distanceM: 3000 });
    expect(cardioLogs(b1)).toHaveLength(1);
    const b2 = must(restoreCardio(b1, 'a', { by: 'yangcho', at: KST('2026-10-18', '12:05') }));
    expect(one(b2, 'a').status).toBe('active');
    expect(one(b2, 'a').revisions.map((r) => [r.kind, r.by])).toEqual([['recorded', 'yangcho'], ['cancelled', 'tawi'], ['restored', 'yangcho']]);
    expect(cardioLogs(b2)).toHaveLength(1); // 새 기록이 따로 생기지 않음
  });

  it('이미 취소/복구된 상태에서 다시 해도 변화 없음, 없는 기록은 거부', () => {
    const b0 = add(book0(), { logId: 'a' });
    expect(restoreCardio(b0, 'a', { by: 'yangcho', at: AT })).toMatchObject({ ok: true, changed: false });
    const b1 = must(cancelCardio(b0, 'a', { by: 'yangcho', at: AT }));
    const again = cancelCardio(b1, 'a', { by: 'yangcho', at: AT });
    expect(again).toMatchObject({ ok: true, changed: false });
    if (again.ok) expect(again.book).toBe(b1);
    expect(cancelCardio(b0, 'nope', { by: 'yangcho', at: AT })).toEqual({ ok: false, reason: 'not_found' });
    expect(restoreCardio(b0, 'nope', { by: 'yangcho', at: AT })).toEqual({ ok: false, reason: 'not_found' });
  });

  it('취소된 기록은 먼저 복구해야 고칠 수 있다', () => {
    const b = must(cancelCardio(add(book0(), { logId: 'a' }), 'a', { by: 'yangcho', at: AT }));
    expect(editCardio(b, 'a', { minutes: 10 }, { by: 'yangcho', at: AT })).toEqual({ ok: false, reason: 'log_cancelled' });
  });

  it('알 수 없는 종류의 기록은 고치거나 취소할 수 없고 그대로 보존된다', () => {
    const foreign = { kind: 'strength', logId: 'w1', weightKg: 20 };
    const b: LogBook = { logs: [foreign], quarantine: [] };
    for (const r of [editCardio(b, 'w1', { minutes: 5 }, { by: 'yangcho', at: AT }), cancelCardio(b, 'w1', { by: 'yangcho', at: AT }), restoreCardio(b, 'w1', { by: 'yangcho', at: AT })]) {
      expect(r).toEqual({ ok: false, reason: 'not_cardio' });
    }
    const added = add(b, { logId: 'a' });
    expect(added.logs[0]).toBe(foreign); // 같은 객체가 그대로
  });
});

describe('읽기: 목록, 최근 기록 (불러와도 기록이 생기지 않는다)', () => {
  const book = () => {
    let b = add(book0(), { logId: 'a', day: '2026-10-10', recordedAt: KST('2026-10-18', '09:00'), minutes: 30, distanceM: 3000 });
    b = add(b, { logId: 'b', day: '2026-10-15', recordedAt: KST('2026-10-18', '09:01'), minutes: 40, distanceM: 5000 });
    b = add(b, { logId: 'c', day: '2026-10-15', recordedAt: KST('2026-10-18', '09:02'), person: 'tawi', exerciseId: 'indoor_bike', minutes: 20, distanceM: 8200 });
    b = add(b, { logId: 'd', day: '2026-10-17', recordedAt: KST('2026-10-18', '09:03'), exerciseId: 'other', customName: '줄넘기', minutes: 10, distanceM: 1000 });
    return b;
  };

  it('목록은 최근 날짜부터, 같은 날은 나중에 입력한 것부터이고 취소는 기본으로 뺀다', () => {
    const b = must(cancelCardio(book(), 'd', { by: 'yangcho', at: AT }));
    expect(listCardioLogs(b).map((l) => l.logId)).toEqual(['c', 'b', 'a']);
    expect(listCardioLogs(b, { includeCancelled: true }).map((l) => l.logId)).toEqual(['d', 'c', 'b', 'a']);
    expect(listCardioLogs(b, { person: 'yangcho' }).map((l) => l.logId)).toEqual(['b', 'a']);
    expect(listCardioLogs(b, { day: '2026-10-15' }).map((l) => l.logId)).toEqual(['c', 'b']);
  });

  it('최근 기록은 그 사람의 같은 종목에서 가장 최근의 유효한 기록이다 (읽기만, 묶음은 그대로)', () => {
    const b = book();
    expect(latestCardio(b, 'yangcho', 'treadmill_run')?.logId).toBe('b');
    expect(latestCardio(b, 'tawi', 'indoor_bike')?.logId).toBe('c');
    expect(latestCardio(b, 'tawi', 'treadmill_run')).toBeNull();
    expect(latestCardio(b, 'yangcho', 'other', '줄넘기')?.logId).toBe('d');
    expect(latestCardio(b, 'yangcho', 'other', '훌라후프')).toBeNull();
    const c = must(cancelCardio(b, 'b', { by: 'yangcho', at: AT }));
    expect(latestCardio(c, 'yangcho', 'treadmill_run')?.logId).toBe('a'); // 취소된 기록은 제안값으로 쓰지 않음
    const before = JSON.stringify(b);
    latestCardio(b, 'yangcho', 'treadmill_run');
    listCardioLogs(b);
    expect(JSON.stringify(b)).toBe(before); // 불러오기만으로는 아무것도 생기지 않음
  });
});

// 5-A 데이터 보존: ❤️ 없는 날의 유산소가 시간이 지나도 사라지지 않고, 기존 저장 칸(day.v1·days.v1)을 건드리지 않으며,
// 저장 실패·손상·알 수 없는 기록에서도 원본이 조용히 사라지지 않는 것.
import { describe, expect, it } from 'vitest';
import { createDayState, pressHeart, setDesiredMealStart } from '@/lib/south-america/domain/day/day';
import { archiveEntry, emptyBook, putArchive, stashCurrent } from '@/lib/south-america/domain/day/daybook';
import { KEYS, commitHistory, loadBook, saveCurrent } from '@/lib/south-america/domain/day/persist';
import { sessionOf } from '@/lib/south-america/domain/day/session';
import { listWorkoutSessions } from '@/lib/south-america/domain/day/workout';
import { totalDistance } from '@/lib/south-america/domain/exercise/aggregate';
import { listWorkoutDays } from '@/lib/south-america/domain/exercise/days';
import { cancelCardio, editCardio } from '@/lib/south-america/domain/exercise/logs';
import { LOGS_KEYS, commitLogBook, loadLogBook, serializeLogBook } from '@/lib/south-america/domain/exercise/storage';
import { emptyLogBook, type LogBook } from '@/lib/south-america/domain/exercise/types';
import { addDays } from '@/lib/south-america/domain/time';
import { MemStore, add, book0, KST, must } from './exerciseHelpers';

const AT = KST('2026-10-18', '12:00');

/** 기존 1~4단계 데이터가 들어 있는 저장소 (오늘 + 보관함에 날짜 2개, ❤️·완료 기록 포함) */
function storeWithExistingData(): MemStore {
  const store = new MemStore();
  const t0 = '2026-10-18T01:00:00.000Z';
  let s = createDayState('2026-10-17');
  const heart = pressHeart(s, 20 * 60, 'yangcho');
  if (!heart.ok) throw new Error(heart.reason);
  s = setDesiredMealStart(heart.state, 22 * 60).ok ? heart.state : s;
  let book = emptyBook(createDayState('2026-10-18'));
  book = putArchive(book, archiveEntry(s, 'rollover', t0));
  const other = pressHeart(createDayState('2026-10-14'), 19 * 60 + 40, 'tawi');
  if (!other.ok) throw new Error(other.reason);
  book = putArchive(book, archiveEntry(other.state, 'rollover', t0));
  store.setItem(KEYS.days, JSON.stringify({ version: 1, days: book.days, conflicts: [], quarantine: [] }));
  store.setItem(KEYS.day, JSON.stringify(book.current));
  return store;
}

const logsOnlyBook = (): LogBook => {
  let b = add(book0(), { logId: 'solo-1', day: '2026-10-12', person: 'yangcho', distanceM: 3000 }); // ❤️ 없는 날
  b = add(b, { logId: 'solo-2', day: '2026-10-12', person: 'tawi', exerciseId: 'indoor_bike', distanceM: 8200 });
  b = add(b, { logId: 'solo-3', day: '2026-10-13', person: 'tawi', distanceM: 5000 });
  return b;
};

describe('저장하고 다시 불러오기', () => {
  it('저장한 기록(이력 포함)이 그대로 다시 읽히고, 불러오기만으로는 아무것도 쓰지 않는다', () => {
    const store = new MemStore();
    let b = logsOnlyBook();
    b = must(editCardio(b, 'solo-1', { minutes: 45, day: '2026-10-11' }, { by: 'tawi', at: AT }));
    b = must(cancelCardio(b, 'solo-3', { by: 'yangcho', at: AT }));
    expect(commitLogBook(store, b, false)).toBeNull();
    const snap = store.snapshot();
    const setsAfterSave = store.sets.length;

    const first = loadLogBook(store);
    expect(first).toMatchObject({ notices: [], blocked: false });
    expect(first.book).toEqual(b);
    // 여러 번 불러와도 같은 결과이고 저장소는 그대로
    for (let i = 0; i < 5; i++) expect(loadLogBook(store).book).toEqual(b);
    expect(store.snapshot()).toBe(snap);
    expect(store.sets).toHaveLength(setsAfterSave);
  });

  it('저장 칸이 비어 있으면 빈 묶음이고 아무것도 만들지 않는다', () => {
    const store = new MemStore();
    expect(loadLogBook(store)).toEqual({ book: emptyLogBook(), notices: [], blocked: false });
    expect(store.data.size).toBe(0);
  });
});

describe('기존 day.v1·days.v1은 건드리지 않는다', () => {
  it('유산소 기록·수정·취소·저장·불러오기 전후로 기존 두 칸의 내용이 바이트까지 같고 새 칸만 생긴다', () => {
    const store = storeWithExistingData();
    const day = store.getItem(KEYS.day);
    const days = store.getItem(KEYS.days);
    const keysBefore = [...store.data.keys()].sort();

    let b = logsOnlyBook();
    b = add(b, { logId: 'on-heart-day', day: '2026-10-17', person: 'tawi', distanceM: 4100 }); // ❤️가 있는 날에도
    b = must(editCardio(b, 'solo-2', { distanceM: 9000 }, { by: 'yangcho', at: AT }));
    b = must(cancelCardio(b, 'solo-3', { by: 'tawi', at: AT }));
    commitLogBook(store, b, false);
    loadLogBook(store);
    commitLogBook(store, loadLogBook(store).book, false);

    expect(store.getItem(KEYS.day)).toBe(day);
    expect(store.getItem(KEYS.days)).toBe(days);
    expect([...store.data.keys()].sort()).toEqual([...keysBefore, LOGS_KEYS.logs].sort());
    // 로그 쪽 코드는 기존 칸에 쓴 적이 없다
    expect(store.sets.filter((k) => k !== LOGS_KEYS.logs)).toEqual([KEYS.days, KEYS.day]); // (seed 때 쓴 두 번뿐)
  });

  it('기존 코드가 하루를 불러오고 날짜를 넘겨도 유산소 저장 칸은 건드리지 않는다', () => {
    const store = storeWithExistingData();
    commitLogBook(store, logsOnlyBook(), false);
    const logsRaw = store.getItem(LOGS_KEYS.logs);
    const writesBefore = store.sets.length;
    let day = '2026-10-18';
    for (let i = 0; i < 5; i++) {
      day = addDays(day, 1);
      loadBook(store, day, `${day}T05:00:00.000Z`);
    }
    expect(store.getItem(LOGS_KEYS.logs)).toBe(logsRaw);
    expect(store.sets.slice(writesBefore).includes(LOGS_KEYS.logs)).toBe(false);
  });
});

describe('❤️ 없는 날의 유산소는 시간이 지나도 사라지지 않는다', () => {
  it('04:00 날짜 전환을 40일 반복하고 개발 도구 시뮬레이션을 해도 기록·합계·목록이 그대로다', () => {
    const store = storeWithExistingData();
    commitLogBook(store, logsOnlyBook(), false);
    const expectedLogsRaw = store.getItem(LOGS_KEYS.logs);
    const expectedTotal = totalDistance(loadLogBook(store).book);
    expect(expectedTotal.jointM).toBe(16200);

    let day = '2026-10-18';
    let current = createDayState(day);
    for (let i = 1; i <= 40; i++) {
      day = addDays(day, 1);
      const at = `${day}T04:30:00+09:00`;
      // 앱을 열 때마다 날짜 전환 (기존 보관 방식)
      const loaded = loadBook(store, day, new Date(at).toISOString());
      current = loaded.book.current;
      // 가끔 개발 도구가 오늘을 통째로 바꾸는 것도 흉내 낸다 (하루 초기화·예시 불러오기 → 이전 내용은 충돌본으로)
      if (i % 7 === 0) {
        const heart = pressHeart(current, 20 * 60, 'yangcho');
        if (!heart.ok) throw new Error(heart.reason);
        const replaced = stashCurrent({ ...loaded.book, current: heart.state }, createDayState(day), 'dev_reset', new Date(at).toISOString());
        commitHistory(store, replaced, []);
        saveCurrent(store, replaced.current, false);
      }
      // 매번: 유산소 기록은 그대로
      const l = loadLogBook(store);
      expect(l.notices).toEqual([]);
      expect(totalDistance(l.book)).toEqual(expectedTotal);
      expect(store.getItem(LOGS_KEYS.logs)).toBe(expectedLogsRaw);
    }
    // ❤️ 없는 날들은 여전히 "세션 없는 날"로 조회되고 날짜별 상세가 그대로다
    const rows = listWorkoutDays([], loadLogBook(store).book);
    expect(rows.map((r) => [r.day, r.session, r.activeCount])).toEqual([['2026-10-13', null, 1], ['2026-10-12', null, 2]]);
    // 유산소 때문에 세션·하루 상태가 생기지 않았다 (보관함의 세션은 ❤️를 직접 누른 날뿐)
    expect(sessionOf(createDayState('2026-10-12'))).toBeNull();
    const hist = JSON.parse(store.getItem(KEYS.days) ?? '{}') as { days: Record<string, unknown> };
    expect(Object.keys(hist.days)).not.toContain('2026-10-12');
    expect(Object.keys(hist.days)).not.toContain('2026-10-13');
  });

  it('앱을 닫았다 열어도(새 불러오기) 지난 날짜 기록을 수정·복구할 수 있다', () => {
    const store = new MemStore();
    commitLogBook(store, logsOnlyBook(), false);
    // 다음 날 앱을 열어서
    loadBook(store, '2026-10-25', '2026-10-25T05:00:00.000Z');
    let b = loadLogBook(store).book;
    b = must(editCardio(b, 'solo-1', { day: '2026-10-10', distanceM: 3500 }, { by: 'yangcho', at: KST('2026-10-25', '10:00') }));
    commitLogBook(store, b, false);
    const again = loadLogBook(store).book;
    expect(totalDistance(again).jointM).toBe(16700);
    expect(listWorkoutDays([], again).map((r) => r.day)).toEqual(['2026-10-13', '2026-10-12', '2026-10-10']);
  });
});

describe('저장 실패: 이전 기록이 그대로 남는다', () => {
  it('쓰기가 오류를 내면 알림을 돌려주고 이전에 저장한 내용은 그대로다', () => {
    const store = new MemStore();
    const b1 = logsOnlyBook();
    commitLogBook(store, b1, false);
    const saved = store.getItem(LOGS_KEYS.logs);
    store.failSet.add(LOGS_KEYS.logs);
    const b2 = add(b1, { logId: 'new', day: '2026-10-14' });
    expect(commitLogBook(store, b2, false)).toMatchObject({ code: 'write_failed' });
    expect(store.getItem(LOGS_KEYS.logs)).toBe(saved);
    expect(loadLogBook(store).book).toEqual(b1);
  });

  it('쓰기가 조용히 무시되는 저장소도 잡아내고 이전 내용을 지키며, 복구되면 다시 저장된다', () => {
    const store = new MemStore();
    const b1 = logsOnlyBook();
    commitLogBook(store, b1, false);
    const saved = store.getItem(LOGS_KEYS.logs);
    store.silentSet.add(LOGS_KEYS.logs);
    const b2 = add(b1, { logId: 'new', day: '2026-10-14' });
    expect(commitLogBook(store, b2, false)).toMatchObject({ code: 'write_failed' });
    expect(store.getItem(LOGS_KEYS.logs)).toBe(saved);
    store.silentSet.clear();
    expect(commitLogBook(store, b2, false)).toBeNull();
    expect(loadLogBook(store).book).toEqual(b2);
  });

  it('저장소를 읽을 수 없으면 저장을 멈추고 아무것도 쓰지 않는다', () => {
    const store = new MemStore();
    commitLogBook(store, logsOnlyBook(), false);
    store.throwGet = true;
    const r = loadLogBook(store);
    expect(r).toMatchObject({ blocked: true });
    expect(r.notices[0].code).toBe('storage_unavailable');
    const writes = store.sets.length;
    expect(commitLogBook(store, r.book, r.blocked)).toBeNull();
    expect(store.sets).toHaveLength(writes);
    store.throwGet = false;
    expect(loadLogBook(store).book).toEqual(logsOnlyBook());
  });

  it('blocked 상태에서는 어떤 경우에도 쓰지 않는다', () => {
    const store = new MemStore();
    expect(commitLogBook(store, logsOnlyBook(), true)).toBeNull();
    expect(store.data.size).toBe(0);
  });
});

describe('손상된 파일: 지우지 않고 따로 보존', () => {
  it('JSON이 깨졌으면 원본을 .corrupt에 복사해 두고 새로 시작하며, 반복해도 복사본이 늘지 않는다', () => {
    const store = new MemStore();
    store.setItem(LOGS_KEYS.logs, '{깨진 파일');
    const first = loadLogBook(store);
    expect(first.book).toEqual(emptyLogBook());
    expect(first.blocked).toBe(false);
    expect(first.notices[0].code).toBe('logs_unreadable_preserved');
    expect(store.getItem(LOGS_KEYS.corrupt)).toBe('{깨진 파일');
    expect(store.getItem(LOGS_KEYS.logs)).toBe('{깨진 파일'); // 불러오기만으로는 원본을 건드리지 않음
    loadLogBook(store);
    loadLogBook(store);
    expect([...store.data.keys()].filter((k) => k.startsWith(LOGS_KEYS.corrupt))).toEqual([LOGS_KEYS.corrupt]);
  });

  it('다른 버전·모양의 파일도 같은 방식으로 보존한다', () => {
    for (const raw of [JSON.stringify({ version: 2, logs: [] }), JSON.stringify({ version: 1 }), JSON.stringify([1, 2]), 'null']) {
      const store = new MemStore();
      store.setItem(LOGS_KEYS.logs, raw);
      expect(loadLogBook(store).notices[0].code).toBe('logs_unreadable_preserved');
      expect(store.getItem(LOGS_KEYS.corrupt)).toBe(raw);
    }
  });

  it('보존 복사에 실패하면 원본을 지키려고 저장을 멈춘다', () => {
    const store = new MemStore();
    store.setItem(LOGS_KEYS.logs, '{깨진 파일');
    store.failSet.add(LOGS_KEYS.corrupt);
    const r = loadLogBook(store);
    expect(r.blocked).toBe(true);
    expect(r.notices[0].code).toBe('preserve_failed');
    expect(commitLogBook(store, add(book0(), {}), r.blocked)).toBeNull();
    expect(store.getItem(LOGS_KEYS.logs)).toBe('{깨진 파일');
  });
});

describe('읽을 수 없는 항목과 알 수 없는 종류는 원본 보호', () => {
  const foreign = { kind: 'strength', logId: 'w1', exerciseId: 'lat_pulldown', weightKg: 20, routine: { sets: 3, reps: 10, basis: 'routine_default' }, extra: { nested: [1, 2, 3] } };

  it('알 수 없는 종류의 기록은 불러오기·유산소 추가·저장·다시 불러오기를 거쳐도 원본 그대로, 같은 자리에 남는다', () => {
    const store = new MemStore();
    const good = add(book0(), { logId: 'c1' });
    store.setItem(LOGS_KEYS.logs, JSON.stringify({ version: 1, logs: [good.logs[0], foreign, { kind: 'walk_together', logId: 'k1', km: 6 }], quarantine: [] }));
    let b = loadLogBook(store).book;
    expect(b.logs[1]).toEqual(foreign);
    b = add(b, { logId: 'c2', day: '2026-10-10' });
    b = must(editCardio(b, 'c1', { minutes: 40 }, { by: 'yangcho', at: AT }));
    commitLogBook(store, b, false);
    for (let i = 0; i < 3; i++) commitLogBook(store, loadLogBook(store).book, false);
    const after = loadLogBook(store).book;
    expect(after.logs.map((l) => l.logId)).toEqual(['c1', 'w1', 'k1', 'c2']);
    expect(after.logs[1]).toEqual(foreign);
    expect(after.logs[2]).toEqual({ kind: 'walk_together', logId: 'k1', km: 6 });
    expect(totalDistance(after).jointM).toBe(6000); // 알 수 없는 종류는 합계에 들어가지 않음
  });

  it('올바르지 않은 유산소 항목·종류 없는 항목·ID가 겹치는 항목은 버리지 않고 quarantine에 보존하며 합계에서 뺀다', () => {
    const store = new MemStore();
    const good = add(book0(), { logId: 'ok', distanceM: 3000 }).logs[0] as Record<string, unknown>;
    const bad = [
      { ...good, logId: 'neg', distanceM: -100 },
      { ...good, logId: 'prec', distanceM: 2750 }, // 둘째 자리(미터 단위로는 100의 배수 아님)
      { ...good, logId: 'ex', exerciseId: 'stepmill' },
      { ...good, logId: 'min', minutes: 0 },
      { ...good, logId: 'day', day: '2026-02-30' },
      { ...good, logId: 'other', exerciseId: 'other', customName: null },
      { ...good, logId: 'rev', revisions: 'x' },
      { ...good, logId: 'ok' }, // ID 겹침
      'not an object',
      { logId: 'nokind' },
      null,
    ];
    const raw = JSON.stringify({ version: 1, logs: [good, ...bad], quarantine: [{ old: 'kept' }] });
    store.setItem(LOGS_KEYS.logs, raw);
    const r = loadLogBook(store);
    expect(r.book.logs.map((l) => l.logId)).toEqual(['ok']);
    expect(r.book.quarantine).toHaveLength(bad.length + 1);
    expect(r.book.quarantine).toEqual([{ old: 'kept' }, ...bad]);
    expect(r.notices[0].code).toBe('entries_quarantined');
    expect(totalDistance(r.book).jointM).toBe(3000);
    // 저장해도 quarantine이 그대로 남는다 (조용히 사라지지 않음)
    commitLogBook(store, add(r.book, { logId: 'more', day: '2026-10-10' }), false);
    expect(loadLogBook(store).book.quarantine).toEqual([{ old: 'kept' }, ...bad]);
    expect(JSON.parse(store.getItem(LOGS_KEYS.logs) ?? '{}').quarantine).toHaveLength(bad.length + 1);
  });

  it('직렬화 결과는 같은 내용이면 항상 같다 (반복 저장해도 변하지 않음)', () => {
    const b = logsOnlyBook();
    const s1 = serializeLogBook(b);
    const store = new MemStore();
    commitLogBook(store, b, false);
    expect(serializeLogBook(loadLogBook(store).book)).toBe(s1);
  });
});

describe('지난 날 기록을 5-B에서 조회할 준비 (세션 목록과 함께)', () => {
  it('보관된 ❤️ 세션 날과 유산소만 있는 날이 같은 목록에서 구분된다', () => {
    const store = storeWithExistingData();
    commitLogBook(store, logsOnlyBook(), false);
    const loaded = loadBook(store, '2026-10-18', '2026-10-18T05:00:00.000Z').book;
    const sessions = listWorkoutSessions(Object.values(loaded.days).map((d) => ({ day: d.day, state: d.state })), loaded.current);
    const rows = listWorkoutDays(sessions, loadLogBook(store).book);
    expect(rows.map((r) => [r.day, r.session !== null])).toEqual([['2026-10-17', true], ['2026-10-14', true], ['2026-10-13', false], ['2026-10-12', false]]);
  });
});


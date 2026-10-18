// 1단계: 이전 날짜 보관·저장·복원. 핵심은 "기존 기록이 보관되기 전에 지워지거나 덮어써지지 않는 것"이에요.
import { describe, expect, it } from 'vitest';
import { completeStep, createDayState, pressHeart, setDesiredMealStart, setEtaMode, type DayState } from '@/lib/south-america/domain/day/day';
import { archivedList, isPristine, parseDayState, putArchive, archiveEntry, sameState, stableStringify, stashCurrent, switchDay, emptyBook } from '@/lib/south-america/domain/day/daybook';
import { KEYS, commitSwitch, loadBook, saveCurrent, serializeHistory, type KeyValueStore, type StorageNotice } from '@/lib/south-america/domain/day/persist';
import { LEGACY_JOINT_END_LABEL, legacyJointEnd, sessionDayOf, sessionIdOf, sessionOf } from '@/lib/south-america/domain/day/session';
import { C } from './dayHelpers';

/** 실패를 일부러 만들 수 있는 가짜 저장소 */
class MemStore implements KeyValueStore {
  data = new Map<string, string>();
  failSet = new Set<string>(); // 이 이름에 쓰면 오류 (용량 초과 등)
  silentSet = new Set<string>(); // 이 이름에 쓰면 조용히 아무것도 안 됨
  throwGet = false;
  sets: string[] = [];
  getItem(k: string) {
    if (this.throwGet) throw new Error('저장소 사용 불가');
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.sets.push(k);
    if (this.failSet.has(k)) throw new Error('용량 초과');
    if (this.silentSet.has(k)) return;
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
  snapshot() {
    return JSON.stringify([...this.data.entries()].sort());
  }
}

const D = '2026-10-15';
const AT = '2026-10-16T09:00:00.000Z';

/** 실제로 쓰던 것과 같은 모양의 하루: ETA 수정, 희망 저녁, Baby Step, ❤️, 옛 방식 공동 종료 기록 */
function usedDay(day = D): DayState {
  let s = createDayState(day);
  s = setEtaMode(s, 'tawi', 'subway', { station_arrival: C('19:10') }, 'yangcho');
  s = { ...s, desiredMealStart: C('22:00') };
  s = setDesiredMealStart(s, C('22:00')).ok ? s : s;
  let r = completeStep(s, 'yangcho', 'home_arrival', C('18:35'), 'yangcho');
  if (r.ok) s = r.state;
  r = pressHeart(s, C('20:00'), 'tawi');
  if (r.ok) s = r.state;
  // 이전 방식(한 명이 눌러 둘 다)의 기록. 지금은 이 방식으로 만들 수 없어서, 예전에 저장된 모양 그대로 넣어요
  s = {
    ...s,
    actuals: {
      steps: { ...s.actuals.steps, 'joint.workout_end': { status: 'done', time: C('21:05'), expectedAtDone: C('21:15'), by: 'tawi', label: '운동 끝', rewardKey: null } },
    },
  };
  return s;
}
const seed = (store: MemStore, s: DayState) => {
  const raw = JSON.stringify(s);
  store.data.set(KEYS.day, raw);
  return raw;
};
const hist = (store: MemStore) => JSON.parse(store.data.get(KEYS.days) ?? 'null');

describe('세션 ID와 운동 날짜 기반', () => {
  it('세션 ID는 운동한 날에서 만들어지고 안정적이다', () => {
    expect(sessionIdOf(D)).toBe('ws:2026-10-15');
    expect(sessionDayOf('ws:2026-10-15')).toBe(D);
    expect(sessionDayOf('ws:2026-13-40')).toBeNull();
    expect(sessionDayOf('nope')).toBeNull();
    expect(() => sessionIdOf('내일')).toThrow(RangeError);
  });

  it('❤️ 기록이 있을 때만 세션이 있고, 설정을 바꿔도 ID가 같다', () => {
    expect(sessionOf(createDayState(D))).toBeNull();
    const s = usedDay();
    expect(sessionOf(s)).toMatchObject({ id: 'ws:2026-10-15', day: D, startedAt: C('20:00'), startedBy: 'tawi' });
    const changed = { ...s, plan: 'B' as const, workoutMinutes: 90 };
    expect(sessionOf(changed)?.id).toBe('ws:2026-10-15');
  });

  it('옛 공동 종료 기록은 원본 그대로 두고 "개인별 완료 미확인"으로 구분한다 (개인 완료로 변환하지 않는다)', () => {
    const s = usedDay();
    expect(legacyJointEnd(s)).toEqual({ key: 'joint.workout_end', label: LEGACY_JOINT_END_LABEL });
    expect(LEGACY_JOINT_END_LABEL).toBe('이전 방식의 공동 종료 기록 · 개인별 완료 미확인');
    expect(Object.keys(s.actuals.steps)).not.toContain('yangcho.workout_end');
    expect(Object.keys(s.actuals.steps)).not.toContain('tawi.workout_end');
    expect(legacyJointEnd(createDayState(D))).toBeNull();
  });
});

describe('1. 앱을 닫았다가 다음 날 실행', () => {
  it('어제 상태가 원본 그대로 보관되고, 오늘은 새로 시작하고, 원본 백업이 남는다', () => {
    const store = new MemStore();
    const old = usedDay();
    const raw = seed(store, old);
    const r = loadBook(store, '2026-10-16', AT);

    expect(r.blocked).toBe(false);
    expect(r.notices).toEqual([]);
    expect(r.book.current.day).toBe('2026-10-16');
    expect(isPristine(r.book.current)).toBe(true);
    expect(r.book.current.settings).toEqual(old.settings); // 시간 설정은 이어받음

    const kept = r.book.days[D];
    expect(sameState(kept.state, old)).toBe(true);
    expect(stableStringify(kept.state.actuals)).toBe(stableStringify(old.actuals)); // 기록 원본 그대로
    expect(kept).toMatchObject({ sessionId: 'ws:2026-10-15', hasLegacyJointEnd: true, reason: 'load' });

    // 저장소: 현재 칸은 오늘, 보관함에 어제, 백업에 원본 그대로
    expect(JSON.parse(store.data.get(KEYS.day)!).day).toBe('2026-10-16');
    expect(hist(store).days[D].state.actuals.steps['joint.start_together']).toBeTruthy();
    expect(store.data.get(KEYS.backup)).toBe(raw);
  });

  it('옛 공동 종료 기록은 보관 뒤에도 그대로이고 개인 완료가 생기지 않는다', () => {
    const store = new MemStore();
    const old = usedDay();
    seed(store, old);
    const { book } = loadBook(store, '2026-10-16', AT);
    const steps = book.days[D].state.actuals.steps;
    expect(steps['joint.workout_end']).toEqual(old.actuals.steps['joint.workout_end']);
    expect(Object.keys(steps).sort()).toEqual(Object.keys(old.actuals.steps).sort());
    expect(legacyJointEnd(book.days[D].state)?.label).toBe(LEGACY_JOINT_END_LABEL);
  });
});

describe('2. 앱을 켜둔 상태에서 04:00 경과', () => {
  it('03:59까지는 어제 일정이고 04:00에 넘어가며, 켜 둔 채 넘어가도 같은 결과로 보관된다', () => {
    const before = new Date('2026-10-16T03:59:00+09:00');
    const after = new Date('2026-10-16T04:00:00+09:00');
    const dayBefore = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(d.getTime() - (Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', hourCycle: 'h23' }).format(d)) < 4 ? 86_400_000 : 0)));
    expect(dayBefore(before)).toBe('2026-10-15');
    expect(dayBefore(after)).toBe('2026-10-16');

    // 03:59에 앱을 열어 둔 상태 → 04:00에 오늘이 바뀜 (store의 날짜 변경 경로: switchDay + commitSwitch)
    const live = new MemStore();
    const old = usedDay();
    seed(live, old);
    const open = loadBook(live, '2026-10-15', before.toISOString());
    expect(open.book.current.day).toBe('2026-10-15');
    const next = switchDay(open.book, '2026-10-16', after.toISOString(), 'rollover');
    const notices: StorageNotice[] = [];
    expect(commitSwitch(live, open.book, next, notices)).toBe(true);
    expect(notices).toEqual([]);

    // 같은 상황을 "닫았다가 다음 날 열기"로 해도 보관 내용이 같다
    const closed = new MemStore();
    seed(closed, old);
    const reopened = loadBook(closed, '2026-10-16', after.toISOString());
    expect(stableStringify(reopened.book.days[D].state)).toBe(stableStringify(next.days[D].state));
    expect(JSON.parse(live.data.get(KEYS.day)!).day).toBe('2026-10-16');
  });
});

describe('3. 여러 날 건너뛰고 다시 실행', () => {
  it('마지막으로 저장된 날만 보관하고, 중간의 빈 날을 지어내지 않는다', () => {
    const store = new MemStore();
    const old = usedDay();
    seed(store, old);
    const r = loadBook(store, '2026-10-20', AT);
    expect(Object.keys(r.book.days)).toEqual([D]);
    expect(r.book.current.day).toBe('2026-10-20');
    // 중간 날짜로 가도 새 하루(빈 상태), 다시 원래 날짜로 가면 원본이 복원된다
    const mid = switchDay(r.book, '2026-10-17', AT, 'dev_shift');
    expect(isPristine(mid.current)).toBe(true);
    expect(Object.keys(mid.days)).toEqual([D]); // 빈 날(20일)은 보관하지 않음
    const back = switchDay(mid, D, AT, 'dev_shift');
    expect(sameState(back.current, old)).toBe(true);
    expect(back.days[D]).toBeUndefined();
  });
});

describe('5. 저장소 오류와 손상된 데이터 (원본을 지킨다)', () => {
  it('저장소를 읽을 수 없으면 아무것도 쓰지 않는다', () => {
    const store = new MemStore();
    seed(store, usedDay());
    store.throwGet = true;
    const r = loadBook(store, '2026-10-16', AT);
    expect(r.blocked).toBe(true);
    expect(r.notices.map((n) => n.code)).toEqual(['storage_unavailable']);
    expect(store.sets).toEqual([]);
    expect(saveCurrent(store, r.book.current, r.blocked)).toBeNull();
    expect(store.sets).toEqual([]);
  });

  it('보관함에 쓰다 실패하면(용량 초과) 현재 칸 원본을 그대로 두고 멈춘다', () => {
    const store = new MemStore();
    const raw = seed(store, usedDay());
    store.failSet.add(KEYS.days);
    const r = loadBook(store, '2026-10-16', AT);
    expect(r.blocked).toBe(true);
    expect(r.notices.map((n) => n.code)).toContain('archive_failed');
    expect(store.data.get(KEYS.day)).toBe(raw); // 어제 원본이 그대로
    expect(r.book.current.day).toBe('2026-10-16'); // 화면은 오늘로 보여 주되
    expect(saveCurrent(store, r.book.current, r.blocked)).toBeNull(); // 저장은 하지 않는다
    expect(store.data.get(KEYS.day)).toBe(raw);
  });

  it('조용히 저장되지 않는 저장소도 읽어서 확인하므로 실패로 처리한다', () => {
    const store = new MemStore();
    const raw = seed(store, usedDay());
    store.silentSet.add(KEYS.days);
    const r = loadBook(store, '2026-10-16', AT);
    expect(r.blocked).toBe(true);
    expect(store.data.get(KEYS.day)).toBe(raw);
  });

  it('보관은 됐는데 현재 칸 쓰기가 실패하면, 보관본이 있고 원본도 남으며 다시 열면 중복 없이 정리된다', () => {
    const store = new MemStore();
    const old = usedDay();
    const raw = seed(store, old);
    store.failSet.add(KEYS.day);
    const first = loadBook(store, '2026-10-16', AT);
    expect(first.blocked).toBe(true);
    expect(first.notices.map((n) => n.code)).toContain('write_failed');
    expect(store.data.get(KEYS.day)).toBe(raw);
    expect(Object.keys(hist(store).days)).toEqual([D]);

    store.failSet.clear(); // 저장소가 다시 정상
    const second = loadBook(store, '2026-10-16', AT);
    expect(second.blocked).toBe(false);
    expect(Object.keys(second.book.days)).toEqual([D]); // 중복 없음
    expect(second.book.conflicts).toEqual([]);
    expect(sameState(second.book.days[D].state, old)).toBe(true);
    expect(JSON.parse(store.data.get(KEYS.day)!).day).toBe('2026-10-16');
  });

  it('읽을 수 없는 오늘 기록은 지우지 않고 따로 복사해 보존한다', () => {
    const store = new MemStore();
    store.data.set(KEYS.day, '{이건 깨진 JSON');
    const r = loadBook(store, '2026-10-16', AT);
    expect(r.blocked).toBe(false);
    expect(r.notices.map((n) => n.code)).toEqual(['day_unreadable_preserved']);
    expect(store.data.get(KEYS.corruptDay)).toBe('{이건 깨진 JSON');
    expect(r.book.current.day).toBe('2026-10-16');
    // 한 번 더 열어도 복사본이 늘어나지 않는다
    loadBook(store, '2026-10-16', AT);
    expect(store.data.has(`${KEYS.corruptDay}.1`)).toBe(false);
  });

  it('손상된 기록을 복사하지 못하면 덮어쓰지 않도록 저장을 멈춘다', () => {
    const store = new MemStore();
    store.data.set(KEYS.day, 'broken');
    store.failSet.add(KEYS.corruptDay);
    const r = loadBook(store, '2026-10-16', AT);
    expect(r.blocked).toBe(true);
    expect(r.notices.map((n) => n.code)).toContain('preserve_failed');
    expect(saveCurrent(store, r.book.current, r.blocked)).toBeNull();
    expect(store.data.get(KEYS.day)).toBe('broken');
  });

  it('모양이 틀린 오늘 기록(버전 99 등)도 지우지 않고 보존한다', () => {
    const store = new MemStore();
    store.data.set(KEYS.day, JSON.stringify({ version: 99, hello: 'world' }));
    const r = loadBook(store, '2026-10-16', AT);
    expect(r.notices.map((n) => n.code)).toEqual(['day_unreadable_preserved']);
    expect(store.data.get(KEYS.corruptDay)).toContain('"version":99');
  });

  it('보관함 파일이 깨져 있으면 원본을 복사해 두고 새로 시작하며, 다음 보관 때 덮어써도 복사본이 있다', () => {
    const store = new MemStore();
    seed(store, usedDay());
    store.data.set(KEYS.days, '깨진 보관함');
    const r = loadBook(store, '2026-10-16', AT);
    expect(r.notices.map((n) => n.code)).toContain('history_unreadable_preserved');
    expect(store.data.get(KEYS.corruptDays)).toBe('깨진 보관함');
    expect(Object.keys(r.book.days)).toEqual([D]);
  });

  it('보관함의 일부 항목만 깨졌으면 나머지는 쓰고, 깨진 항목은 버리지 않고 따로 둔다', () => {
    const store = new MemStore();
    const good = archiveEntry(usedDay('2026-10-10'), 'rollover', AT);
    store.data.set(KEYS.days, JSON.stringify({ version: 1, days: { '2026-10-10': good, '2026-10-11': { day: '2026-10-11', state: { version: 1 } } }, conflicts: [], quarantine: [] }));
    seed(store, usedDay());
    const r = loadBook(store, '2026-10-16', AT);
    expect(Object.keys(r.book.days).sort()).toEqual(['2026-10-10', D]);
    expect(r.book.quarantine).toHaveLength(1);
    expect(r.notices.map((n) => n.code)).toContain('entries_quarantined');
    expect(hist(store).quarantine).toHaveLength(1); // 다시 쓴 파일에도 남아 있음
  });

  it('백업을 못 만들어도 원본은 그대로이고 같은 날 불러오기는 막히지 않는다', () => {
    const store = new MemStore();
    const raw = seed(store, usedDay());
    store.failSet.add(KEYS.backup);
    const r = loadBook(store, D, AT);
    expect(r.blocked).toBe(false);
    expect(r.notices.map((n) => n.code)).toEqual(['backup_failed']);
    expect(store.data.get(KEYS.day)).toBe(raw);
  });

  it('모르는 필드와 모르는 기록도 보관할 때 그대로 보존한다', () => {
    const store = new MemStore();
    const old = usedDay() as DayState & { futureField?: unknown };
    old.futureField = { keep: 'me' };
    old.actuals.steps['yangcho.some_future_step'] = { status: 'done', time: 1, expectedAtDone: null, by: 'yangcho', label: '미래 단계', rewardKey: null };
    seed(store, old);
    const r = loadBook(store, '2026-10-16', AT);
    expect(stableStringify(r.book.days[D].state)).toBe(stableStringify(old));
  });
});

describe('6. 새로고침 / 8. 마이그레이션 반복 실행', () => {
  it('같은 날 다시 불러도 아무것도 바뀌거나 늘어나지 않는다', () => {
    const store = new MemStore();
    seed(store, usedDay());
    const a = loadBook(store, D, AT);
    const snap = store.snapshot();
    const setsBefore = store.sets.length;
    const b = loadBook(store, D, AT);
    expect(store.snapshot()).toBe(snap);
    expect(store.sets.length).toBe(setsBefore); // 쓰기 자체가 없음
    expect(sameState(a.book.current, b.book.current)).toBe(true);
  });

  it('날짜가 바뀐 뒤 여러 번(새로고침 포함) 불러도 보관이 중복되지 않고 백업도 다시 쓰이지 않는다', () => {
    const store = new MemStore();
    const raw = seed(store, usedDay());
    loadBook(store, '2026-10-16', AT);
    const snap = store.snapshot();
    for (let i = 0; i < 5; i++) loadBook(store, '2026-10-16', `2026-10-16T1${i}:00:00.000Z`);
    expect(store.snapshot()).toBe(snap);
    const h = hist(store);
    expect(Object.keys(h.days)).toEqual([D]);
    expect(h.conflicts).toEqual([]);
    expect(store.data.get(KEYS.backup)).toBe(raw);
  });

  it('저장한 오늘 상태를 새로 읽어도 같다 (저장→복원)', () => {
    const store = new MemStore();
    const s = usedDay('2026-10-16');
    expect(saveCurrent(store, s, false)).toBeNull();
    const r = loadBook(store, '2026-10-16', AT);
    expect(sameState(r.book.current, s)).toBe(true);
    expect(parseDayState(JSON.parse(store.data.get(KEYS.day)!))).toEqual(s);
  });
});

describe('7. DEV 날짜를 앞뒤로 이동', () => {
  it('앞으로 갔다 뒤로 오면 그날의 상태(수정 포함)가 그대로 돌아오고 중복이 생기지 않는다', () => {
    const original = usedDay('2026-10-15');
    let book = emptyBook(original);
    book = switchDay(book, '2026-10-16', AT, 'dev_shift');
    expect(book.days['2026-10-15'].state).toEqual(original);
    // 16일에 사용자가 뭔가 바꿈
    const edited = setEtaMode(book.current, 'yangcho', 'subway', { station_arrival: C('18:40') }, 'yangcho');
    book = { ...book, current: edited };
    book = switchDay(book, '2026-10-15', AT, 'dev_shift'); // 되돌림
    expect(sameState(book.current, original)).toBe(true);
    expect(Object.keys(book.days)).toEqual(['2026-10-16']);
    expect(sameState(book.days['2026-10-16'].state, edited)).toBe(true);
    book = switchDay(book, '2026-10-16', AT, 'dev_shift'); // 다시 앞으로
    expect(sameState(book.current, edited)).toBe(true);
    expect(sameState(book.days['2026-10-15'].state, original)).toBe(true);
    expect(book.conflicts).toEqual([]);
  });

  it('손대지 않은 빈 날은 보관하지 않고, 같은 날로 이동은 아무 일도 없다', () => {
    const book = emptyBook(createDayState('2026-10-15'));
    expect(switchDay(book, '2026-10-15', AT)).toBe(book);
    const moved = switchDay(book, '2026-10-16', AT);
    expect(moved.days).toEqual({});
  });

  it('같은 날짜가 이미 보관돼 있고 내용이 다르면 덮어쓰지 않고 둘 다 남긴다', () => {
    const a = usedDay('2026-10-15');
    const b = setEtaMode(a, 'yangcho', 'subway', { station_arrival: C('18:50') }, 'yangcho');
    let book = emptyBook(createDayState('2026-10-16'));
    book = putArchive(book, archiveEntry(a, 'load', AT));
    const same = putArchive(book, archiveEntry(a, 'load', AT));
    expect(same).toBe(book); // 같은 내용은 그대로 (반복 안전)
    const both = putArchive(book, archiveEntry(b, 'load', AT));
    expect(sameState(both.days['2026-10-15'].state, a)).toBe(true);
    expect(both.conflicts).toHaveLength(1);
    expect(sameState(both.conflicts[0].state, b)).toBe(true);
  });

  it('개발 도구가 오늘을 통째로 바꿔도 바뀌는 쪽 내용을 지우지 않고 남긴다', () => {
    const cur = usedDay('2026-10-15');
    const book = stashCurrent(emptyBook(cur), createDayState('2026-10-15'), 'dev_reset', AT);
    expect(book.conflicts).toHaveLength(1);
    expect(sameState(book.conflicts[0].state, cur)).toBe(true);
    expect(book.days).toEqual({});
    // 손댄 게 없던 오늘은 남길 게 없음
    expect(stashCurrent(emptyBook(createDayState('2026-10-15')), cur, 'dev_scenario', AT).conflicts).toEqual([]);
  });
});

describe('보관 기간·개수 제한 없음', () => {
  it('400일치를 보관해도 하나도 사라지지 않고 보관함 파일이 읽힌다', () => {
    let book = emptyBook(createDayState('2026-01-01'));
    for (let i = 0; i < 400; i++) {
      const d = new Date(Date.parse('2026-01-01T00:00:00Z') + i * 86_400_000).toISOString().slice(0, 10);
      const edited = setEtaMode(createDayState(d), 'tawi', 'subway', { station_arrival: C('19:10') }, 'tawi');
      book = { ...book, current: edited };
      book = switchDay(book, new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10), AT);
    }
    expect(Object.keys(book.days)).toHaveLength(400);
    expect(archivedList(book)[0].day > archivedList(book)[399].day).toBe(true);
    const store = new MemStore();
    store.data.set(KEYS.days, serializeHistory(book));
    store.data.set(KEYS.day, JSON.stringify(book.current));
    const r = loadBook(store, book.current.day, AT);
    expect(Object.keys(r.book.days)).toHaveLength(400);
  });
});

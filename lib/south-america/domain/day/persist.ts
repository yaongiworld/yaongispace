// 하루 장부를 저장소에 읽고 쓰는 곳. 브라우저를 직접 몰라요 (getItem/setItem/removeItem만 있으면 돼요).
//
// 데이터 보호 원칙 [1단계 승인 조건]
// 1) 지난 날을 "보관함에 먼저 쓰고, 다시 읽어서 확인한 뒤에만" 현재 저장 칸(day.v1)을 바꿔요.
// 2) 보관·백업·읽기·쓰기가 하나라도 실패하면 현재 저장 칸(day.v1)을 건드리지 않고(원본 유지) 그 사실을 알려요.
// 3) 읽을 수 없는 데이터는 지우지 않고 따로 복사해서 보존해요. 복사가 실패하면 덮어쓰지 않아요.
// 4) 같은 읽기를 여러 번 해도 보관이 늘어나거나 중복되지 않아요 (반복 실행 안전).
// 5) 보관 기간이나 개수를 제한하지 않아요.
import { createDayState, type DayState } from './day';
import {
  archiveEntry,
  emptyBook,
  parseDayState,
  sameState,
  switchDay,
  type ArchiveReason,
  type ArchivedDay,
  type DayBook,
} from './daybook';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** 저장 칸 이름. 현재 하루는 기존 칸(day.v1)을 그대로 써서 예전 데이터와 호환돼요. */
export const KEYS = {
  day: 'sap.proto.day.v1',
  days: 'sap.proto.days.v1',
  /** 새 방식으로 처음 불러올 때 한 번 복사해 두는 day.v1 원본 */
  backup: 'sap.proto.day.v1.bak',
  /** 읽을 수 없어서 따로 보존한 원본 (뒤에 번호가 붙어요) */
  corruptDay: 'sap.proto.day.v1.corrupt',
  corruptDays: 'sap.proto.days.v1.corrupt',
} as const;

export const HISTORY_VERSION = 1;

export type StorageNoticeCode =
  | 'storage_unavailable'
  | 'archive_failed'
  | 'write_failed'
  | 'backup_failed'
  | 'day_unreadable_preserved'
  | 'history_unreadable_preserved'
  | 'preserve_failed'
  | 'entries_quarantined'
  | 'conflicts_kept';

export type StorageNotice = { code: StorageNoticeCode; message: string };

export type LoadResult = {
  book: DayBook;
  notices: StorageNotice[];
  /** true면 현재 저장 칸(day.v1)을 바꾸지 않아요. 원본이 안전하게 남아 있어요. 메모리에서만 동작해요. */
  blocked: boolean;
};

const notice = (code: StorageNoticeCode, message: string): StorageNotice => ({ code, message });

/* ───────── 아주 작은 도우미 ───────── */

/** 쓰고 → 다시 읽어서 같은지 확인해요 (조용히 실패하는 저장소도 잡아요) */
function writeVerified(store: KeyValueStore, key: string, value: string): boolean {
  try {
    store.setItem(key, value);
    return store.getItem(key) === value;
  } catch {
    return false;
  }
}

/** 이미 있는 값은 건드리지 않고, 비어 있는 이름을 골라 원본을 복사해요 */
function preserveCopy(store: KeyValueStore, baseKey: string, raw: string): boolean {
  try {
    for (let i = 0; i < 1000; i++) {
      const key = i === 0 ? baseKey : `${baseKey}.${i}`;
      const have = store.getItem(key);
      if (have === raw) return true; // 이미 같은 원본이 보존돼 있어요 (반복 실행 안전)
      if (have === null) return writeVerified(store, key, raw);
    }
  } catch {
    /* 아래에서 실패로 처리 */
  }
  return false;
}

/* ───────── 보관함 파일 모양 ───────── */

type HistoryFile = { version: typeof HISTORY_VERSION; days: Record<string, unknown>; conflicts: unknown[]; quarantine: unknown[] };

function parseEntry(e: unknown): ArchivedDay | null {
  if (typeof e !== 'object' || e === null) return null;
  const o = e as Record<string, unknown>;
  const state = parseDayState(o.state);
  if (!state || typeof o.day !== 'string' || o.day !== state.day) return null;
  const base = archiveEntry(state, (o.reason as ArchiveReason) ?? 'load', typeof o.archivedAt === 'string' ? o.archivedAt : '');
  return { ...base, ...(typeof o.archivedAt === 'string' ? { archivedAt: o.archivedAt } : {}) };
}

export function serializeHistory(book: Pick<DayBook, 'days' | 'conflicts' | 'quarantine'>): string {
  const file: HistoryFile = { version: HISTORY_VERSION, days: book.days, conflicts: book.conflicts, quarantine: book.quarantine };
  return JSON.stringify(file);
}

/** 보관함 파일 읽기. 해석 못 하는 항목은 버리지 않고 quarantine에 둬요. 파일 전체가 깨졌으면 null */
export function parseHistory(raw: string): Pick<DayBook, 'days' | 'conflicts' | 'quarantine'> | null {
  let f: unknown;
  try {
    f = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof f !== 'object' || f === null) return null;
  const o = f as Record<string, unknown>;
  if (o.version !== HISTORY_VERSION || typeof o.days !== 'object' || o.days === null || Array.isArray(o.days)) return null;
  const days: Record<string, ArchivedDay> = {};
  const quarantine: unknown[] = Array.isArray(o.quarantine) ? [...o.quarantine] : [];
  const conflicts: ArchivedDay[] = [];
  for (const [k, v] of Object.entries(o.days as Record<string, unknown>)) {
    const e = parseEntry(v);
    if (e && e.day === k) days[k] = e;
    else quarantine.push({ key: k, value: v });
  }
  for (const v of Array.isArray(o.conflicts) ? o.conflicts : []) {
    const e = parseEntry(v);
    if (e) conflicts.push(e);
    else quarantine.push({ key: 'conflicts', value: v });
  }
  return { days, conflicts, quarantine };
}

/* ───────── 불러오기 ───────── */

/**
 * 앱을 열 때 호출해요. 같은 날이면 그대로 이어서, 날짜가 달라졌으면 지난 날을 보관하고 오늘로 넘어가요.
 * 같은 저장소에서 여러 번 불러도 결과가 같아요.
 */
export function loadBook(store: KeyValueStore, today: string, nowIso: string): LoadResult {
  const notices: StorageNotice[] = [];
  let blocked = false;
  const fresh = () => emptyBook(createDayState(today));

  let rawDay: string | null;
  let rawDays: string | null;
  try {
    rawDay = store.getItem(KEYS.day);
    rawDays = store.getItem(KEYS.days);
  } catch {
    // 저장소를 읽을 수 없으면 아무것도 쓰지 않아요
    return { book: fresh(), notices: [notice('storage_unavailable', '저장소를 읽을 수 없어서 이 기기에는 기록이 저장되지 않아요. 기존 기록은 그대로 남아 있어요.')], blocked: true };
  }

  /* 보관함 */
  let hist: Pick<DayBook, 'days' | 'conflicts' | 'quarantine'> = { days: {}, conflicts: [], quarantine: [] };
  if (rawDays !== null) {
    const parsed = parseHistory(rawDays);
    if (parsed === null) {
      if (!preserveCopy(store, KEYS.corruptDays, rawDays)) {
        blocked = true;
        notices.push(notice('preserve_failed', '지난 기록 보관함을 읽을 수 없고 따로 복사하지도 못해서, 원본을 지키려고 저장을 멈췄어요.'));
      } else {
        notices.push(notice('history_unreadable_preserved', '지난 기록 보관함을 읽을 수 없어서 원본을 따로 복사해 두고 새로 시작했어요.'));
      }
    } else {
      hist = parsed;
      if (hist.quarantine.length > 0) notices.push(notice('entries_quarantined', `읽을 수 없는 보관 항목 ${hist.quarantine.length}개를 지우지 않고 따로 두었어요.`));
    }
  }

  /* 현재 하루 */
  let current: DayState | null = null;
  if (rawDay !== null) {
    let parsed: DayState | null = null;
    try {
      parsed = parseDayState(JSON.parse(rawDay));
    } catch {
      parsed = null;
    }
    if (parsed === null) {
      if (!preserveCopy(store, KEYS.corruptDay, rawDay)) {
        blocked = true;
        notices.push(notice('preserve_failed', '오늘 기록을 읽을 수 없고 따로 복사하지도 못해서, 원본을 지키려고 저장을 멈췄어요.'));
      } else {
        notices.push(notice('day_unreadable_preserved', '저장된 오늘 기록을 읽을 수 없어서 원본을 따로 복사해 두고 새로 시작했어요.'));
      }
    } else {
      current = parsed;
      // 새 방식으로 처음 불러올 때 원본을 한 번 복사해 둬요. 실패해도 원본은 그대로예요.
      try {
        if (store.getItem(KEYS.backup) === null && !writeVerified(store, KEYS.backup, rawDay)) {
          notices.push(notice('backup_failed', '원본 백업을 만들지 못했어요. 기존 기록은 그대로 남아 있어요.'));
        }
      } catch {
        notices.push(notice('backup_failed', '원본 백업을 만들지 못했어요. 기존 기록은 그대로 남아 있어요.'));
      }
    }
  }

  let book: DayBook = { current: current ?? createDayState(today), ...hist };

  /* 같은 날짜가 현재와 보관함에 모두 있는 잔여물(이전 작업이 중간에 멈춘 경우)을 안전하게 정리 */
  const dup = book.days[book.current.day];
  if (dup) {
    const { [book.current.day]: _d, ...rest } = book.days;
    void _d;
    book = sameState(dup.state, book.current) ? { ...book, days: rest } : { ...book, days: rest, conflicts: [...book.conflicts, dup] };
    notices.push(notice('conflicts_kept', '같은 날짜의 기록이 두 곳에 있어서 하나는 지우지 않고 따로 남겼어요.'));
  }

  /* 날짜가 바뀌었다면 지난 날을 보관하고 오늘로 */
  if (current !== null && current.day !== today) {
    const next = switchDay(book, today, nowIso, 'load');
    const ok = !blocked && commitSwitch(store, book, next, notices);
    book = next;
    if (!ok) blocked = true;
  } else if (current === null) {
    book = { ...book, current: createDayState(today) };
  }
  return { book, notices, blocked };
}

/* ───────── 쓰기 ───────── */

/**
 * 날짜를 옮길 때(오늘이 바뀜, 개발용 날짜 이동 포함) 쓰는 순서:
 *  ① 보관함에 지난 날을 쓰고 다시 읽어 확인 → ② 확인되면 현재 칸(day.v1)을 새 날로 → ③ 꺼낸 날을 보관함에서 정리.
 * ①이나 ②가 실패하면 현재 칸의 원본을 바꾸지 않아요. 실패하면 false.
 */
export function commitSwitch(store: KeyValueStore, prev: DayBook, next: DayBook, notices: StorageNotice[]): boolean {
  // ① 보관함: 새로 꺼내는 날(복원)도 아직 지우지 않은 채로 먼저 써요
  const restored = prev.days[next.current.day];
  const histA = restored ? { ...next, days: { ...next.days, [next.current.day]: restored } } : next;
  if (!writeVerified(store, KEYS.days, serializeHistory(histA))) {
    notices.push(notice('archive_failed', '지난 기록을 보관하지 못해서, 원본을 지키려고 이 기기에서는 새 기록을 저장하지 않아요. 앱을 다시 열면 다시 시도해요.'));
    return false;
  }
  // ② 현재 칸
  if (!writeVerified(store, KEYS.day, JSON.stringify(next.current))) {
    notices.push(notice('write_failed', '오늘 기록을 저장하지 못했어요. 지난 기록은 보관돼 있어요.'));
    return false;
  }
  // ③ 정리 (실패해도 괜찮아요. 다음에 불러올 때 안전하게 정리돼요)
  if (restored) writeVerified(store, KEYS.days, serializeHistory(next));
  return true;
}

/** 보관함 내용이 바뀌었을 때(개발 도구가 오늘을 통째로 바꾸기 전 등)만 쓰고 확인해요 */
export function commitHistory(store: KeyValueStore, book: DayBook, notices: StorageNotice[]): boolean {
  if (!writeVerified(store, KEYS.days, serializeHistory(book))) {
    notices.push(notice('archive_failed', '지난 기록을 보관하지 못했어요. 원본은 그대로예요.'));
    return false;
  }
  return true;
}

/** 오늘 상태가 바뀔 때마다 저장해요. blocked면 아무것도 쓰지 않아요 (원본 보호). */
export function saveCurrent(store: KeyValueStore, current: DayState, blocked: boolean): StorageNotice | null {
  if (blocked) return null;
  return writeVerified(store, KEYS.day, JSON.stringify(current)) ? null : notice('write_failed', '오늘 기록을 저장하지 못했어요.');
}

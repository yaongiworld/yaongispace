// 유산소 기록 저장소(sap.proto.logs.v1) 읽기·쓰기 [5-A]. 브라우저를 직접 몰라요 (getItem/setItem/removeItem만 있으면 돼요).
// 하루 상태 저장 칸(day.v1·days.v1)과는 완전히 따로예요: 이 파일은 그 칸을 읽지도 쓰지도 않아요.
//
// 데이터 보호 원칙 (day.v1·days.v1과 같은 수준)
// 1) 쓰고 → 다시 읽어서 같은지 확인해요. 실패하면 이전 내용이 그대로 남아요.
// 2) 읽을 수 없는 파일은 지우지 않고 따로 복사해 보존해요. 복사가 실패하면 덮어쓰지 않고 저장을 멈춰요.
// 3) 읽을 수 없는 기록 한 건은 버리지 않고 quarantine에 보존해요. 알 수 없는 종류의 기록은 원본 그대로 보존해요.
// 4) 불러오기만으로는 아무것도 쓰지 않아요 (반복해도 같은 결과).
import { CUSTOM_NAME_MAX, CUSTOM_NAME_MIN, MIN_MINUTES, OTHER_EXERCISE_ID, isCardioExerciseId } from '../../config/cardio';
import type { KeyValueStore } from '../day/persist';
import { isPlanDay } from '../time';
import type { PersonId } from '../types';
import { isValidDistanceM } from './distance';
import { emptyLogBook, type CardioLog, type LogBook, type LogRevision, type StoredLog } from './types';

export const LOGS_KEYS = {
  logs: 'sap.proto.logs.v1',
  /** 읽을 수 없어서 따로 보존한 원본 (뒤에 번호가 붙어요) */
  corrupt: 'sap.proto.logs.v1.corrupt',
} as const;

export const LOGS_VERSION = 1;

export type LogStorageNoticeCode = 'storage_unavailable' | 'logs_unreadable_preserved' | 'preserve_failed' | 'entries_quarantined' | 'write_failed';
export type LogStorageNotice = { code: LogStorageNoticeCode; message: string };

export type LoadLogsResult = {
  book: LogBook;
  notices: LogStorageNotice[];
  /** true면 저장 칸을 바꾸지 않아요 (원본을 지키는 중). 메모리에서만 동작해요 */
  blocked: boolean;
};

const notice = (code: LogStorageNoticeCode, message: string): LogStorageNotice => ({ code, message });

/** 쓰고 → 다시 읽어서 같은지 확인 (조용히 실패하는 저장소도 잡아요) */
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

/* ───────── 파일 모양 ───────── */

type LogsFile = { version: typeof LOGS_VERSION; logs: StoredLog[]; quarantine: unknown[] };

export function serializeLogBook(book: LogBook): string {
  const file: LogsFile = { version: LOGS_VERSION, logs: book.logs, quarantine: book.quarantine };
  return JSON.stringify(file);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isPerson = (v: unknown): v is PersonId => v === 'yangcho' || v === 'tawi';
const validInstant = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && !Number.isNaN(new Date(v).getTime());

function validRevision(r: unknown): r is LogRevision {
  if (!isObj(r) || !isPerson(r.by) || !validInstant(r.at)) return false;
  if (r.kind === 'recorded') return isObj(r.snapshot);
  if (r.kind === 'edited') return Array.isArray(r.changes);
  return r.kind === 'cancelled' || r.kind === 'restored';
}

/** 저장돼 있던 유산소 기록 한 건이 올바른지. 하나라도 이상하면 null (호출하는 쪽이 버리지 않고 따로 보존해요) */
function parseCardio(o: Record<string, unknown>): CardioLog | null {
  if (typeof o.logId !== 'string' || o.logId.trim() === '') return null;
  if (typeof o.season !== 'number' || !Number.isSafeInteger(o.season) || o.season < 1) return null;
  if (!isPlanDay(o.day) || !isPerson(o.person) || !isPerson(o.enteredBy) || !validInstant(o.recordedAt)) return null;
  if (!isCardioExerciseId(o.exerciseId)) return null;
  let customName: string | null = null;
  if (o.exerciseId === OTHER_EXERCISE_ID) {
    const n = typeof o.customName === 'string' ? Array.from(o.customName).length : 0;
    if (typeof o.customName !== 'string' || o.customName !== o.customName.trim() || n < CUSTOM_NAME_MIN || n > CUSTOM_NAME_MAX) return null;
    customName = o.customName;
  } else if (o.customName !== null && o.customName !== undefined) return null;
  if (typeof o.minutes !== 'number' || !Number.isSafeInteger(o.minutes) || o.minutes < MIN_MINUTES) return null;
  if (!isValidDistanceM(o.distanceM)) return null;
  if (o.status !== 'active' && o.status !== 'cancelled') return null;
  if (!Array.isArray(o.revisions) || !o.revisions.every(validRevision)) return null;
  return { ...(o as unknown as CardioLog), customName };
}

/** 파일 전체가 깨졌으면 null. 항목 하나가 이상한 것은 버리지 않고 quarantine에 둬요 */
export function parseLogs(raw: string): LogBook | null {
  let f: unknown;
  try {
    f = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(f) || f.version !== LOGS_VERSION || !Array.isArray(f.logs)) return null;
  const logs: StoredLog[] = [];
  const quarantine: unknown[] = Array.isArray(f.quarantine) ? [...f.quarantine] : [];
  const seen = new Set<string>();
  for (const item of f.logs) {
    if (!isObj(item) || typeof item.kind !== 'string') {
      quarantine.push(item);
      continue;
    }
    if (item.kind !== 'cardio') {
      // 알 수 없는 종류(예: 나중에 생길 근력)는 원본 그대로 보존해요
      logs.push(item as StoredLog);
      if (typeof item.logId === 'string') seen.add(item.logId);
      continue;
    }
    const parsed = parseCardio(item);
    if (parsed === null || seen.has(parsed.logId)) {
      quarantine.push(item); // 이상하거나 ID가 겹치는 항목도 버리지 않아요
      continue;
    }
    seen.add(parsed.logId);
    logs.push(parsed);
  }
  return { logs, quarantine };
}

/* ───────── 읽기·쓰기 ───────── */

/** 앱을 열 때 호출해요. 읽기만 하고(읽을 수 없는 파일의 보존 복사만 예외), 반복해도 같은 결과예요. */
export function loadLogBook(store: KeyValueStore): LoadLogsResult {
  let raw: string | null;
  try {
    raw = store.getItem(LOGS_KEYS.logs);
  } catch {
    return { book: emptyLogBook(), notices: [notice('storage_unavailable', '저장소를 읽을 수 없어서 운동 기록이 저장되지 않아요. 기존 기록은 그대로 남아 있어요.')], blocked: true };
  }
  if (raw === null) return { book: emptyLogBook(), notices: [], blocked: false };

  const parsed = parseLogs(raw);
  if (parsed === null) {
    if (!preserveCopy(store, LOGS_KEYS.corrupt, raw)) {
      return { book: emptyLogBook(), notices: [notice('preserve_failed', '운동 기록 파일을 읽을 수 없고 따로 복사하지도 못해서, 원본을 지키려고 저장을 멈췄어요.')], blocked: true };
    }
    return { book: emptyLogBook(), notices: [notice('logs_unreadable_preserved', '운동 기록 파일을 읽을 수 없어서 원본을 따로 복사해 두고 새로 시작했어요.')], blocked: false };
  }
  const notices = parsed.quarantine.length > 0 ? [notice('entries_quarantined', `읽을 수 없는 운동 기록 ${parsed.quarantine.length}개를 지우지 않고 따로 두었어요. 합계에는 포함되지 않아요.`)] : [];
  return { book: parsed, notices, blocked: false };
}

/** 기록이 바뀔 때마다 저장해요. blocked면 아무것도 쓰지 않아요 (원본 보호). 실패하면 알림을 돌려주고 이전 내용은 그대로예요. */
export function commitLogBook(store: KeyValueStore, book: LogBook, blocked: boolean): LogStorageNotice | null {
  if (blocked) return null;
  return writeVerified(store, LOGS_KEYS.logs, serializeLogBook(book)) ? null : notice('write_failed', '운동 기록을 저장하지 못했어요. 이전에 저장한 기록은 그대로예요.');
}

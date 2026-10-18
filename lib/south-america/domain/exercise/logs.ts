// 유산소 기록의 동작과 읽기 [5-A]. 모두 순수 함수예요: 기록 묶음(LogBook)을 받아 새 묶음을 돌려줘요.
// 저장 방식과 화면은 몰라요. 운동 "완료" 기록·공동 운동 세션과는 아무 관계 없이 따로 움직여요.
//
// 원칙
// - 종목·시간·거리 세 가지가 모두 있어야 기록돼요 (거리 없는 기록, 속도·경사 없음).
// - 기록은 지우지 않아요: 취소는 상태만 바꾸고, 수정·취소·복구는 모두 이력에 남아요 (원래 값 보존).
// - 같은 logId로 두 번 저장해도 한 건이에요 (같은 내용이면 변화 없음, 다르면 거부).
// - 과거 날짜는 입력·수정할 수 있고, 미래 날짜는 안 돼요. 날짜는 04:00 경계의 계획 하루예요.
// - 같은 내용의 중복 입력은 막지 않아요 (비슷한 기록을 찾아 주기만 해요. 경고 화면은 5-B).
import { CUSTOM_NAME_MAX, CUSTOM_NAME_MIN, MIN_MINUTES, OTHER_EXERCISE_ID, SEASON_ID, isCardioExerciseId, type CardioExerciseId } from '../../config/cardio';
import { isPlanDay, planDayOf } from '../time';
import type { PersonId } from '../types';
import { isValidDistanceM } from './distance';
import { isCardioLog, type CardioLog, type LogBook, type LogChange, type LogField, type LogSnapshot } from './types';

const PERSONS: readonly PersonId[] = ['yangcho', 'tawi'];
const isPerson = (v: unknown): v is PersonId => PERSONS.includes(v as PersonId);

export type LogError =
  | 'invalid_log_id'
  | 'invalid_person'
  | 'invalid_time'
  | 'invalid_day'
  | 'future_day'
  | 'unknown_exercise'
  | 'invalid_custom_name'
  | 'invalid_minutes'
  | 'invalid_distance'
  | 'duplicate_log_id'
  | 'not_found'
  | 'not_cardio'
  | 'log_cancelled';

export type LogResult = { ok: true; book: LogBook; changed: boolean; log: CardioLog } | { ok: false; reason: LogError };

const ok = (book: LogBook, log: CardioLog, changed = true): LogResult => ({ ok: true, book, changed, log });
const fail = (reason: LogError): LogResult => ({ ok: false, reason });

/* ───────── 검증 ───────── */

const validInstant = (iso: unknown): iso is string => typeof iso === 'string' && iso.length > 0 && !Number.isNaN(new Date(iso).getTime());

/** 운동명: 앞뒤 공백을 지운 뒤 1~30글자(이모지도 한 글자로 셈) */
export function normalizeCustomName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const t = name.trim();
  const n = Array.from(t).length;
  return n >= CUSTOM_NAME_MIN && n <= CUSTOM_NAME_MAX ? t : null;
}

type Core = { day: string; exerciseId: CardioExerciseId; customName: string | null; minutes: number; distanceM: number };

/** 값 묶음 검사. 기타가 아닌 종목의 운동명은 무시하고 null로 맞춰요 */
function checkCore(raw: { day: unknown; exerciseId: unknown; customName: unknown; minutes: unknown; distanceM: unknown }, nowIso: string): { core: Core } | { error: LogError } {
  if (!isPlanDay(raw.day)) return { error: 'invalid_day' };
  if (raw.day > planDayOf(nowIso)) return { error: 'future_day' };
  if (!isCardioExerciseId(raw.exerciseId)) return { error: 'unknown_exercise' };
  let customName: string | null = null;
  if (raw.exerciseId === OTHER_EXERCISE_ID) {
    customName = normalizeCustomName(raw.customName);
    if (customName === null) return { error: 'invalid_custom_name' };
  }
  if (typeof raw.minutes !== 'number' || !Number.isSafeInteger(raw.minutes) || raw.minutes < MIN_MINUTES) return { error: 'invalid_minutes' };
  if (!isValidDistanceM(raw.distanceM)) return { error: 'invalid_distance' };
  return { core: { day: raw.day, exerciseId: raw.exerciseId, customName, minutes: raw.minutes, distanceM: raw.distanceM } };
}

const snapshotOf = (l: CardioLog): LogSnapshot => ({ day: l.day, person: l.person, exerciseId: l.exerciseId, customName: l.customName, minutes: l.minutes, distanceM: l.distanceM });

const sameContent = (a: CardioLog, b: { person: PersonId } & Core): boolean =>
  a.person === b.person && a.day === b.day && a.exerciseId === b.exerciseId && a.customName === b.customName && a.minutes === b.minutes && a.distanceM === b.distanceM;

/* ───────── 읽기 ───────── */

export const findLog = (book: LogBook, logId: string) => book.logs.find((l) => l.logId === logId);

/** 모든 유산소 기록 (취소된 것 포함, 저장된 순서) */
export const cardioLogs = (book: LogBook): CardioLog[] => book.logs.filter(isCardioLog);

export type LogFilter = { person?: PersonId; day?: string; season?: number; includeCancelled?: boolean };

/** 조건에 맞는 유산소 기록, 최근 날짜부터 (같은 날은 나중에 입력한 것이 먼저) */
export function listCardioLogs(book: LogBook, filter: LogFilter = {}): CardioLog[] {
  return cardioLogs(book)
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => (filter.person === undefined || l.person === filter.person) && (filter.day === undefined || l.day === filter.day) && (filter.season === undefined || l.season === filter.season) && (filter.includeCancelled === true || l.status === 'active'))
    .sort((a, b) => (a.l.day !== b.l.day ? (a.l.day < b.l.day ? 1 : -1) : a.l.recordedAt !== b.l.recordedAt ? (a.l.recordedAt < b.l.recordedAt ? 1 : -1) : b.i - a.i))
    .map(({ l }) => l);
}

export type SimilarQuery = { person: PersonId; day: string; exerciseId: CardioExerciseId; customName?: string | null; minutes: number; distanceM: number; exceptLogId?: string };

/**
 * 같은 사람·날짜·종목·시간·거리의 유효한 기록 (같은 운동을 두 번 입력했는지 알려 주는 용도).
 * 막지 않아요: 화면(5-B)이 "이미 비슷한 기록이 있어요" 경고를 보여 주고 사용자가 정해요.
 */
export function findSimilarLogs(book: LogBook, q: SimilarQuery): CardioLog[] {
  const name = q.exerciseId === OTHER_EXERCISE_ID ? normalizeCustomName(q.customName) : null;
  return cardioLogs(book).filter(
    (l) => l.status === 'active' && l.logId !== q.exceptLogId && sameContent(l, { person: q.person, day: q.day, exerciseId: q.exerciseId, customName: name, minutes: q.minutes, distanceM: q.distanceM }),
  );
}

/**
 * 그 사람의 같은 종목에서 가장 최근의 유효한 기록 (지난번 시간·거리를 "기본 제안값"으로 보여 줄 때 읽어요).
 * 읽기만 해요: 이 값을 불러와도 기록은 생기지 않고, 사용자가 직접 기록해야 확정돼요.
 */
export function latestCardio(book: LogBook, person: PersonId, exerciseId: CardioExerciseId, customName?: string | null): CardioLog | null {
  const name = exerciseId === OTHER_EXERCISE_ID ? normalizeCustomName(customName) : null;
  return listCardioLogs(book, { person }).find((l) => l.exerciseId === exerciseId && l.customName === name) ?? null;
}

/* ───────── 쓰기 ───────── */

export type RecordInput = {
  logId: string;
  /** 실제로 운동한 사람 */
  person: PersonId;
  /** 기록을 입력한 사람 */
  enteredBy: PersonId;
  /** 입력한 실제 순간 (ISO). 날짜를 안 주면 이 순간의 계획 하루가 운동한 날이에요 */
  recordedAt: string;
  /** 운동한 날 (오늘 이전). 생략하면 recordedAt의 계획 하루 */
  day?: string;
  exerciseId: string;
  customName?: string | null;
  minutes: number;
  /** 정수 미터. 화면의 km 입력은 kmToMeters로 먼저 바꿔요 */
  distanceM: number;
};

/**
 * 유산소 기록을 추가해요 (종목·시간·거리 필수).
 * 같은 logId가 이미 있고 내용이 같으면 아무것도 바꾸지 않고(중복 저장 방지), 내용이 다르면 거부해요.
 */
export function recordCardio(book: LogBook, input: RecordInput): LogResult {
  if (typeof input.logId !== 'string' || input.logId.trim() === '') return fail('invalid_log_id');
  if (!isPerson(input.person) || !isPerson(input.enteredBy)) return fail('invalid_person');
  if (!validInstant(input.recordedAt)) return fail('invalid_time');
  const checked = checkCore({ day: input.day ?? planDayOf(input.recordedAt), exerciseId: input.exerciseId, customName: input.customName, minutes: input.minutes, distanceM: input.distanceM }, input.recordedAt);
  if ('error' in checked) return fail(checked.error);
  const { core } = checked;

  const existing = findLog(book, input.logId);
  if (existing) {
    if (isCardioLog(existing) && sameContent(existing, { person: input.person, ...core })) return ok(book, existing, false);
    return fail('duplicate_log_id');
  }
  const log: CardioLog = {
    logId: input.logId,
    kind: 'cardio',
    season: SEASON_ID,
    ...core,
    person: input.person,
    enteredBy: input.enteredBy,
    recordedAt: input.recordedAt,
    status: 'active',
    revisions: [],
  };
  log.revisions = [{ kind: 'recorded', by: input.enteredBy, at: input.recordedAt, snapshot: snapshotOf(log) }];
  return ok({ ...book, logs: [...book.logs, log] }, log);
}

export type EditPatch = { day?: string; exerciseId?: string; customName?: string | null; minutes?: number; distanceM?: number };
export type Actor = { by: PersonId; at: string };

function replaceLog(book: LogBook, next: CardioLog): LogBook {
  return { ...book, logs: book.logs.map((l) => (l.logId === next.logId ? next : l)) };
}

function load(book: LogBook, logId: string, actor: Actor): { log: CardioLog } | { error: LogError } {
  if (!isPerson(actor.by)) return { error: 'invalid_person' };
  if (!validInstant(actor.at)) return { error: 'invalid_time' };
  const l = findLog(book, logId);
  if (!l) return { error: 'not_found' };
  if (!isCardioLog(l)) return { error: 'not_cardio' };
  return { log: l };
}

/**
 * 종목·시간·거리·날짜를 고쳐요 (운동한 사람은 바꾸지 않아요). 취소된 기록은 먼저 복구해야 고칠 수 있어요.
 * 바뀐 값마다 "이전 값 → 새 값"이 이력에 남고, 처음 값은 첫 이력(recorded)에 그대로 있어요. 달라진 게 없으면 변화 없음이에요.
 */
export function editCardio(book: LogBook, logId: string, patch: EditPatch, actor: Actor): LogResult {
  const loaded = load(book, logId, actor);
  if ('error' in loaded) return fail(loaded.error);
  const cur = loaded.log;
  if (cur.status === 'cancelled') return fail('log_cancelled');

  const exerciseId = patch.exerciseId ?? cur.exerciseId;
  // 기타로 바꾸는데 운동명을 안 주면 기존 운동명을 쓰고, 기타가 아닌 종목이면 운동명은 비워요
  const customName = exerciseId === OTHER_EXERCISE_ID ? (patch.customName !== undefined ? patch.customName : cur.customName) : null;
  const checked = checkCore(
    { day: patch.day ?? cur.day, exerciseId, customName, minutes: patch.minutes ?? cur.minutes, distanceM: patch.distanceM ?? cur.distanceM },
    actor.at,
  );
  if ('error' in checked) return fail(checked.error);
  const { core } = checked;

  const changes: LogChange[] = [];
  const diff = (field: LogField, before: string | number | null, after: string | number | null) => {
    if (before !== after) changes.push({ field, before, after });
  };
  diff('day', cur.day, core.day);
  diff('exerciseId', cur.exerciseId, core.exerciseId);
  diff('customName', cur.customName, core.customName);
  diff('minutes', cur.minutes, core.minutes);
  diff('distanceM', cur.distanceM, core.distanceM);
  if (changes.length === 0) return ok(book, cur, false);

  const next: CardioLog = { ...cur, ...core, revisions: [...cur.revisions, { kind: 'edited', by: actor.by, at: actor.at, changes }] };
  return ok(replaceLog(book, next), next);
}

/** 취소: 기록과 이력은 남기고 상태만 바꿔요 (합계에서 빠져요). 이미 취소됐으면 변화 없음 */
export function cancelCardio(book: LogBook, logId: string, actor: Actor): LogResult {
  const loaded = load(book, logId, actor);
  if ('error' in loaded) return fail(loaded.error);
  const cur = loaded.log;
  if (cur.status === 'cancelled') return ok(book, cur, false);
  const next: CardioLog = { ...cur, status: 'cancelled', revisions: [...cur.revisions, { kind: 'cancelled', by: actor.by, at: actor.at }] };
  return ok(replaceLog(book, next), next);
}

/** 복구: 같은 기록(같은 logId)이 되살아나요. 이미 유효하면 변화 없음 */
export function restoreCardio(book: LogBook, logId: string, actor: Actor): LogResult {
  const loaded = load(book, logId, actor);
  if ('error' in loaded) return fail(loaded.error);
  const cur = loaded.log;
  if (cur.status === 'active') return ok(book, cur, false);
  const next: CardioLog = { ...cur, status: 'active', revisions: [...cur.revisions, { kind: 'restored', by: actor.by, at: actor.at }] };
  return ok(replaceLog(book, next), next);
}

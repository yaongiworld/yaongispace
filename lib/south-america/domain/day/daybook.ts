// 날짜가 바뀌어도 지난 날의 상태를 보관하는 "하루 장부" (순수 함수만, 저장소는 모름).
//
// 원칙
// - 한 날짜의 상태는 항상 "현재(current)" 아니면 "보관(days)" 중 한 곳에만 있어요.
// - 보관은 덮어쓰지 않아요. 같은 날짜가 이미 있고 내용이 다르면 둘 다 남겨요(conflicts).
// - 기록 보존 기간이나 개수는 제한하지 않아요.
// - 사용자가 바꾼 것이 하나라도 있으면(ETA·PLAN·희망 저녁·완료 기록 등) 보관해요. 처음 상태 그대로인 날만 건너뛰어요.
// - 읽을 수 없는 항목도 버리지 않고 quarantine에 그대로 남겨요.
import { isPlanDay } from '../time';
import { validateTimeSettings } from '../../config/timeSettings';
import { createDayState, DAY_STATE_VERSION, type DayState } from './day';
import { legacyJointEnd, sessionOf } from './session';

export type ArchiveReason = 'rollover' | 'load' | 'dev_shift' | 'dev_reset' | 'dev_scenario' | 'import';

export type ArchivedDay = {
  /** 운동한 날 (계획 하루) */
  day: string;
  /** 그날 상태 원본 (저장돼 있던 그대로) */
  state: DayState;
  /** 언제 보관했는지 (실제 순간, ISO) */
  archivedAt: string;
  reason: ArchiveReason;
  /** ❤️ 공동 시작 기록이 있는 날의 세션 ID. 없으면 null (세션 없음) */
  sessionId: string | null;
  /** 옛 방식의 공동 종료 기록이 들어 있는지 (개인별 완료 미확인으로 구분) */
  hasLegacyJointEnd: boolean;
};

export type DayBook = {
  current: DayState;
  days: Record<string, ArchivedDay>;
  /** 같은 날짜가 이미 보관돼 있고 내용이 달라서 따로 남긴 것들 (아무것도 덮어쓰지 않아요) */
  conflicts: ArchivedDay[];
  /** 모양이 맞지 않아 해석하지 못했지만 버리지 않고 그대로 둔 항목들 */
  quarantine: unknown[];
};

/* ───────── 비교 ───────── */

/** 키 순서와 상관없이 같은 내용이면 같은 글자가 되게 해요 */
export function stableStringify(v: unknown): string {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .filter((k) => o[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(',')}}`;
}

export const sameState = (a: DayState, b: DayState): boolean => stableStringify(a) === stableStringify(b);

/** 처음 상태 그대로인 날 (사용자가 아무것도 바꾸지 않음). 이런 날만 보관하지 않아요. */
export const isPristine = (state: DayState): boolean => sameState(state, createDayState(state.day, state.settings));

/* ───────── 읽기 (엄격하지 않게, 하지만 핵심은 확인) ───────── */

/**
 * 저장돼 있던 값을 하루 상태로 해석해요. 핵심(버전·날짜·설정·ETA·기록 모양)이 맞아야 하고,
 * 없는 선택 항목은 기본값으로 채워요. 알 수 없는 기록이나 추가 항목은 그대로 보존해요.
 * 해석할 수 없으면 null이고, 호출하는 쪽은 원본을 버리지 말고 따로 보존해야 해요.
 */
export function parseDayState(raw: unknown): DayState | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.version !== DAY_STATE_VERSION || !isPlanDay(r.day)) return null;
  const settings = r.settings as DayState['settings'] | undefined;
  if (typeof settings !== 'object' || settings === null || !settings.yangcho || !settings.tawi) return null;
  try {
    if (validateTimeSettings(settings).length > 0) return null;
  } catch {
    return null;
  }
  const eta = r.eta as Record<string, unknown> | undefined;
  if (typeof eta !== 'object' || eta === null || !Array.isArray(eta.yangcho) || !Array.isArray(eta.tawi)) return null;
  const actuals = r.actuals as { steps?: unknown } | undefined;
  if (typeof actuals !== 'object' || actuals === null || typeof actuals.steps !== 'object' || actuals.steps === null || Array.isArray(actuals.steps)) return null;
  if (r.plan !== 'A' && r.plan !== 'B') return null;
  const fresh = createDayState(r.day, settings);
  return { ...fresh, ...(r as unknown as DayState) };
}

/* ───────── 보관 ───────── */

export function archiveEntry(state: DayState, reason: ArchiveReason, archivedAt: string): ArchivedDay {
  const s = sessionOf(state);
  return { day: state.day, state, archivedAt, reason, sessionId: s ? s.id : null, hasLegacyJointEnd: legacyJointEnd(state) !== null };
}

/** 보관함에 넣어요. 같은 날짜가 이미 있으면 덮어쓰지 않고, 같으면 그대로 두고, 다르면 conflicts에 남겨요. */
export function putArchive(book: DayBook, entry: ArchivedDay): DayBook {
  const existing = book.days[entry.day];
  if (!existing) return { ...book, days: { ...book.days, [entry.day]: entry } };
  if (sameState(existing.state, entry.state)) return book;
  return { ...book, conflicts: [...book.conflicts, entry] };
}

export function emptyBook(current: DayState): DayBook {
  return { current, days: {}, conflicts: [], quarantine: [] };
}

/**
 * 오늘(계획 하루)이 바뀌었을 때: 지난 날을 보관하고, 새 날의 상태를 꺼내요.
 * - 새 날짜가 보관함에 있으면(날짜를 되돌린 경우) 그 상태를 다시 현재로 꺼내요. 새로 만들지 않아요.
 * - 없으면 새 하루를 만들고 시간 설정만 이어받아요.
 * 같은 날짜로 다시 불러도 아무것도 바뀌지 않아요(반복 실행해도 같은 결과).
 */
export function switchDay(book: DayBook, target: string, at: string, reason: ArchiveReason = 'rollover'): DayBook {
  if (!isPlanDay(target)) throw new RangeError(`날짜 형식이 맞지 않아요: ${target}`);
  if (book.current.day === target) return book;
  let next = isPristine(book.current) ? book : putArchive(book, archiveEntry(book.current, reason, at));
  const restored = next.days[target];
  if (restored) {
    const { [target]: _out, ...rest } = next.days;
    void _out;
    return { ...next, days: rest, current: restored.state };
  }
  return { ...next, current: createDayState(target, book.current.settings) };
}

/**
 * 개발 도구가 현재 상태를 통째로 바꾸기 전에, 바뀌는 쪽의 내용을 먼저 남겨요 (지우지 않아요).
 * 같은 날짜가 "현재"와 "보관" 양쪽에 있지 않도록 이렇게 바뀐 내용은 conflicts에 둬요.
 */
export function stashCurrent(book: DayBook, next: DayState, reason: ArchiveReason, at: string): DayBook {
  if (isPristine(book.current) || sameState(book.current, next)) return { ...book, current: next };
  return { ...book, current: next, conflicts: [...book.conflicts, archiveEntry(book.current, reason, at)] };
}

/**
 * 보관된 지난 날의 상태를 새 상태로 바꿔요 (지난 세션의 운동 완료 입력 등).
 * 날짜·보관 시각·보관 이유는 그대로 두고 세션 정보만 다시 계산해요. 새 날짜의 상태를 만들지 않아요.
 */
export function updateArchived(book: DayBook, day: string, next: DayState): DayBook {
  const e = book.days[day];
  if (!e || next.day !== day) return book;
  return { ...book, days: { ...book.days, [day]: archiveEntry(next, e.reason, e.archivedAt) } };
}

/** 보관된 날을 최근 날짜부터 */
export const archivedList = (book: DayBook): ArchivedDay[] => Object.values(book.days).sort((a, b) => (a.day < b.day ? 1 : -1));


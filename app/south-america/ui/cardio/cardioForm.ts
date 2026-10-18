// 유산소 입력 시트의 순수 계산 [5-B] (화면 없이 테스트해요). directTime.ts처럼 화면이 부르는 작은 규칙 모음이에요.
// 검증 규칙은 5-A 도메인(kmToMeters, 종목 ID, 기타 운동명)이 정해요. 여기서는 글자 입력을 그 규칙에 맞게 넘기고, 오류를 쉬운 말로 바꿔요.
import { isPlanDay } from '@/lib/south-america/domain/time';
import { CARDIO_EXERCISES, MIN_MINUTES, OTHER_EXERCISE_ID, isCardioExerciseId, type CardioExerciseId } from '@/lib/south-america/config/cardio';
import { formatKm, kmToMeters } from '@/lib/south-america/domain/exercise/distance';
import { latestCardio, listCardioLogs, normalizeCustomName, type LogError } from '@/lib/south-america/domain/exercise/logs';
import type { CardioLog, LogBook } from '@/lib/south-america/domain/exercise/types';
import type { PersonId } from '@/lib/south-america/domain/types';
import type { LogsStorageError } from '../../store/logsController';

export type CardioDraft = {
  person: PersonId;
  /** 처음에는 비어 있어요 (지난 기록이 있으면 마지막으로 한 종목) */
  exerciseId: CardioExerciseId | null;
  customName: string;
  minutes: string;
  km: string;
  day: string;
};

export type DraftErrors = { exercise?: string; customName?: string; minutes?: string; km?: string; day?: string };

export type ParsedDraft = { person: PersonId; day: string; exerciseId: CardioExerciseId; customName: string | null; minutes: number; distanceM: number };

export type ParseResult = { ok: true; value: ParsedDraft } | { ok: false; errors: DraftErrors };

const MINUTES_TEXT = /^\d{1,5}$/;

/**
 * 입력 글자를 5-A 규칙으로 검사해요. 하나라도 틀리면 저장할 수 없어요(반올림·자동 보정 없음).
 * today를 주면 미래 날짜를 미리 알려 줘요 (최종 판정은 5-A 도메인이 한 번 더 해요).
 */
export function parseDraft(d: CardioDraft, today?: string): ParseResult {
  const errors: DraftErrors = {};
  if (!isPlanDay(d.day)) errors.day = '날짜를 골라 주세요.';
  else if (today !== undefined && d.day > today) errors.day = '아직 오지 않은 날짜는 기록할 수 없어요.';
  if (d.exerciseId === null || !isCardioExerciseId(d.exerciseId)) errors.exercise = '운동 종류를 골라 주세요.';
  let customName: string | null = null;
  if (d.exerciseId === OTHER_EXERCISE_ID) {
    customName = normalizeCustomName(d.customName);
    if (customName === null) errors.customName = '운동 이름을 1~30글자로 적어 주세요.';
  }
  const mt = d.minutes.trim();
  const minutes = MINUTES_TEXT.test(mt) ? Number(mt) : NaN;
  if (!Number.isSafeInteger(minutes) || minutes < MIN_MINUTES) errors.minutes = `운동 시간은 ${MIN_MINUTES}분 이상의 정수(분)로 적어 주세요.`;
  const dist = kmToMeters(d.km);
  if (!dist.ok) errors.km = dist.reason === 'distance_precision' ? '거리는 소수점 첫째 자리(0.1km)까지만 적을 수 있어요. 자동으로 반올림하지 않아요.' : '거리는 0보다 큰 숫자(예: 3.0)로 적어 주세요.';
  if (Object.keys(errors).length > 0 || d.exerciseId === null || !dist.ok) return { ok: false, errors };
  return { ok: true, value: { person: d.person, day: d.day, exerciseId: d.exerciseId, customName, minutes, distanceM: dist.meters } };
}

/** 입력칸이 비어 있으면 오류를 보여 주지 않고 [기록하기]만 잠가요 (처음부터 빨간 글씨를 보이지 않기 위해) */
export const isUntouched = (d: Pick<CardioDraft, 'minutes' | 'km'>): { minutes: boolean; km: boolean } => ({ minutes: d.minutes.trim() === '', km: d.km.trim() === '' });

/* ───────── 스테퍼 ───────── */

/** 시간 [－][＋]: 칸이 비었거나 틀렸으면 0에서 시작하고, 1분 아래로는 내려가지 않아요 */
export function stepMinutes(text: string, delta: number): string {
  const t = text.trim();
  const cur = MINUTES_TEXT.test(t) ? Number(t) : 0;
  return String(Math.max(MIN_MINUTES, cur + delta));
}

/** 거리 [－][＋] (0.1km / 1.0km): 정수 미터로 계산해요. 칸이 비었거나 틀렸으면 0에서 시작하고 0.1km 아래로는 내려가지 않아요 */
export function stepKm(text: string, deltaKm: number): string {
  const r = kmToMeters(text);
  const cur = r.ok ? r.meters : 0;
  const next = Math.max(100, cur + Math.round(deltaKm * 10) * 100);
  return formatKm(next);
}

/* ───────── 지난번 기록 제안 ───────── */

export type Suggestion = { minutes: string; km: string; log: CardioLog };

/**
 * 같은 사람·같은 종목의 지난번 유효 기록(취소된 기록 제외)을 기본값으로 제안해요. 읽기만 해요: 기록은 [기록하기]를 눌러야 생겨요.
 * 기타는 같은 운동명끼리만 비교해요.
 */
export function suggestFor(book: LogBook, person: PersonId, exerciseId: CardioExerciseId | null, customName: string): Suggestion | null {
  if (exerciseId === null) return null;
  const log = latestCardio(book, person, exerciseId, customName);
  return log ? { minutes: String(log.minutes), km: formatKm(log.distanceM), log } : null;
}

/** 이 사람이 마지막으로 한 종목 (시트를 열 때 미리 골라 둬요). 지난 기록이 없으면 null = 아무것도 고르지 않아요 */
export function lastExerciseOf(book: LogBook, person: PersonId): { exerciseId: CardioExerciseId; customName: string } | null {
  const l = listCardioLogs(book, { person })[0];
  return l ? { exerciseId: l.exerciseId, customName: l.customName ?? '' } : null;
}

/* ───────── 날짜 ───────── */

/** 날짜 칸이 입력해도 되는 날짜인지 (미래 금지). 형식·미래 판정은 5-A 도메인이 한 번 더 해요 */
export const dayInputMax = (today: string): string => today;

/* ───────── 기록 ID ───────── */

/**
 * 시트를 열 때 한 번 만들어요. 같은 시트에서 [기록하기]를 두 번 눌러도 같은 ID라서 한 건만 저장돼요(5-A 규칙).
 * crypto.randomUUID는 보안 맥락(https)에서만 되므로 쓰지 않아요.
 */
export function newLogId(now: number = Date.now(), rand: () => number = Math.random): string {
  return `cardio-${now.toString(36)}-${Math.floor(rand() * 0x7fffffff).toString(36)}`;
}

/* ───────── 오류 문구 ───────── */

export const LOG_ERROR_TEXT: Record<LogError | LogsStorageError, string> = {
  invalid_log_id: '기록 번호가 올바르지 않아요.',
  invalid_person: '운동한 사람이 올바르지 않아요.',
  invalid_time: '시각이 올바르지 않아요.',
  invalid_day: '날짜가 올바르지 않아요.',
  future_day: '아직 오지 않은 날짜는 기록할 수 없어요.',
  unknown_exercise: '운동 종류를 골라 주세요.',
  invalid_custom_name: '운동 이름을 1~30글자로 적어 주세요.',
  invalid_minutes: `운동 시간은 ${MIN_MINUTES}분 이상의 정수(분)로 적어 주세요.`,
  invalid_distance: '거리는 0보다 큰 0.1km 단위로 적어 주세요.',
  duplicate_log_id: '같은 번호의 다른 기록이 이미 있어요. 시트를 닫고 다시 열어 주세요.',
  not_found: '기록을 찾을 수 없어요.',
  not_cardio: '유산소 기록이 아니에요.',
  log_cancelled: '취소된 기록은 먼저 복구해야 고칠 수 있어요.',
  storage_failed: '저장하지 못해서 기록하지 않았어요. 기존 기록은 그대로예요.',
  storage_blocked: '저장이 멈춘 상태(읽을 수 없는 기록을 지키는 중이거나 방금 복원을 적용함)라서 기록하지 않았어요. 화면을 새로 불러온 뒤 다시 해 주세요.',
  storage_changed: '다른 화면에서 유산소 기록이 바뀌었어요. 그쪽 기록을 지키려고 저장하지 않았어요. 최신 기록을 불러온 뒤 다시 해 주세요.',
};

export const exerciseChoices = CARDIO_EXERCISES;

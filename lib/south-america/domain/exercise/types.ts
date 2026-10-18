// 운동 종목별 기록(유산소)의 모양 [5-A]. 운동 "완료" 기록(actuals.steps)과 완전히 별개예요:
// 이 기록은 완료·공동 운동 세션을 만들지도 바꾸지도 않고, 하루 상태(day.v1·days.v1)와도 따로 저장돼요.
import type { CardioExerciseId } from '../../config/cardio';
import type { PersonId } from '../types';

export type LogStatus = 'active' | 'cancelled';

/** 수정할 수 있는 값 (운동한 사람은 바꾸지 않아요. 잘못 넣었다면 취소하고 다시 기록해요) */
export type LogField = 'day' | 'exerciseId' | 'customName' | 'minutes' | 'distanceM';
export type LogChange = { field: LogField; before: string | number | null; after: string | number | null };

/** 처음 기록한 값 (이후 수정해도 원래 값은 이력에 남아요) */
export type LogSnapshot = {
  day: string;
  person: PersonId;
  exerciseId: CardioExerciseId;
  customName: string | null;
  minutes: number;
  distanceM: number;
};

export type LogRevision =
  | { kind: 'recorded'; by: PersonId; at: string; snapshot: LogSnapshot }
  | { kind: 'edited'; by: PersonId; at: string; changes: LogChange[] }
  | { kind: 'cancelled'; by: PersonId; at: string }
  | { kind: 'restored'; by: PersonId; at: string };

/** 유산소 기록 한 건 */
export type CardioLog = {
  /** 고유 ID. 같은 ID로 두 번 저장해도 한 건이에요 */
  logId: string;
  kind: 'cardio';
  /** 시즌 번호 (시즌을 넘어서도 보존) */
  season: number;
  /** 운동한 날 (계획 하루, 04:00 경계). 오늘 이전이어야 해요 */
  day: string;
  /** 실제로 운동한 사람 */
  person: PersonId;
  /** 기록을 입력한 사람 (대신 입력이면 person과 달라요) */
  enteredBy: PersonId;
  /** 처음 입력한 실제 순간 (ISO) */
  recordedAt: string;
  exerciseId: CardioExerciseId;
  /** 기타 종목의 운동명 (그 밖에는 null) */
  customName: string | null;
  /** 운동 시간(분), 1 이상의 정수 */
  minutes: number;
  /** 운동 거리(미터). 0보다 크고 100의 배수(0.1km 단위)인 정수 — 환산 없이 그대로 합산해요 */
  distanceM: number;
  status: LogStatus;
  revisions: LogRevision[];
};

/**
 * 알 수 없는 종류의 기록(예: 나중에 생길 근력). 5-A는 읽고 보존만 해요: 고치지도, 지우지도, 합계에 넣지도 않아요.
 */
export type ForeignLog = { kind: string; [key: string]: unknown };

export type StoredLog = CardioLog | ForeignLog;

export const isCardioLog = (l: StoredLog): l is CardioLog => l.kind === 'cardio';

/** 기록 묶음: 읽을 수 있는 기록 + 읽을 수 없어서 버리지 않고 따로 둔 항목 */
export type LogBook = {
  logs: StoredLog[];
  quarantine: unknown[];
};

export const emptyLogBook = (): LogBook => ({ logs: [], quarantine: [] });

// 유산소 운동 종목과 기록 규칙의 "한 곳" [5-A, 사용자 승인 2026-10-18].
// 종목은 고정 ID로 저장하고, 화면에 보이는 이름은 이 파일에서만 관리해요 (이름이 바뀌어도 과거 기록은 그대로 이어져요).
// 속도·경사 같은 항목은 만들지 않았어요: 유산소 기록은 종목·시간·거리 세 가지가 전부예요.

/** 시즌 1 = South America [P-003]. 모든 기록에 시즌 번호를 붙여요 */
export const SEASON_ID = 1;

export const CARDIO_EXERCISES = [
  { id: 'treadmill_run', label: '러닝머신 달리기' },
  { id: 'treadmill_walk', label: '러닝머신 걷기' },
  { id: 'incline_walk', label: '경사 걷기(트레드밀)' },
  { id: 'indoor_bike', label: '실내 사이클' },
  { id: 'outdoor_run', label: '야외 달리기' },
  { id: 'outdoor_walk', label: '야외 걷기' },
  { id: 'other', label: '기타' },
] as const;

export type CardioExerciseId = (typeof CARDIO_EXERCISES)[number]['id'];

/** 운동명을 직접 입력하는 종목 */
export const OTHER_EXERCISE_ID: CardioExerciseId = 'other';

/** 기타 운동명 길이 (글자 수, 입력 오류 방지용) */
export const CUSTOM_NAME_MIN = 1;
export const CUSTOM_NAME_MAX = 30;

/** 최소 운동 시간(분) */
export const MIN_MINUTES = 1;

export const isCardioExerciseId = (v: unknown): v is CardioExerciseId => CARDIO_EXERCISES.some((e) => e.id === v);

/** 화면에 보일 이름. 기타는 사용자가 입력한 운동명이에요 */
export function cardioLabel(id: CardioExerciseId, customName?: string | null): string {
  if (id === OTHER_EXERCISE_ID) return customName && customName.length > 0 ? customName : '기타';
  return CARDIO_EXERCISES.find((e) => e.id === id)?.label ?? id;
}

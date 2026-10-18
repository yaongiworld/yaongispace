// 운동 세션의 이름(ID)과 날짜 [D-054: 하루 1세션]. 세션은 ❤️ 공동 시작 기록이 있는 날에만 있어요 (혼자 운동은 세션 없음 [D-067]).
// ID는 "운동한 날(계획 하루, 04:00 경계)"에서 만들어서 설정·PLAN을 바꾸거나 다음 날이 되어도 변하지 않아요.
// 이 파일은 읽기만 해요. 기록을 만들거나 바꾸지 않아요.
import { isPlanDay, type Minute } from '../time';
import type { PersonId } from '../types';
import { recordKey } from '../timeline/steps';
import type { DayState } from './day';

const PREFIX = 'ws:';

/** 그날의 운동 세션 ID (안정적). 예: "ws:2026-10-13" */
export const sessionIdOf = (day: string): string => {
  if (!isPlanDay(day)) throw new RangeError(`날짜 형식이 맞지 않아요: ${day}`);
  return `${PREFIX}${day}`;
};

/** 세션 ID에서 운동한 날을 되돌려요. 올바른 ID가 아니면 null */
export function sessionDayOf(id: string): string | null {
  if (typeof id !== 'string' || !id.startsWith(PREFIX)) return null;
  const day = id.slice(PREFIX.length);
  return isPlanDay(day) ? day : null;
}

export type SessionInfo = {
  id: string;
  /** 실제 운동한 날 (기록을 입력한 날과 다를 수 있어요) */
  day: string;
  /** ❤️를 실제로 누른 시각 (그날 00:00부터 지난 분) */
  startedAt: Minute;
  startedBy: PersonId;
};

/** ❤️ 공동 시작 기록이 있으면 그날의 세션 정보를, 없으면 null */
export function sessionOf(state: DayState): SessionInfo | null {
  const r = state.actuals.steps[recordKey('joint', 'start_together')];
  if (!r || r.status !== 'done' || typeof r.time !== 'number') return null;
  return { id: sessionIdOf(state.day), day: state.day, startedAt: r.time, startedBy: r.by };
}

/** 이전 방식(한 명이 눌러 둘 다 끝난 것으로 처리하던) 공동 종료 기록의 구분 이름 [사용자 확정 2026-10-14] */
export const LEGACY_JOINT_END_LABEL = '이전 방식의 공동 종료 기록 · 개인별 완료 미확인';

/**
 * 옛 `joint.workout_end` 기록이 있으면 알려 줘요. 원본은 그대로 두고 이름만 붙여서 구분해요.
 * 이 기록을 양초/타위 개인 완료로 자동 변환하지 않아요 (개인별 완료는 아직 확인되지 않았어요).
 */
export function legacyJointEnd(state: DayState): { key: string; label: string } | null {
  const key = recordKey('joint', 'workout_end');
  return state.actuals.steps[key] ? { key, label: LEGACY_JOINT_END_LABEL } : null;
}

// 시각 시트의 [직접 입력] 중간 상태를 판단해요 (화면 부품이 아니라 순수 함수라서 테스트할 수 있어요).
// 원칙: 시와 분을 두 자리씩 모두 넣어서 올바른 시각이 될 때만 "완성"이고, 그 전에는 저장할 수 없어요.
// 시각 해석(시작 이후 처음 오는 그 시각)과 범위 검사는 domain/day/workout.ts의 규칙을 그대로 써요.
import { resolveClockForSession } from '@/lib/south-america/domain/day/workout';
import type { Minute } from '@/lib/south-america/domain/time';

export type DirectDraft =
  /** 시·분 중 하나라도 비었거나 한 자리라서 아직 입력 중 */
  | { status: 'incomplete'; minute: null; rolled: false }
  /** 두 자리씩 모두 있지만 시(00~23)·분(00~59)이 아님 */
  | { status: 'invalid'; minute: null; rolled: false }
  /** 완성된 입력. rolled는 시작 시각보다 이른 시:분이라 다음 날로 해석했다는 뜻 */
  | { status: 'ok'; minute: Minute; rolled: boolean };

export function parseDirectDraft(startedAt: Minute, hh: string, mm: string): DirectDraft {
  if (!/^\d{2}$/.test(hh) || !/^\d{2}$/.test(mm)) return { status: 'incomplete', minute: null, rolled: false };
  const minute = resolveClockForSession(startedAt, Number(hh), Number(mm));
  if (minute === null) return { status: 'invalid', minute: null, rolled: false };
  return { status: 'ok', minute, rolled: Math.floor(minute / 1440) > Math.floor(startedAt / 1440) };
}

export const DIRECT_HINT = {
  incomplete: '시와 분을 두 자리씩 모두 넣어 주세요 (예: 20:45)',
  invalid: '시는 00~23, 분은 00~59로 넣어 주세요',
} as const;

/** 저장 전에 한 번 더 묻는 기준 (오입력 방지용 확인이에요. 운동 시간의 최대치가 아니고 기록을 막지 않아요) */
export const LONG_CONFIRM_MINUTES = 360;

/**
 * 직접 입력한 완료 시각이 ❤️ 시작일의 "다음 날"로 해석됐고, 시작부터 6시간 이상이면 저장 전에 확인해요.
 * 두 조건을 모두 만족할 때만이에요: 정상적인 자정 넘김 운동(예: 23:40 → 00:10)이나 같은 날의 긴 시간은 묻지 않아요.
 */
export function needsLongConfirm(startedAt: Minute, minute: Minute, viaDirect: boolean): boolean {
  return viaDirect && Math.floor(minute / 1440) > Math.floor(startedAt / 1440) && minute - startedAt >= LONG_CONFIRM_MINUTES;
}

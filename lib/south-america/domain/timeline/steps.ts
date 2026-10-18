// Baby Step 목록과 "다음에 할 일" 찾기 (06 문서 11-4, 05 문서 3장).
import type { PersonId } from '../types';
import type { Minute } from '../time';
import type { StepId, StepInfo, Timeline, TimelineNode } from './types';

/** 단계 정보. 라벨과 이모지는 화면과 문서가 같은 말을 쓰도록 여기 한 곳에 둬요. */
export const STEPS: Record<StepId, StepInfo> = {
  station_arrival: { id: 'station_arrival', scope: 'person', label: '신도림역 도착', emoji: '🚇', required: false, doneLabel: '도착했어요' },
  company_departure: { id: 'company_departure', scope: 'person', label: '회사 출발', emoji: '🚗', required: false, doneLabel: '출발했어요' },
  home_arrival: { id: 'home_arrival', scope: 'person', label: '집 도착', emoji: '🏠', required: false, doneLabel: '도착했어요' },
  change_clothes: { id: 'change_clothes', scope: 'person', label: '환복', emoji: '👕', required: false, doneLabel: '했어요' },
  snack: { id: 'snack', scope: 'person', label: '간식', emoji: '🍌', required: false, doneLabel: '먹었어요' },
  pack_own_bag: { id: 'pack_own_bag', scope: 'person', label: '짐 챙기기', emoji: '🎒', required: false, doneLabel: '챙겼어요' },
  pack_partner_bag: { id: 'pack_partner_bag', scope: 'person', label: '내 짐·상대 짐 챙기기', emoji: '🎒', required: false, doneLabel: '챙겼어요' },
  depart_gym: { id: 'depart_gym', scope: 'person', label: '헬스장 출발', emoji: '🚶', required: false, doneLabel: '출발했어요' },
  meet_at_gym: { id: 'meet_at_gym', scope: 'person', label: '헬스장 도착', emoji: '🏋️', required: false, doneLabel: '도착했어요' },
  depart_together: { id: 'depart_together', scope: 'joint', label: '함께 출발', emoji: '🚶', required: false, doneLabel: '출발했어요' },
  start_together: { id: 'start_together', scope: 'joint', label: '함께 운동 시작', emoji: '❤️', required: true, doneLabel: '함께 운동 시작' },
  workout_end: { id: 'workout_end', scope: 'person', label: '운동 끝', emoji: '💪', required: true, doneLabel: '운동 끝났어요' },
  shower: { id: 'shower', scope: 'person', label: '샤워 끝', emoji: '🚿', required: false, doneLabel: '끝났어요' },
  return_home: { id: 'return_home', scope: 'person', label: '귀가', emoji: '🏠', required: false, doneLabel: '도착했어요' },
  dinner_prep: { id: 'dinner_prep', scope: 'joint', label: '저녁 준비 끝', emoji: '🍳', required: false, doneLabel: '끝났어요' },
  dinner: { id: 'dinner', scope: 'joint', label: '저녁 식사 끝', emoji: '🍽', required: false, doneLabel: '끝났어요' },
};

export const recordKey = (lane: PersonId | 'joint', step: StepId): string => `${lane}.${step}`;

/** 이 사람에게 해당하는 단계 노드들을 논리 순서대로 */
export function stepsFor(tl: Timeline, person: PersonId): TimelineNode[] {
  return tl.nodes
    .filter((n) => n.step !== null && (n.lane === person || n.lane === 'joint') && n.state !== 'blocked')
    .sort((a, b) => a.seq - b.seq);
}

/**
 * 지금 해야 할 다음 단계: 이 사람 몫(또는 함께하는 몫) 중 아직 안 한 가장 앞선 단계.
 * 순서를 강제하지 않아서, 앞 단계를 건너뛰고 뒤 단계를 먼저 눌렀다면 앞 단계가 계속 "다음"으로 남아요 [D-057 정신].
 */
export function nextStepFor(tl: Timeline, person: PersonId): TimelineNode | null {
  return stepsFor(tl, person).find((n) => n.state === 'pending') ?? null;
}

/**
 * 지금 화면에 보여 줄 행동 (일반 단계는 선택이라는 원칙 [사용자 확정]).
 * - record: 직접 기록이 꼭 필요한 다음 행동 (❤️ 함께 운동 시작, 운동 끝). 시간이 지나도 사라지거나 잠기지 않아요.
 * - upcoming: 앞으로 예정된 일반 일정 중 가장 가까운 것 (선택 기록). 예정 시각이 지난 단계는 여기에 오지 않아요.
 * - pastUnconfirmed: 예정 시각이 지났지만 실제로 눌러 기록하지 않은 일반 단계. 완료로 처리하지 않고 "실제 미확인"으로만 보여줘요.
 */
export type NextAction = { record: TimelineNode | null; upcoming: TimelineNode | null; pastUnconfirmed: TimelineNode[] };

export function nextAction(tl: Timeline, person: PersonId): NextAction {
  const pending = stepsFor(tl, person).filter((n) => n.state === 'pending');
  const record = pending.find((n) => n.step!.required) ?? null;
  const optional = pending.filter((n) => !n.step!.required);
  const future = optional.filter((n) => !n.overdue && n.time !== null).sort((a, b) => (a.time as Minute) - (b.time as Minute) || a.seq - b.seq);
  return { record, upcoming: future[0] ?? null, pastUnconfirmed: optional.filter((n) => n.overdue) };
}

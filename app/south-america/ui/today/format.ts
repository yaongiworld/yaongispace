// 오늘 탭 표시용 도우미. 계산은 하지 않고, 이미 계산된 노드를 글로 바꿔요.
import { addDays, fmt, formatClock, weekdayKo, type Minute } from '@/lib/south-america/domain/time';
import type { PersonId } from '@/lib/south-america/domain/types';
import type { ActionError } from '@/lib/south-america/domain/day/day';
import type { Timeline, TimelineNode } from '@/lib/south-america/domain/timeline/types';

/** 노드 시각을 짧게: 완료 "✓18:34", 추정 "~19:40", 직접 입력은 "18:20", 계산 불가는 "입력 필요" */
export function nodeTime(n: TimelineNode | undefined | null): string {
  if (!n) return '';
  if (n.time === null) return '입력 필요';
  if (n.state === 'done') return `✓${fmt(n.time)}`;
  return `${n.approx ? '~' : ''}${fmt(n.time)}`;
}

export const findNode = (tl: Timeline, lane: string, id: string): TimelineNode | undefined =>
  tl.nodes.find((n) => n.lane === lane && n.id === id && !n.carried);

export function minutesText(m: number): string {
  return `${Math.abs(m)}분`;
}

/** 예상과 실제의 차이를 쉬운 말로 */
export function deltaText(expected: Minute | null, actual: Minute): string {
  if (expected === null) return '';
  const d = actual - expected;
  if (d === 0) return '예상대로';
  return `예상보다 ${Math.abs(d)}분 ${d > 0 ? '늦게' : '일찍'}`;
}

export const ERROR_TEXT: Record<ActionError, string> = {
  locked: '❤️ 함께 운동을 시작한 뒤에는 바꿀 수 없어요',
  not_your_step: '내 단계만 누를 수 있어요',
  unknown_step: '지금 계획에 없는 단계예요',
  not_done: '아직 완료하지 않은 단계예요',
  start_correction_not_supported: '시작 정정은 아직 준비 중이에요',
  post_meal_wait: '식사를 마치고 식후 대기 시간이 지난 뒤에 출발할 수 있어요',
  dinner_first_requires_plan_a: '저녁을 먼저 먹는 날은 PLAN A만 쓸 수 있어요',
  invalid_workout_minutes: '운동 시간은 60·75·90분 중에서 골라요',
  invalid_setting: '시간 설정 값이 올바르지 않아요',
  invalid_time: '시각이 올바르지 않아요',
  no_dinner_time: '저녁 시각을 계산할 수 없어요. ETA를 먼저 넣어 주세요',
  no_session: '❤️ 함께 운동 시작 기록이 있는 날만 운동 완료를 기록할 수 있어요',
  completion_before_start: '운동 완료 시각은 ❤️ 시작 이후여야 해요',
  completion_in_future: '운동 완료 시각은 기록을 입력하는 지금보다 미래일 수 없어요',
  invalid_recorded_at: '기록을 입력한 시각이 올바르지 않아요',
  storage_failed: '저장하지 못해서 바꾸지 않았어요. 기존 기록은 그대로예요',
  use_workout_completion: '운동 완료는 오늘 탭의 운동 카드에서 각자 기록해요',
};

/** 5분 단위로 올림한 지금 시각 (처음 입력할 때 시작점) */
export const roundUp5 = (m: Minute): Minute => Math.ceil(m / 5) * 5;

/**
 * 두 사람의 귀가 시각. 둘 다 귀가를 직접 눌러 기록했을 때만 실제(✓)이고, 아니면 예상이에요.
 * (귀가 예상 노드는 계산값이라 한 명만 기록했다면 실제로 보이지 않아요.)
 */
export function homeReturnInfo(tl: Timeline): { text: string; actual: boolean } | null {
  const returns = (['yangcho', 'tawi'] as PersonId[]).map((p) => findNode(tl, p, 'home_return'));
  if (returns.every((n) => n?.state === 'done' && n.time !== null)) {
    return { text: `✓${fmt(Math.max(...returns.map((n) => n!.time as number)))}`, actual: true };
  }
  const t = tl.mealOrder === 'after' ? findNode(tl, 'joint', 'joint_home')?.time ?? null : tl.summary.homeReturn;
  return t === null || t === undefined ? null : { text: `~${fmt(t)}`, actual: false };
}

const PRIMARY_IDS = ['station_arrival', 'company_departure', 'home_arrival', 'gym_ready'];

/**
 * 이 사람의 대표 ETA 노드.
 * - 실제로 눌러 기록한 도착(역 → 집 → 헬스장 중 가장 나중 것)이 있으면 그것이 대표예요.
 *   (앞에 기본값 ETA가 남아 있어도 이미 지나간 일이라 대표로 쓰지 않아요.)
 * - 기록이 없으면 직접 넣었거나 기본값인 가장 앞쪽 입력 ETA예요.
 */
export function primaryEtaNode(nodes: TimelineNode[], p: PersonId): TimelineNode | undefined {
  const mine = nodes.filter((x) => x.lane === p && !x.carried);
  for (const id of [...PRIMARY_IDS].reverse()) {
    const d = mine.find((x) => x.id === id && x.state === 'done' && x.time !== null);
    if (d) return d;
  }
  for (const id of PRIMARY_IDS) {
    const n = mine.find((x) => x.id === id && x.source !== 'computed');
    if (n && n.state !== 'skipped') return n;
  }
  return undefined;
}

/** 대표 ETA보다 나중 단계(환복·간식 등)를 이미 기록했는지: 앞 도착을 안 눌렀어도 이미 지나간 일임을 알려 줘요 */
export function laterRecord(nodes: TimelineNode[], p: PersonId, rep: TimelineNode | undefined): TimelineNode | undefined {
  if (!rep || rep.state === 'done' || rep.time === null) return undefined;
  return nodes
    .filter((x) => x.lane === p && !x.carried && x.state === 'done' && x.step && x.time !== null && (x.time as number) >= (rep.time as number))
    .sort((a, b) => (b.time as number) - (a.time as number))[0];
}


/**
 * 두 사람의 운동 끝 중 늦은 쪽. 둘 다 실제로 기록했을 때만 ✓(실제)이고, 하나라도 예상이면 ~(예상)이에요.
 * (이때 기록한 쪽은 실제 시각, 아직인 쪽은 예상 시각으로 계산해서 늦은 쪽을 골라요.)
 */
export function workoutEndInfo(tl: Timeline): string | null {
  const ends = (['yangcho', 'tawi'] as PersonId[]).map((p) => findNode(tl, p, 'workout_end'));
  if (ends.some((n) => !n || n.time === null)) return null;
  const t = Math.max(...ends.map((n) => n!.time as number));
  return `${ends.every((n) => n!.state === 'done') ? '✓' : '~'}${fmt(t)}`;
}

/** "10/17(금)" */
export function dateLabel(day: string): string {
  const [, m, d] = day.split('-');
  return `${Number(m)}/${Number(d)}(${weekdayKo(day)})`;
}

/**
 * 운동 완료 시각을 글로: 그날 안이면 "20:55", 자정을 넘기면 날짜를 붙여 "10/16(금) 00:10"이에요.
 * withDate가 true면(지난 세션) 항상 날짜를 붙여서 어느 날의 시각인지 분명히 해요.
 */
export function whenText(day: string, minute: Minute, withDate: boolean): string {
  const { hhmm, dayOffset } = formatClock(minute);
  return withDate || dayOffset > 0 ? `${dateLabel(addDays(day, dayOffset))} ${hhmm}` : hhmm;
}

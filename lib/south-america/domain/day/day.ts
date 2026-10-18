// 하루 상태와 동작 (2-3 재계산). 모두 순수 함수예요: 상태를 받아 새 상태를 돌려줘요.
// 저장 방식과 화면은 몰라요. 보상 장부·성장·해금은 이 단계에 없어요 (완료 기록만 남겨요).
import { createTimeSettings, validateTimeSettings, TIMELINE_RULES, type PersonTimeSettings, type TimeSettings } from '../../config/timeSettings';
import { PROTOTYPE_DEFAULT_STATION_ARRIVAL } from '../../config/defaultEta';
import { PEOPLE, type PersonId } from '../types';
import { comparePlans } from '../timeline/compare';
import { computeTimeline } from '../timeline/compute';
import { STEPS, recordKey } from '../timeline/steps';
import { sessionIdOf } from './session';
import type { Minute } from '../time';
import type {
  DayActuals,
  EtaInput,
  EtaReference,
  MealOrder,
  PlanComparison,
  PlanType,
  StepId,
  StepRecord,
  Timeline,
  TimelineInput,
} from '../timeline/types';

export const DAY_STATE_VERSION = 1;

export type DayState = {
  version: typeof DAY_STATE_VERSION;
  /** 어느 날의 일정인지 ("YYYY-MM-DD", 새벽 4시 경계) */
  day: string;
  plan: PlanType;
  /** PLAN B의 집 담당. PLAN A일 때도 기억해 둬요 */
  homePerson: PersonId;
  mealOrder: MealOrder;
  workoutMinutes: number;
  eta: Record<PersonId, EtaInput[]>;
  settings: TimeSettings;
  desiredMealStart: Minute | null;
  actuals: DayActuals;
  /** [지금 기준으로 다시 계산]을 누른 시각 */
  floorAt: Minute | null;
};

export type ActionError =
  | 'locked'
  | 'not_your_step'
  | 'unknown_step'
  | 'not_done'
  | 'start_correction_not_supported'
  | 'post_meal_wait'
  | 'dinner_first_requires_plan_a'
  | 'invalid_workout_minutes'
  | 'invalid_setting'
  | 'invalid_time'
  | 'no_dinner_time'
  | 'no_session'
  | 'completion_before_start'
  | 'completion_in_future'
  | 'invalid_recorded_at'
  | 'use_workout_completion'
  | 'storage_failed';

export type ActionResult = { ok: true; state: DayState; changed: boolean } | { ok: false; reason: ActionError; state: DayState };

const ok = (state: DayState, changed = true): ActionResult => ({ ok: true, state, changed });
const fail = (state: DayState, reason: ActionError): ActionResult => ({ ok: false, reason, state });

/* ───────── 만들기와 계산 ───────── */

export function createDayState(day: string, settings: TimeSettings = createTimeSettings()): DayState {
  const defaultEta = (p: PersonId): EtaInput[] => [{ reference: 'station_arrival', time: PROTOTYPE_DEFAULT_STATION_ARRIVAL[p], source: 'default' }];
  return {
    version: DAY_STATE_VERSION,
    day,
    plan: 'A',
    homePerson: 'yangcho',
    mealOrder: 'after',
    workoutMinutes: TIMELINE_RULES.defaultWorkoutMinutes,
    eta: { yangcho: defaultEta('yangcho'), tawi: defaultEta('tawi') },
    settings,
    desiredMealStart: null,
    actuals: { steps: {} },
    floorAt: null,
  };
}

export function toTimelineInput(state: DayState, now: Minute | null): TimelineInput {
  return {
    plan: state.plan,
    homePerson: state.plan === 'B' ? state.homePerson : undefined,
    mealOrder: state.mealOrder,
    workoutMinutes: state.workoutMinutes,
    eta: state.eta,
    settings: state.settings,
    desiredMealStart: state.desiredMealStart,
    actuals: state.actuals,
    now,
    floorAt: state.floorAt,
  };
}

export type LiveDay = { timeline: Timeline; comparison: PlanComparison; locked: boolean };

/** 하루 상태에서 지금의 타임라인과 플랜 비교를 계산해요. 시각은 상태와 설정에서만 나오고, now는 "지남" 표시에만 써요. */
export function liveDay(state: DayState, now: Minute | null): LiveDay {
  const input = toTimelineInput(state, now);
  const timeline = computeTimeline(input);
  const { plan: _plan, homePerson: _home, ...base } = input;
  void _plan;
  void _home;
  return { timeline, comparison: comparePlans(base), locked: timeline.locked };
}

export const isLocked = (state: DayState): boolean => state.actuals.steps[recordKey('joint', 'start_together')]?.status === 'done';

/* ───────── ETA ───────── */

/** 한 사람이 입력하는 ETA 묶음. 지하철 / 자동차 / 이미 집 중 하나를 골라요. */
export type EtaMode = 'subway' | 'car' | 'home';
const MODE_FIELDS: Record<EtaMode, EtaReference[]> = {
  subway: ['station_arrival'],
  car: ['company_departure', 'home_arrival'],
  home: ['ready_at_home'],
};
const ALL_MODE_FIELDS: EtaReference[] = ['station_arrival', 'company_departure', 'home_arrival', 'ready_at_home'];

/**
 * 한 장소의 ETA만 바꿔요. 다른 장소의 입력은 건드리지 않아요 (헬스장 준비 완료 시각이 집 도착을 덮어쓰지 않게).
 * time이 null이면 그 입력만 지워요. 내가 내 ETA를 넣으면 ✅(본인), 상대가 넣으면 🙋(상대 추정)이에요 [D-032].
 */
export function setEtaField(state: DayState, person: PersonId, reference: EtaReference, time: Minute | null, editor: PersonId): DayState {
  const others = state.eta[person].filter((e) => e.reference !== reference);
  const next = time === null ? others : [...others, { reference, time, source: editor === person ? ('self' as const) : ('partner' as const) }];
  return { ...state, eta: { ...state.eta, [person]: next } };
}

/** 이동 수단을 바꿔 저장해요. 고른 수단에 속하지 않는 "집 도착 계열" 입력은 지우고, 헬스장 운동 가능(gym_ready)은 그대로 둬요. */
export function setEtaMode(state: DayState, person: PersonId, mode: EtaMode, values: Partial<Record<EtaReference, Minute | null>>, editor: PersonId): DayState {
  let next = state;
  const mine = MODE_FIELDS[mode];
  for (const ref of ALL_MODE_FIELDS) {
    if (!mine.includes(ref)) next = setEtaField(next, person, ref, null, editor);
  }
  for (const ref of mine) {
    if (ref in values) next = setEtaField(next, person, ref, values[ref] ?? null, editor);
  }
  if ('gym_ready' in values) next = setEtaField(next, person, 'gym_ready', values.gym_ready ?? null, editor);
  return next;
}

/** [맞아]: 기본값(📌)이나 상대 추정(🙋)을 본인이 확인하면 ✅(본인 입력)로 바뀌어요. 시각은 그대로예요. */
export function confirmEta(state: DayState, person: PersonId, reference: EtaReference, by: PersonId): DayState {
  if (by !== person) return state;
  return {
    ...state,
    eta: { ...state.eta, [person]: state.eta[person].map((e) => (e.reference === reference && e.source !== 'self' && e.source !== 'phone' ? { ...e, source: 'self' as const } : e)) },
  };
}

/* ───────── 계획 ───────── */

export function setPlan(state: DayState, plan: PlanType, homePerson?: PersonId): ActionResult {
  if (isLocked(state)) return fail(state, 'locked');
  if (plan === 'B' && state.mealOrder === 'before') return fail(state, 'dinner_first_requires_plan_a');
  return ok({ ...state, plan, homePerson: homePerson ?? state.homePerson });
}

/** 저녁 먼저를 고르면 PLAN B는 쓸 수 없어서 PLAN A로 돌아가요 [P-146]. */
export function setMealOrder(state: DayState, mealOrder: MealOrder): ActionResult {
  if (isLocked(state)) return fail(state, 'locked');
  return ok({ ...state, mealOrder, plan: mealOrder === 'before' ? 'A' : state.plan });
}

export function setWorkoutMinutes(state: DayState, minutes: number): ActionResult {
  if (isLocked(state)) return fail(state, 'locked'); // ❤️ 이후 변경은 미정이라 막아요 [O-138]
  if (!TIMELINE_RULES.workoutOptions.includes(minutes)) return fail(state, 'invalid_workout_minutes');
  return ok({ ...state, workoutMinutes: minutes });
}

/** 희망 저녁 시작 시각 입력·수정·삭제. 목표일 뿐이라 시작 이후에도 바꿀 수 있어요 [D-159]. */
export function setDesiredMealStart(state: DayState, minute: Minute | null): ActionResult {
  if (minute !== null && !Number.isFinite(minute)) return fail(state, 'invalid_time');
  return ok({ ...state, desiredMealStart: minute });
}

/**
 * [가장 빠르게 먹기]: 희망 저녁 시각을 지금 계산된 가장 빠른 저녁 시작 시각으로 맞춰요.
 * 희망은 목표일 뿐이라 일정(완료 시각, 운동 시작 등)은 하나도 바뀌지 않아요 [D-159].
 */
export function eatEarliest(state: DayState, now: Minute | null): ActionResult {
  const mealStart = liveDay(state, now).timeline.summary.mealStart;
  if (mealStart === null) return fail(state, 'no_dinner_time');
  return ok({ ...state, desiredMealStart: mealStart });
}

/* ───────── 단계 완료·건너뛰기·취소 ───────── */

const dayKey = (state: DayState) => state.day;

/** 보상 장부에 쓸 중복 방지 키 (장부는 아직 없어요). 사람+날짜+행동 종류당 1개 [D-087] */
export function rewardKeyFor(state: DayState, lane: PersonId | 'joint', step: StepId): string | null {
  if (step === 'start_together') return null; // 운동 이벤트는 Baby Step 보상이 아니에요 [P-084]
  // 운동 완료는 사람+세션당 하나의 안정적인 키예요 (지급 규칙은 아직 없어요. 나중에 연결할 식별자만 준비) [D-168]
  if (step === 'workout_end') return lane === 'joint' ? null : `workout:${lane}:${sessionIdOf(dayKey(state))}`;
  return lane === 'joint' ? `joint:${dayKey(state)}:${step}` : `baby:${lane}:${dayKey(state)}:${step}`;
}

function findNode(state: DayState, lane: PersonId | 'joint', step: StepId, now: Minute | null) {
  const { timeline } = liveDay(state, now);
  return timeline.nodes.find((n) => n.lane === lane && n.step?.id === step && !n.carried);
}

/**
 * 단계를 완료해요. 그 시각(time)이 "실제 시각"으로 고정되고, ETA나 계획이 바뀌어도 바뀌지 않아요.
 * 같은 단계를 또 눌러도 한 번만 기록돼요 (중복 방지). 각자 단계는 본인만 눌러요 [O-081 잠정안].
 */
export function completeStep(state: DayState, lane: PersonId | 'joint', step: StepId, time: Minute, by: PersonId): ActionResult {
  if (!Number.isFinite(time)) return fail(state, 'invalid_time');
  const info = STEPS[step];
  if (!info) return fail(state, 'unknown_step');
  // 운동 완료는 사람별로 따로 기록해요 (대신 기록 포함). 이 일반 경로로는 기록하지 않아요 [D-167, D-168]
  if (step === 'workout_end') return fail(state, 'use_workout_completion');
  if (info.scope === 'person' && lane !== by) return fail(state, 'not_your_step');
  if (info.scope === 'joint' && lane !== 'joint') return fail(state, 'unknown_step');
  const k = recordKey(lane, step);
  const existing = state.actuals.steps[k];
  if (existing?.status === 'done') return ok(state, false);
  // 저녁 먼저 날: 식사를 마친 뒤 식후 대기 시간이 지나야 출발할 수 있어요 [D-157]
  if (step === 'depart_together' && state.mealOrder === 'before') {
    const wait = liveDay(state, time).timeline.nodes.find((n) => n.lane === 'joint' && n.id === 'post_meal_wait_end');
    if (wait?.time != null && time < wait.time) return fail(state, 'post_meal_wait');
  }
  const node = findNode(state, lane, step, time);
  if (!node) return fail(state, 'unknown_step');
  const record: StepRecord = {
    status: 'done',
    time,
    expectedAtDone: node.time,
    by,
    label: node.label,
    rewardKey: rewardKeyFor(state, lane, step),
  };
  return ok({ ...state, actuals: { steps: { ...state.actuals.steps, [k]: record } } });
}

/** ❤️ 함께 운동 시작: 한 명이 누르면 둘 다 함께 운동한 것으로 기록돼요. 이후 PLAN은 바꿀 수 없어요 [D-051, D-041]. */
export const pressHeart = (state: DayState, time: Minute, by: PersonId): ActionResult => completeStep(state, 'joint', 'start_together', time, by);

export function skipStep(state: DayState, lane: PersonId | 'joint', step: StepId, by: PersonId, now: Minute | null): ActionResult {
  const info = STEPS[step];
  if (!info) return fail(state, 'unknown_step');
  if (step === 'start_together') return fail(state, 'unknown_step'); // 함께 시작은 건너뛰지 않아요
  if (step === 'workout_end') return fail(state, 'use_workout_completion'); // 운동 완료는 건너뛰기가 없어요
  if (info.scope === 'person' && lane !== by) return fail(state, 'not_your_step');
  const k = recordKey(lane, step);
  if (state.actuals.steps[k]) return ok(state, false);
  const node = findNode(state, lane, step, now);
  if (!node) return fail(state, 'unknown_step');
  const record: StepRecord = { status: 'skipped', time: null, expectedAtDone: node.time, by, label: node.label, rewardKey: null };
  return ok({ ...state, actuals: { steps: { ...state.actuals.steps, [k]: record } } });
}

/** 실수 완료를 되돌려요 (↩️). 기록이 사라지고 그 단계는 다시 예정이 돼요. ❤️ 정정은 아직 정책이 없어 막아요. */
export function undoStep(state: DayState, lane: PersonId | 'joint', step: StepId): ActionResult {
  const k = recordKey(lane, step);
  if (step === 'workout_end') return fail(state, 'use_workout_completion'); // 운동 완료 취소는 이력을 남기는 전용 경로로만
  if (!state.actuals.steps[k]) return fail(state, 'not_done');
  if (step === 'start_together') return fail(state, 'start_correction_not_supported');
  const { [k]: _removed, ...rest } = state.actuals.steps;
  void _removed;
  return ok({ ...state, actuals: { steps: rest } });
}

/** [지금 기준으로 다시 계산]: 아직 안 한 단계가 지금 시각보다 앞서 있지 않게 해요. 완료한 시각은 그대로예요 [P-147]. */
export function recalcFromNow(state: DayState, now: Minute): DayState {
  return { ...state, floorAt: state.floorAt === null ? now : Math.max(state.floorAt, now) };
}

/* ───────── 시간 설정 ───────── */

export function setPersonSetting(state: DayState, person: PersonId, key: keyof PersonTimeSettings, value: number | null): ActionResult {
  const next: TimeSettings = { ...state.settings, [person]: { ...state.settings[person], [key]: value } };
  if (validateTimeSettings(next).length > 0) return fail(state, 'invalid_setting');
  return ok({ ...state, settings: next });
}

export const resetSettings = (state: DayState): DayState => ({ ...state, settings: createTimeSettings() });

/* ───────── 저장된 값 되살리기 ───────── */

/** 저장돼 있던 값이 올바른지 확인해서 하루 상태로 되살려요. 날짜가 다르면(새 하루) 설정만 이어받아 새로 시작해요. */
export function reviveDayState(raw: unknown, today: string): DayState {
  const fresh = createDayState(today);
  if (typeof raw !== 'object' || raw === null) return fresh;
  const r = raw as Partial<DayState>;
  if (r.version !== DAY_STATE_VERSION || !r.settings || validateTimeSettings(r.settings).length > 0) return fresh;
  if (r.day !== today) return createDayState(today, r.settings); // 새 하루: 설정은 유지, ETA·완료 기록은 새로
  const valid = (e: unknown): e is Record<PersonId, EtaInput[]> =>
    typeof e === 'object' && e !== null && Array.isArray((e as Record<string, unknown>).yangcho) && Array.isArray((e as Record<string, unknown>).tawi);
  if (!valid(r.eta) || typeof r.actuals !== 'object' || r.actuals === null || typeof r.actuals.steps !== 'object') return createDayState(today, r.settings);
  if (r.plan !== 'A' && r.plan !== 'B') return createDayState(today, r.settings);
  return { ...fresh, ...(r as DayState) };
}

export const personName = (p: PersonId) => PEOPLE[p].name;

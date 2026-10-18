// 자동 타임라인의 입력과 출력 모양 (06 문서 11장).
import type { EtaSource, PersonId } from '../types';
import type { TimeSettings } from '../../config/timeSettings';
import type { Minute } from '../time';

/** 사람이 넣은 시각의 출처. 계산 결과(computed)는 입력이 아니에요. */
export type InputSource = Exclude<EtaSource, 'computed'>;

export type PlanType = 'A' | 'B';
export type MealOrder = 'after' | 'before';

export type EtaReference =
  | 'station_arrival' // 지하철: 신도림역 도착
  | 'company_departure' // 자동차: 회사 출발
  | 'home_arrival' // 집 도착 예상 (직접 입력)
  | 'gym_ready' // 헬스장에서 운동 가능한 예상 시각 (직접 입력)
  | 'ready_at_home'; // 이미 집: 준비를 시작할 수 있는 시각

export type EtaInput = { reference: EtaReference; time: Minute; source: InputSource };

export type TimelineInput = {
  plan: PlanType;
  /** PLAN B의 집 담당(= 짐 담당). PLAN B에서 필요해요 [D-152] */
  homePerson?: PersonId;
  /** 기본은 운동 후 저녁 [D-156] */
  mealOrder: MealOrder;
  workoutMinutes: number;
  eta: Record<PersonId, EtaInput[]>;
  settings: TimeSettings;
  /** 희망 저녁 시작 시각 (선택). 목표일 뿐 노드를 바꾸지 않아요 [D-159] */
  desiredMealStart?: Minute | null;
  /** 완료·건너뜀 기록 (2-3). 완료한 행동의 실제 시각은 재계산해도 바뀌지 않아요 [D-037, D-085] */
  actuals?: DayActuals;
  /** 현재 시각. "지남" 표시에만 쓰고 계산 시각은 바꾸지 않아요 [P-147] */
  now?: Minute | null;
  /** [지금 기준으로 다시 계산]을 누른 시각. 아직 안 한 단계는 이 시각보다 앞설 수 없어요 [P-147] */
  floorAt?: Minute | null;
};

/* ───────── 실제 기록 (2-3) ───────── */

/** Baby Step 종류 (05 문서 3장 행동 종류). 운동 시작·끝은 함께하는 확인 지점이에요. */
export type StepId =
  | 'station_arrival'
  | 'company_departure'
  | 'home_arrival'
  | 'change_clothes'
  | 'snack'
  | 'pack_own_bag'
  | 'pack_partner_bag'
  | 'depart_gym'
  | 'meet_at_gym'
  | 'depart_together'
  | 'start_together'
  | 'workout_end'
  | 'shower'
  | 'return_home'
  | 'dinner_prep'
  | 'dinner';

export type StepInfo = {
  id: StepId;
  /** person: 각자 누르는 단계 / joint: 한 명이 눌러도 둘 다에 해당 (❤️처럼) */
  scope: 'person' | 'joint';
  label: string;
  emoji: string;
  /**
   * 직접 기록이 꼭 필요한 단계 (❤️ 함께 운동 시작, 운동 끝). 나머지 일정 단계는 자동으로 예상을 보여주고,
   * 눌러서 기록하는 것은 선택이에요. 누르지 않은 단계는 실제 완료로 처리하지 않아요.
   */
  required: boolean;
  /** 선택 기록 버튼에 쓰는 말 (예: "도착했어요") */
  doneLabel: string;
};

/** 운동 완료 기록의 수정·취소 이력 한 줄. 이력은 줄을 더하기만 하고 고치거나 지우지 않아요 [D-171, D-134 정신] */
export type Revision = {
  /** 이 일을 한 실제 순간 (ISO) */
  at: string;
  /** 이 일을 한 사람 */
  by: PersonId;
  kind: 'recorded' | 'time_edited' | 'undone' | 'restored';
  /** 이 이력 직후의 실제 완료 시각 (그 세션의 날짜 00:00부터 지난 분). 취소면 null */
  actualAt: Minute | null;
  /** 시각을 고쳤다면 고치기 전 실제 완료 시각 */
  prevActualAt?: Minute | null;
};

export type StepRecord = {
  /** undone은 운동 완료를 취소한 상태예요(기록은 지우지 않고 이력과 함께 남겨요). 계산에서는 아직 안 한 것으로 봐요 */
  status: 'done' | 'skipped' | 'undone';
  /** 실제 완료 시각 (done). 이후 ETA가 바뀌어도 그대로예요. 운동 완료에서는 actual_completed_at이에요 */
  time: Minute | null;
  /** 완료를 누른 순간 계산이 말하던 예상 시각 */
  expectedAtDone: Minute | null;
  /** 누른(기록을 입력한) 사람. 운동 완료에서는 completed_by예요 */
  by: PersonId;
  label: string;
  /** 보상 장부에 쓸 중복 방지 키 (장부는 아직 없어요). 정정 전까지 바뀌지 않아요 */
  rewardKey: string | null;
  /* ── 운동 완료에만 쓰는 항목 (옛 기록에는 없을 수 있어서 모두 선택값) ── */
  /** 실제로 운동한 사람 (기록 줄의 사람과 같아요) */
  person?: PersonId;
  /** 운동 세션 ID (예: "ws:2026-10-13"). 기록을 나중에 입력해도 바뀌지 않아요 */
  sessionId?: string;
  /** 기록을 입력한 실제 순간 (ISO). 실제 완료 시각(time)과 별개예요 [D-171] */
  recordedAt?: string;
  /** 수정·취소 이력 (오래된 것부터) */
  revisions?: Revision[];
};

export type DayActuals = {
  /** 키: "줄.단계", 예: "yangcho.home_arrival", "joint.start_together" */
  steps: Record<string, StepRecord>;
};

export type NodeLane = PersonId | 'joint';

export type NodeSource =
  | 'actual'
  | 'input_self'
  | 'input_phone'
  | 'input_partner'
  | 'default'
  | 'computed';

export type NodeMark = '✅' | '📞' | '🙋' | '📌' | '🧮';

export type TimelineNode = {
  /** 예: "tawi.home_arrival" (줄 + 이름) */
  key: string;
  id: string;
  lane: NodeLane;
  label: string;
  /** 그날 00:00부터 지난 분. 계산할 수 없으면 null */
  time: Minute | null;
  /** "19:40" 같은 표기와 하루 넘김 (자정 이후면 1) */
  clock: string | null;
  dayOffset: number | null;
  /** pending 예정 / done 실제로 완료 / skipped 건너뜀 / blocked 계산 불가 */
  state: 'pending' | 'done' | 'skipped' | 'blocked';
  /** 눌러서 기록하는 단계라면 그 정보. 계산만 하는 노드는 null */
  step: StepInfo | null;
  /** 논리 순서 (만든 순서). 같은 시각일 때와 "다음 단계"를 정할 때 써요 */
  seq: number;
  /** 지금 기준으로 이 시각이 이미 지났는데 아직 안 한 단계 (표시만, 시각은 안 바꿈) */
  overdue: boolean;
  /** 예상 시각 (완료했다면 완료 직전 계산이 말한 시각). 계산 불가면 null */
  expected: Minute | null;
  /** 실제 완료 시각 (done일 때) */
  actual: Minute | null;
  /** 이전 계획에서 완료했지만 지금 계획에는 없는 단계 (기록은 그대로 유지) */
  carried: boolean;
  source: NodeSource;
  /** 사람이 직접 넣었거나 통화로 확인한 시각만 true. 계산·기본값·상대 추정은 false [D-032, P-148] */
  confirmed: boolean;
  /** 화면에서 `~`를 붙일 시각 (계산 또는 상대 추정) */
  approx: boolean;
  mark: NodeMark;
  /** 계산 결과가 의존하는 입력 중 가장 약한 출처. 입력 자체의 노드는 자기 출처 */
  weakestInput: InputSource | null;
  /** 상대 추정(🙋)이나 기본값(📌)에 의존하는 계산 결과인지 */
  dependsOnUnconfirmed: boolean;
  dependsOn: string[];
  /** 어떻게 계산했는지 쉬운 말로 */
  explain: string;
  /** 먼저 준비된 사람이 기다리는 분 (해당 노드에서만) */
  waitMinutes?: number;
};

export type BlockerCode =
  | 'invalid_settings'
  | 'invalid_workout_minutes'
  | 'home_person_required'
  | 'dinner_first_requires_plan_a'
  | 'eta_missing'
  | 'car_travel_time_unset'
  | 'direct_gym_ready_needed';

export type Blocker = {
  code: BlockerCode;
  person?: PersonId;
  message: string;
  /** 이 입력 중 하나를 넣으면 계산할 수 있어요 */
  needs?: EtaReference[];
  /** 설정에서 값을 넣으면 계산할 수 있는 항목 */
  setting?: string;
};

export type Notice = {
  code: 'dinner_late' | 'past_bed_target';
  person?: PersonId;
  message: string;
};

export type InputBasis = {
  reference: EtaReference;
  /** 사람이 넣은 시각 */
  time: Minute;
  source: InputSource;
  /** 계산으로 이어 붙였는지 (예: 역 도착 + 이동시간) */
  derived: boolean;
  /** 이 입력에서 나온 집 도착(또는 헬스장 운동 가능) 시각 */
  resolved: Minute;
};

export type Limit = {
  person: PersonId;
  reference: EtaReference;
  /** 희망을 맞추려면 늦어도 이 시각까지 */
  latest: Minute;
  /** 지금 입력된 시각. 없으면 null */
  actual: Minute | null;
  /** latest − actual. 양수는 여유, 음수는 늦음 */
  slack: number | null;
};

export type DesiredEvaluation = {
  desired: Minute;
  /** 순방향 계산의 저녁 식사 시작 */
  expected: Minute | null;
  /** expected − desired. 양수면 늦고, 음수면 이름 */
  diff: number | null;
  status: 'late' | 'ok' | 'unknown';
  /** status가 ok일 때 여유(분) */
  slack: number | null;
  /** status가 late일 때 늦어지는 분 */
  lateBy: number | null;
  /** 운동 후 저녁: 늦어도 이 시각에는 공동 시작해야 맞춰요 */
  latestStart?: Minute;
  latestDepart?: Minute;
  /** 저녁 먼저: 두 사람 모두 늦어도 이 시각까지 집 도착 */
  latestHomeBoth?: Minute;
  /** 저녁 먼저: 희망대로 먹을 때 공동 시작은 빨라야 이 시각 */
  earliestStart?: Minute;
  limits: Limit[];
  /** limits 중 늦은(slack < 0) 것 */
  bottlenecks: Limit[];
};

export type TimelineSummary = {
  jointStart: Minute | null;
  workoutEnd: Minute | null;
  homeReturn: Minute | null;
  mealStart: Minute | null;
  mealEnd: Minute | null;
};

export type Timeline = {
  plan: PlanType;
  homePerson: PersonId | null;
  mealOrder: MealOrder;
  workoutMinutes: number;
  status: 'ok' | 'blocked';
  /** ❤️ 함께 운동 시작을 누른 뒤에는 PLAN·저녁 순서·운동 시간을 바꿀 수 없어요 [D-041] */
  locked: boolean;
  /** 지금 기준으로 지난 미완료 단계 수 */
  overdueCount: number;
  nodes: TimelineNode[];
  blockers: Blocker[];
  notices: Notice[];
  summary: TimelineSummary;
  inputsUsed: {
    home: Partial<Record<PersonId, InputBasis>>;
    directGym?: { person: PersonId } & InputBasis;
  };
  desired?: DesiredEvaluation;
};

export type PlanCandidateId = 'A' | 'B_yangcho' | 'B_tawi';

export type PlanCandidate = {
  id: PlanCandidateId;
  plan: PlanType;
  homePerson: PersonId | null;
  label: string;
  timeline: Timeline;
  available: boolean;
  jointStart: Minute | null;
};

export type PlanComparison = {
  candidates: PlanCandidate[];
  /** 추천 후보. 차이가 작거나 비교할 후보가 하나뿐이면 null */
  recommended: PlanCandidateId | null;
  /** 가장 이른 후보와 그다음 후보의 차이(분). 후보가 하나뿐이면 null */
  gapMinutes: number | null;
  note: 'recommended' | 'no_big_difference' | 'single_candidate' | 'none_available';
  /** PLAN B를 고를 때 집 담당 기본 제안 [P-143] */
  suggestedHomePerson: PersonId | null;
};

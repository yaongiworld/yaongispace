// 개인별 운동 완료와 공동 세션 완료 [D-167, D-168, D-170, D-171].
//
// 규칙
// - ❤️ 공동 시작은 하나, 운동 완료는 두 사람이 각자 따로 기록해요 (`yangcho.workout_end`, `tawi.workout_end`).
// - 한 명만 완료하면 공동 세션은 진행 중이고, 두 사람이 모두 실제 완료했을 때만 공동 세션이 완료돼요.
//   공동 완료 시각(= 모닥불 점화 시각)은 두 실제 완료 시각 중 늦은 쪽이에요. 샤워·귀가는 조건이 아니에요.
// - 상대 대신 기록할 수 있어요. 실제로 운동한 사람(person)과 기록한 사람(by)을 구분해요.
// - 실제 완료 시각(time)과 기록 입력 시각(recordedAt)은 별개예요. 늦게 입력해도 세션은 바뀌지 않아요(새 세션을 만들지 않아요).
// - 실제 완료 시각은 ❤️ 시작 이후여야 하고, 기록을 입력한 순간보다 미래일 수 없어요. "분"만이 아니라 실제 날짜를 포함해서 비교해요.
// - 시각을 고쳐도, 취소했다가 복구해도 같은 기록(같은 사람·세션의 같은 보상 키)이고 이력은 줄을 더하기만 해요.
// - 시간이 지났다는 이유로 완료를 자동 확정하지 않아요. 기록이 없으면 "예상 종료"일 뿐이에요.
// - 옛 `joint.workout_end`(한 명이 눌러 둘 다 끝난 것으로 처리하던 기록)는 읽지 않아요. 원본은 그대로 남아 있어요.
import { instantOfPlanMinute, planDayOf, planMinuteOfInstant, type Minute } from '../time';
import type { PersonId } from '../types';
import { recordKey } from '../timeline/steps';
import type { Revision, StepRecord } from '../timeline/types';
import type { ActionError, ActionResult, DayState } from './day';
import { legacyJointEnd, sessionIdOf, sessionOf, type SessionInfo } from './session';

const PERSONS: readonly PersonId[] = ['yangcho', 'tawi'];

export const workoutKey = (person: PersonId): string => recordKey(person, 'workout_end');
const ok = (state: DayState, changed = true): ActionResult => ({ ok: true, state, changed });
const fail = (state: DayState, reason: ActionError): ActionResult => ({ ok: false, reason, state });

/* ───────── 읽기: 개인 완료와 공동 완료 ───────── */

export type WorkoutCompletion = {
  /** 실제로 운동한 사람 */
  person: PersonId;
  sessionId: string;
  /** 실제 완료 시각 (그 세션 날짜 00:00부터 지난 분, 자정을 넘기면 1440 이상) */
  actualCompletedAt: Minute;
  /** 실제 완료 시각의 실제 순간 (ISO) */
  actualCompletedInstant: string;
  /** 기록을 입력한 사람 */
  completedBy: PersonId;
  /** 기록을 입력한 실제 순간 (ISO). 아주 옛 기록에는 없을 수 있어요 */
  recordedAt: string | null;
  /** 기록을 입력한 날짜(계획 하루). 운동한 날(session day)과 다를 수 있어요 */
  recordedDay: string | null;
  /** 다른 사람이 대신 기록했는지 */
  proxy: boolean;
  /** 향후 보상 연결용 안정 식별자 (사람+세션). 지급 규칙은 아직 없어요 */
  rewardKey: string;
  revisions: Revision[];
};

export type WorkoutSessionStatus = 'none' | 'in_progress' | 'complete';

export type WorkoutSessionView = {
  session: SessionInfo | null;
  /** 지금 유효한(취소되지 않은) 개인 완료 */
  completions: Record<PersonId, WorkoutCompletion | null>;
  status: WorkoutSessionStatus;
  /** 공동 세션 완료 시각 = 두 실제 완료 시각 중 늦은 쪽. 완료 전에는 null */
  completedAt: Minute | null;
  completedAtInstant: string | null;
  /** 모닥불 점화 시각 (공동 완료 시각과 같아요) */
  bonfireAt: Minute | null;
};

function toCompletion(state: DayState, person: PersonId, r: StepRecord | undefined): WorkoutCompletion | null {
  if (!r || r.status !== 'done' || typeof r.time !== 'number') return null;
  const recordedAt = typeof r.recordedAt === 'string' ? r.recordedAt : null;
  return {
    person,
    sessionId: r.sessionId ?? sessionIdOf(state.day),
    actualCompletedAt: r.time,
    actualCompletedInstant: instantOfPlanMinute(state.day, r.time).toISOString(),
    completedBy: r.by,
    recordedAt,
    recordedDay: recordedAt ? safeDay(recordedAt) : null,
    proxy: r.by !== person,
    rewardKey: r.rewardKey ?? `workout:${person}:${sessionIdOf(state.day)}`,
    revisions: Array.isArray(r.revisions) ? r.revisions : [],
  };
}

function safeDay(iso: string): string | null {
  try {
    return planDayOf(iso);
  } catch {
    return null;
  }
}

/** 개인별 유효 완료 기록에서 공동 세션 상태·완료 시각·모닥불 시각을 계산해요 (저장하지 않고 항상 계산) */
export function workoutSession(state: DayState): WorkoutSessionView {
  const session = sessionOf(state);
  const completions = {
    yangcho: toCompletion(state, 'yangcho', state.actuals.steps[workoutKey('yangcho')]),
    tawi: toCompletion(state, 'tawi', state.actuals.steps[workoutKey('tawi')]),
  };
  if (!session) return { session: null, completions, status: 'none', completedAt: null, completedAtInstant: null, bonfireAt: null };
  const both = completions.yangcho && completions.tawi;
  if (!both) return { session, completions, status: 'in_progress', completedAt: null, completedAtInstant: null, bonfireAt: null };
  const completedAt = Math.max(completions.yangcho!.actualCompletedAt, completions.tawi!.actualCompletedAt);
  return { session, completions, status: 'complete', completedAt, completedAtInstant: instantOfPlanMinute(state.day, completedAt).toISOString(), bonfireAt: completedAt };
}

/* ───────── 쓰기 ───────── */

export type WorkoutInput = {
  /** 기록을 입력하는 사람 */
  by: PersonId;
  /** 기록을 입력하는 실제 순간 (ISO) */
  recordedAt: string;
};

/**
 * 실제 완료 시각이 올바른지 확인해요: ❤️ 시작 이후, 기록을 입력한 순간보다 미래가 아님.
 * 분만 비교하지 않고 세션 날짜를 포함한 실제 순간으로 비교해요 (하루 경계·자정 이후 포함).
 */
function checkActual(state: DayState, session: SessionInfo, actualAt: Minute, recordedAt: string): ActionError | null {
  if (typeof actualAt !== 'number' || !Number.isFinite(actualAt)) return 'invalid_time';
  const recorded = new Date(recordedAt);
  if (typeof recordedAt !== 'string' || Number.isNaN(recorded.getTime())) return 'invalid_recorded_at';
  if (actualAt < session.startedAt) return 'completion_before_start';
  if (instantOfPlanMinute(state.day, actualAt).getTime() > recorded.getTime()) return 'completion_in_future';
  return null;
}

/** 화면이 미리 확인할 때 쓰는 같은 규칙 (기록·수정 동작이 쓰는 검사와 똑같아요). 문제가 없으면 null */
export function checkWorkoutTime(state: DayState, actualAt: Minute, recordedAt: string): ActionError | null {
  const session = sessionOf(state);
  if (!session) return 'no_session';
  return checkActual(state, session, actualAt, recordedAt);
}

export type WorkoutTimeBounds = {
  /** 가장 이른 실제 완료 시각 = ❤️ 시작 시각 */
  min: Minute;
  /** 가장 늦은 실제 완료 시각 = 기록을 입력하는 순간 (그 세션 날짜 기준 분). min보다 작으면 고를 수 있는 시각이 없어요 */
  max: Minute;
};

/** 실제 완료 시각으로 고를 수 있는 범위. 세션이 없거나 입력 순간이 올바르지 않으면 null */
export function workoutTimeBounds(state: DayState, recordedAt: string): WorkoutTimeBounds | null {
  const session = sessionOf(state);
  if (!session) return null;
  try {
    return { min: session.startedAt, max: planMinuteOfInstant(state.day, recordedAt) };
  } catch {
    return null;
  }
}

/**
 * 사람이 직접 넣은 "시·분"을 그 세션의 실제 시각(분)으로 바꿔요: ❤️ 시작 시각 이후에 처음 오는 그 시각이에요.
 * 예: 19:40 시작 세션에서 "01:10"은 다음 날 01:10이에요. "시:분" 글자를 비교하지 않고 날짜를 포함해서 정해요.
 * 시(0~23)·분(0~59)이 올바르지 않으면 null이에요.
 */
export function resolveClockForSession(startedAt: Minute, hours: number, minutes: number): Minute | null {
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  let m = hours * 60 + minutes;
  while (m < startedAt) m += 1440;
  return m;
}

/** 취소된 개인 완료가 있으면 취소 전 실제 완료 시각과 취소한 사람·순간을 알려 줘요 (다시 기록할 때 참고용) */
export function cancelledWorkout(state: DayState, person: PersonId): { actualAt: Minute; cancelledBy: PersonId; cancelledAt: string } | null {
  const r = state.actuals.steps[workoutKey(person)];
  if (!r || r.status !== 'undone' || typeof r.time !== 'number') return null;
  const last = Array.isArray(r.revisions) ? [...(r.revisions as Revision[])].reverse().find((x) => x.kind === 'undone') : undefined;
  return { actualAt: r.time, cancelledBy: last?.by ?? r.by, cancelledAt: last?.at ?? '' };
}

export type PendingWorkoutSession = {
  day: string;
  sessionId: string;
  startedAt: Minute;
  /** 아직 개인 완료가 기록되지 않은 사람 */
  missing: PersonId[];
  /** 옛 공동 종료 기록이 있는 날인지 (그 기록은 개인 완료가 아니라서 여전히 미기록으로 봐요) */
  legacy: boolean;
};

/**
 * 오늘이 아닌 날 중, ❤️ 공동 시작이 있었는데 개인 운동 완료가 아직 없는 사람이 있는 세션들 (최근 날짜부터).
 * 미기록을 완료로 보지 않아요. 입력 기한(O-134)은 정해지지 않아서 날짜가 오래돼도 빼지 않아요.
 */
export function pendingWorkoutSessions(days: { day: string; state: DayState }[], currentDay: string): PendingWorkoutSession[] {
  const out: PendingWorkoutSession[] = [];
  for (const d of days) {
    if (d.day === currentDay) continue;
    const session = sessionOf(d.state);
    if (!session) continue;
    const w = workoutSession(d.state);
    const missing = PERSONS.filter((p) => !w.completions[p]);
    if (missing.length === 0) continue;
    out.push({ day: d.day, sessionId: session.id, startedAt: session.startedAt, missing, legacy: legacyJointEnd(d.state) !== null });
  }
  return out.sort((a, b) => (a.day < b.day ? 1 : -1));
}

const nextRevisions = (r: StepRecord | undefined, add: Revision): Revision[] => [...(Array.isArray(r?.revisions) ? (r!.revisions as Revision[]) : []), add];

/**
 * 운동 완료를 기록해요 (실제로 운동한 사람 person, 기록하는 사람 by).
 * - 같은 세션·같은 사람의 완료가 이미 있으면 아무것도 바꾸지 않아요 (중복 완료 없음. 시각을 바꾸려면 editWorkoutTime).
 * - 취소했던 기록이면 같은 기록을 복구해요 (같은 보상 키, 이력에 "복구" 추가).
 */
export function completeWorkout(state: DayState, person: PersonId, actualAt: Minute, input: WorkoutInput): ActionResult {
  if (!PERSONS.includes(person)) return fail(state, 'unknown_step');
  const session = sessionOf(state);
  if (!session) return fail(state, 'no_session');
  const bad = checkActual(state, session, actualAt, input.recordedAt);
  if (bad) return fail(state, bad);
  const k = workoutKey(person);
  const existing = state.actuals.steps[k];
  if (existing?.status === 'done') return ok(state, false);
  const key = existing?.rewardKey ?? `workout:${person}:${session.id}`;
  const record: StepRecord = existing
    ? {
        ...existing,
        status: 'done',
        time: actualAt,
        by: input.by,
        recordedAt: input.recordedAt,
        rewardKey: key,
        person,
        sessionId: session.id,
        revisions: nextRevisions(existing, { at: input.recordedAt, by: input.by, kind: 'restored', actualAt }),
      }
    : {
        status: 'done',
        time: actualAt,
        expectedAtDone: session.startedAt + state.workoutMinutes,
        by: input.by,
        label: '운동 끝',
        rewardKey: key,
        person,
        sessionId: session.id,
        recordedAt: input.recordedAt,
        revisions: [{ at: input.recordedAt, by: input.by, kind: 'recorded', actualAt }],
      };
  return ok({ ...state, actuals: { steps: { ...state.actuals.steps, [k]: record } } });
}

/** 실제 완료 시각을 고쳐요. 개인 완료·공동 완료·모닥불 시각은 계산이라 저절로 다시 계산돼요. 원래 값은 이력에 남아요. */
export function editWorkoutTime(state: DayState, person: PersonId, actualAt: Minute, input: WorkoutInput): ActionResult {
  const session = sessionOf(state);
  if (!session) return fail(state, 'no_session');
  const k = workoutKey(person);
  const existing = state.actuals.steps[k];
  if (!existing || existing.status !== 'done' || typeof existing.time !== 'number') return fail(state, 'not_done');
  const bad = checkActual(state, session, actualAt, input.recordedAt);
  if (bad) return fail(state, bad);
  if (existing.time === actualAt) return ok(state, false);
  const record: StepRecord = {
    ...existing,
    time: actualAt,
    revisions: nextRevisions(existing, { at: input.recordedAt, by: input.by, kind: 'time_edited', actualAt, prevActualAt: existing.time }),
  };
  return ok({ ...state, actuals: { steps: { ...state.actuals.steps, [k]: record } } });
}

/** 운동 완료를 취소해요. 기록은 지우지 않고 취소 상태와 이력으로 남아요 (복구하면 같은 기록이 되살아나요). */
export function undoWorkout(state: DayState, person: PersonId, input: Pick<WorkoutInput, 'by' | 'recordedAt'>): ActionResult {
  const k = workoutKey(person);
  const existing = state.actuals.steps[k];
  if (!existing || existing.status !== 'done') return fail(state, 'not_done');
  if (Number.isNaN(new Date(input.recordedAt).getTime())) return fail(state, 'invalid_recorded_at');
  const record: StepRecord = {
    ...existing,
    status: 'undone',
    revisions: nextRevisions(existing, { at: input.recordedAt, by: input.by, kind: 'undone', actualAt: null, prevActualAt: existing.time }),
  };
  return ok({ ...state, actuals: { steps: { ...state.actuals.steps, [k]: record } } });
}

/* ───────── 지난 운동 목록 (4단계, 읽기 전용 계산) ───────── */

export type WorkoutHistoryEvent = {
  person: PersonId;
  kind: Revision['kind'];
  /** 그 동작을 한 사람 */
  by: PersonId;
  /** 그 동작을 한 실제 순간 (ISO) */
  at: string;
  /** 그때의 실제 완료 시각 (취소는 null) */
  actualAt: Minute | null;
  prevActualAt: Minute | null;
};

export type WorkoutSessionRow = {
  /** 운동한 날 (세션 날짜) */
  day: string;
  sessionId: string;
  startedAt: Minute;
  startedBy: PersonId;
  /** 지금 유효한 개인 완료와 공동 완료 상태 */
  view: WorkoutSessionView;
  /** 취소된 개인 완료가 있으면 취소 전 시각 (다시 기록할 때 참고) */
  cancelled: Record<PersonId, { actualAt: Minute } | null>;
  /** 옛 공동 종료 기록이 들어 있는 날인지 (개인별 완료 미확인으로 구분) */
  legacy: boolean;
  /** 두 사람의 기록·수정·취소·복구 이력 (최신이 먼저) */
  events: WorkoutHistoryEvent[];
};

/** 한 세션의 이력 전체 (취소된 기록의 이력도 포함, 최신이 먼저) */
export function workoutEvents(state: DayState): WorkoutHistoryEvent[] {
  const out: WorkoutHistoryEvent[] = [];
  for (const person of PERSONS) {
    const r = state.actuals.steps[workoutKey(person)];
    if (!r || !Array.isArray(r.revisions)) continue;
    for (const v of r.revisions as Revision[]) {
      out.push({ person, kind: v.kind, by: v.by, at: v.at, actualAt: v.actualAt, prevActualAt: v.prevActualAt ?? null });
    }
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

/**
 * 보관된 모든 날과 오늘 중 ❤️ 공동 시작이 있었던 세션을 최신 날짜부터 보여 줘요 (기간 제한 없음 — 입력·정정 기한 O-134 미정).
 * ❤️ 없는 날은 세션이 아니라서 나오지 않아요. 새 날짜 상태를 만들지 않고 읽기만 해요.
 */
export function listWorkoutSessions(days: { day: string; state: DayState }[], current: DayState): WorkoutSessionRow[] {
  const all = [...days.filter((d) => d.day !== current.day), { day: current.day, state: current }];
  const out: WorkoutSessionRow[] = [];
  for (const d of all) {
    const session = sessionOf(d.state);
    if (!session) continue;
    out.push({
      day: d.day,
      sessionId: session.id,
      startedAt: session.startedAt,
      startedBy: session.startedBy,
      view: workoutSession(d.state),
      cancelled: { yangcho: pickCancelled(d.state, 'yangcho'), tawi: pickCancelled(d.state, 'tawi') },
      legacy: legacyJointEnd(d.state) !== null,
      events: workoutEvents(d.state),
    });
  }
  return out.sort((a, b) => (a.day < b.day ? 1 : -1));
}

function pickCancelled(state: DayState, person: PersonId): { actualAt: Minute } | null {
  const c = cancelledWorkout(state, person);
  return c ? { actualAt: c.actualAt } : null;
}


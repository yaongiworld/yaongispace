// 한 사람이 한 일(명령)을 하루 상태에 적용하는 곳. 저장소를 몰라요 (순수 함수).
//
// 폰은 "무엇을 했는지"(명령)만 보내고, 서버가 저장돼 있는 최신 하루에 같은 규칙 코드(domain)를 적용해요.
// 그래서 두 사람이 동시에 눌러도 각 명령이 최신 상태 위에서 차례로 적용되고(❤️ 뒤에 PLAN을 바꾸면 'locked'),
// 누가 한 일인지는 폰이 보낸 값이 아니라 로그인한 사람에서 정해져요 (`by`).
import type { PersonTimeSettings } from '../config/timeSettings';
import {
  completeStep,
  confirmEta,
  eatEarliest,
  pressHeart,
  recalcFromNow,
  resetSettings,
  setDesiredMealStart,
  setEtaField,
  setEtaMode,
  setMealOrder,
  setPersonSetting,
  setPlan,
  setWorkoutMinutes,
  skipStep,
  undoStep,
  type ActionResult,
  type DayState,
  type EtaMode,
} from '../domain/day/day';
import { completeWorkout, editWorkoutTime, undoWorkout } from '../domain/day/workout';
import type { Minute } from '../domain/time';
import type { EtaReference, MealOrder, PlanType, StepId } from '../domain/timeline/types';
import type { PersonId } from '../domain/types';

type Lane = PersonId | 'joint';

/** 하루 상태를 바꾸는 명령. `now`는 누른 순간의 계획 하루 분이고, `onDay`는 지난 날의 운동 세션을 고칠 때만 써요 */
export type DayCommand =
  | { kind: 'eta.mode'; person: PersonId; mode: EtaMode; values: Partial<Record<EtaReference, Minute | null>> }
  | { kind: 'eta.field'; person: PersonId; reference: EtaReference; time: Minute | null }
  | { kind: 'eta.confirm'; person: PersonId; reference: EtaReference }
  | { kind: 'plan.set'; plan: PlanType; homePerson?: PersonId }
  | { kind: 'meal.order'; order: MealOrder }
  | { kind: 'workout.minutes'; minutes: number }
  | { kind: 'desired.set'; minute: Minute | null }
  | { kind: 'eat.earliest'; now: Minute }
  | { kind: 'step.complete'; lane: Lane; step: StepId; now: Minute }
  | { kind: 'step.skip'; lane: Lane; step: StepId; now: Minute }
  | { kind: 'step.undo'; lane: Lane; step: StepId }
  | { kind: 'heart'; now: Minute }
  | { kind: 'recalc'; now: Minute }
  | { kind: 'setting.set'; person: PersonId; key: keyof PersonTimeSettings; value: number | null }
  | { kind: 'settings.reset' }
  | { kind: 'workout.complete'; person: PersonId; actualAt: Minute; onDay?: string }
  | { kind: 'workout.edit'; person: PersonId; actualAt: Minute; onDay?: string }
  | { kind: 'workout.undo'; person: PersonId; onDay?: string };

export const DAY_COMMAND_KINDS: readonly DayCommand['kind'][] = [
  'eta.mode',
  'eta.field',
  'eta.confirm',
  'plan.set',
  'meal.order',
  'workout.minutes',
  'desired.set',
  'eat.earliest',
  'step.complete',
  'step.skip',
  'step.undo',
  'heart',
  'recalc',
  'setting.set',
  'settings.reset',
  'workout.complete',
  'workout.edit',
  'workout.undo',
];

export type CommandContext = {
  /** 로그인한 사람의 역할. 폰이 보낸 값이 아니에요 */
  by: PersonId;
  /** 서버가 이 명령을 받은 실제 순간 (ISO) */
  at: string;
};

/** 어느 날에 적용할지: 지난 날 운동 세션 명령만 onDay를 가질 수 있고, 나머지는 항상 오늘이에요 */
export function targetDay(cmd: DayCommand, today: string): string {
  if ((cmd.kind === 'workout.complete' || cmd.kind === 'workout.edit' || cmd.kind === 'workout.undo') && cmd.onDay !== undefined) return cmd.onDay;
  return today;
}

const changed = (state: DayState): ActionResult => ({ ok: true, state, changed: true });

/** 명령 하나를 상태에 적용해요. 규칙을 어기면 { ok:false, reason }이고 상태는 그대로예요 */
export function applyDayCommand(state: DayState, cmd: DayCommand, ctx: CommandContext): ActionResult {
  const { by, at } = ctx;
  switch (cmd.kind) {
    case 'eta.mode':
      return changed(setEtaMode(state, cmd.person, cmd.mode, cmd.values, by));
    case 'eta.field':
      return changed(setEtaField(state, cmd.person, cmd.reference, cmd.time, by));
    case 'eta.confirm':
      return changed(confirmEta(state, cmd.person, cmd.reference, by));
    case 'plan.set':
      return setPlan(state, cmd.plan, cmd.homePerson);
    case 'meal.order':
      return setMealOrder(state, cmd.order);
    case 'workout.minutes':
      return setWorkoutMinutes(state, cmd.minutes);
    case 'desired.set':
      return setDesiredMealStart(state, cmd.minute);
    case 'eat.earliest':
      return eatEarliest(state, cmd.now);
    case 'step.complete':
      return completeStep(state, cmd.lane, cmd.step, cmd.now, by);
    case 'step.skip':
      return skipStep(state, cmd.lane, cmd.step, by, cmd.now);
    case 'step.undo':
      return undoStep(state, cmd.lane, cmd.step);
    case 'heart':
      return pressHeart(state, cmd.now, by);
    case 'recalc':
      return changed(recalcFromNow(state, cmd.now));
    case 'setting.set':
      return setPersonSetting(state, cmd.person, cmd.key, cmd.value);
    case 'settings.reset':
      return changed(resetSettings(state));
    case 'workout.complete':
      return completeWorkout(state, cmd.person, cmd.actualAt, { by, recordedAt: at });
    case 'workout.edit':
      return editWorkoutTime(state, cmd.person, cmd.actualAt, { by, recordedAt: at });
    case 'workout.undo':
      return undoWorkout(state, cmd.person, { by, recordedAt: at });
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * 밖에서 온 값이 알려진 명령 모양인지 확인해요. 값 자체의 옳고 그름(시각 범위, 단계 이름 등)은
 * 규칙 코드가 판단해요 — 여기서는 "모르는 종류의 명령"과 "사람 값이 아닌 것"만 막아요.
 */
export function parseDayCommand(raw: unknown): DayCommand | null {
  if (!isRecord(raw) || typeof raw.kind !== 'string') return null;
  if (!(DAY_COMMAND_KINDS as readonly string[]).includes(raw.kind)) return null;
  const isPerson = (v: unknown): v is PersonId => v === 'yangcho' || v === 'tawi';
  if ('person' in raw && !isPerson(raw.person)) return null;
  if ('homePerson' in raw && raw.homePerson !== undefined && !isPerson(raw.homePerson)) return null;
  if ('lane' in raw && !isPerson(raw.lane) && raw.lane !== 'joint') return null;
  if ('onDay' in raw && raw.onDay !== undefined && (typeof raw.onDay !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.onDay))) return null;
  return raw as DayCommand;
}

'use client';

// 오늘의 하루 상태와 지난 날. 화면이 쓰는 이름(useDay)은 프로토타입과 같고, 저장은 서버가 해요.
// 누르면 같은 규칙 코드로 바로 계산해서 보여 주고(낙관적 반영), 서버가 최신 상태 위에서 다시 확인해요.
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import type { PersonTimeSettings } from '@/lib/south-america/config/timeSettings';
import { liveDay, type ActionResult, type DayState, type EtaMode, type LiveDay } from '@/lib/south-america/domain/day/day';
import {
  listWorkoutSessions,
  pendingWorkoutSessions,
  workoutSession,
  type PendingWorkoutSession,
  type WorkoutSessionRow,
  type WorkoutSessionView,
} from '@/lib/south-america/domain/day/workout';
import type { Minute } from '@/lib/south-america/domain/time';
import type { EtaReference, MealOrder, PlanType, StepId } from '@/lib/south-america/domain/timeline/types';
import type { PersonId } from '@/lib/south-america/domain/types';
import { useClock } from './clock';
import { useEngine, useSyncValue } from './SaProvider';
import type { SyncNotice } from './sync';

export type DayApi = {
  state: DayState;
  live: LiveDay;
  now: Minute;
  /** 지금 이 폰을 쓰는 사람 (로그인에서 정해져요) */
  viewer: PersonId;
  editEta: (person: PersonId, mode: EtaMode, values: Partial<Record<EtaReference, Minute | null>>) => void;
  setEtaField: (person: PersonId, reference: EtaReference, time: Minute | null) => void;
  confirmEta: (person: PersonId, reference: EtaReference) => void;
  setPlan: (plan: PlanType, homePerson?: PersonId) => ActionResult;
  setMealOrder: (order: MealOrder) => ActionResult;
  setWorkoutMinutes: (m: number) => ActionResult;
  setDesired: (m: Minute | null) => ActionResult;
  eatEarliest: () => ActionResult;
  complete: (lane: PersonId | 'joint', step: StepId) => ActionResult;
  skip: (lane: PersonId | 'joint', step: StepId) => ActionResult;
  undo: (lane: PersonId | 'joint', step: StepId) => ActionResult;
  heart: () => ActionResult;
  recalc: () => void;
  setSetting: (person: PersonId, key: keyof PersonTimeSettings, value: number | null) => ActionResult;
  resetSettings: () => void;
  completeWorkout: (person: PersonId, actualAt: Minute, onDay?: string) => ActionResult;
  editWorkoutTime: (person: PersonId, actualAt: Minute, onDay?: string) => ActionResult;
  undoWorkout: (person: PersonId, onDay?: string) => ActionResult;
  workout: WorkoutSessionView;
  workoutFor: (onDay?: string) => { state: DayState; view: WorkoutSessionView } | null;
  pendingPast: PendingWorkoutSession[];
  workoutSessions: WorkoutSessionRow[];
  instantNow: () => Date;
  /** 동기화 상태: 아직 못 보낸 변경 수 / 연결 없음 / 로그인 풀림 / 알림 */
  sync: { pending: number; offline: boolean; signedOut: boolean; notices: SyncNotice[]; dismiss: (id: number) => void };
};

const Ctx = createContext<DayApi | null>(null);

export function DayProvider({ children }: { children: ReactNode }) {
  const engine = useEngine();
  const view = useSyncValue();
  const { now, today: clockToday, instantNow } = useClock();
  const snap = view.snapshot;
  const viewer = snap.persona;

  // 자정(04:00)을 넘겨 열려 있으면 서버에서 새 하루를 받아 와요
  useEffect(() => {
    if (clockToday !== snap.today) void engine.refresh();
  }, [clockToday, snap.today, engine]);

  const state = (snap.days.find((d) => d.day === snap.today) ?? snap.days[0]).state;
  const live = useMemo(() => liveDay(state, now), [state, now]);
  const workout = useMemo(() => workoutSession(state), [state]);
  const past = useMemo(() => snap.days.filter((d) => d.day !== snap.today).map((d) => ({ day: d.day, state: d.state })), [snap.days, snap.today]);
  const pendingPast = useMemo(() => pendingWorkoutSessions(past, state.day), [past, state.day]);
  const workoutSessions = useMemo(() => listWorkoutSessions(past, state), [past, state]);

  const api = useMemo<DayApi>(() => {
    const run = (cmd: Parameters<typeof engine.day>[0]) => engine.day(cmd, instantNow());
    return {
      state,
      live,
      now,
      viewer,
      editEta: (person, mode, values) => void run({ kind: 'eta.mode', person, mode, values }),
      setEtaField: (person, reference, time) => void run({ kind: 'eta.field', person, reference, time }),
      confirmEta: (person, reference) => void run({ kind: 'eta.confirm', person, reference }),
      setPlan: (plan, homePerson) => run({ kind: 'plan.set', plan, homePerson }),
      setMealOrder: (order) => run({ kind: 'meal.order', order }),
      setWorkoutMinutes: (minutes) => run({ kind: 'workout.minutes', minutes }),
      setDesired: (minute) => run({ kind: 'desired.set', minute }),
      eatEarliest: () => run({ kind: 'eat.earliest', now }),
      complete: (lane, step) => run({ kind: 'step.complete', lane, step, now }),
      skip: (lane, step) => run({ kind: 'step.skip', lane, step, now }),
      undo: (lane, step) => run({ kind: 'step.undo', lane, step }),
      heart: () => run({ kind: 'heart', now }),
      recalc: () => void run({ kind: 'recalc', now }),
      setSetting: (person, key, value) => run({ kind: 'setting.set', person, key, value }),
      resetSettings: () => void run({ kind: 'settings.reset' }),
      completeWorkout: (person, actualAt, onDay) => run({ kind: 'workout.complete', person, actualAt, onDay }),
      editWorkoutTime: (person, actualAt, onDay) => run({ kind: 'workout.edit', person, actualAt, onDay }),
      undoWorkout: (person, onDay) => run({ kind: 'workout.undo', person, onDay }),
      workout,
      workoutFor: (onDay) => {
        const row = onDay === undefined || onDay === snap.today ? snap.days.find((d) => d.day === snap.today) : snap.days.find((d) => d.day === onDay);
        return row ? { state: row.state, view: workoutSession(row.state) } : null;
      },
      pendingPast,
      workoutSessions,
      instantNow,
      sync: { pending: view.pending, offline: view.offline, signedOut: view.signedOut, notices: view.notices, dismiss: engine.dismissNotice },
    };
  }, [engine, state, live, now, viewer, workout, snap, pendingPast, workoutSessions, instantNow, view]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useDay(): DayApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('DayProvider 안에서만 쓸 수 있어요');
  return v;
}

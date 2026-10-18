import { useState } from 'react';
import type { PersonId } from '@/lib/south-america/domain/types';
import { useDay } from '../../store/dayStore';
import { WorkoutTimeSheet, type WorkoutSheetTarget } from '../workout/WorkoutTimeSheet';
import { EtaCard, EtaCollapsed, SummaryCard } from './Cards';
import { NextCard } from './NextCard';
import { EtaSheet } from './EtaSheet';
import { PlanSheet } from './PlanSheet';
import { TimelineSheet } from './TimelineSheet';
import { DesiredSheet } from './DinnerBlock';
import { PastWorkoutNotice, WorkoutCard } from './WorkoutCard';

type Open = { kind: 'eta'; person: PersonId } | { kind: 'plan' } | { kind: 'timeline' } | { kind: 'desired' } | { kind: 'workout'; target: WorkoutSheetTarget } | null;

/**
 * 오늘 탭 (실제 계산 연결): ① 두 사람 ETA → ② 다음 Baby Step → ③ 함께 시작·저녁 요약.
 * ❤️ 이후에는 운동 카드가 맨 위의 주요 행동이 되고, ETA 카드는 한 줄로 접혀요 (누르면 펼침).
 * ❤️ 이전의 흐름(ETA → PLAN → 다음 행동 → ❤️)은 그대로예요.
 */
export function LiveToday() {
  const day = useDay();
  const [open, setOpen] = useState<Open>(null);
  const [etaOpen, setEtaOpen] = useState(false);
  const close = () => setOpen(null);
  const started = day.workout.session !== null;
  const openWorkout = (target: WorkoutSheetTarget) => setOpen({ kind: 'workout', target });
  return (
    <>
      {started && <WorkoutCard onSheet={openWorkout} />}
      {started && !etaOpen ? (
        <EtaCollapsed onOpen={() => setEtaOpen(true)} />
      ) : (
        <EtaCard onEdit={(person) => setOpen({ kind: 'eta', person })} onCollapse={started ? () => setEtaOpen(false) : undefined} />
      )}
      <NextCard onOpenTimeline={() => setOpen({ kind: 'timeline' })} />
      <SummaryCard onPlan={() => setOpen({ kind: 'plan' })} onTimeline={() => setOpen({ kind: 'timeline' })} onDesired={() => setOpen({ kind: 'desired' })} />
      <PastWorkoutNotice onSheet={openWorkout} />
      {open?.kind === 'eta' && <EtaSheet key={open.person} person={open.person} onClose={close} />}
      {open?.kind === 'plan' && <PlanSheet onClose={close} onEta={(person) => setOpen({ kind: 'eta', person })} />}
      {open?.kind === 'desired' && <DesiredSheet onClose={close} />}
      {open?.kind === 'timeline' && <TimelineSheet onClose={close} />}
      {open?.kind === 'workout' && <WorkoutTimeSheet key={`${open.target.onDay ?? 'today'}:${open.target.person}:${open.target.mode}`} target={open.target} onClose={close} />}
    </>
  );
}

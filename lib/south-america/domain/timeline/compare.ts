// PLAN A / B 비교와 추천 (06 문서 11-5, P-033, P-143).
import { PEOPLE, type PersonId } from '../types';
import { TIMELINE_RULES } from '../../config/timeSettings';
import { computeTimeline, resolveHomeArrival } from './compute';
import type { PlanCandidate, PlanCandidateId, PlanComparison, TimelineInput } from './types';

export type CompareInput = Omit<TimelineInput, 'plan' | 'homePerson'>;

export function comparePlans(base: CompareInput): PlanComparison {
  const make = (id: PlanCandidateId, plan: 'A' | 'B', homePerson: PersonId | null): PlanCandidate => {
    const timeline = computeTimeline({ ...base, plan, homePerson: homePerson ?? undefined });
    const label = plan === 'A' ? 'PLAN A 집에서 함께 출발' : `PLAN B ${PEOPLE[homePerson!].name} 집 담당`;
    return { id, plan, homePerson, label, timeline, available: timeline.status === 'ok', jointStart: timeline.summary.jointStart };
  };
  const candidates = [make('A', 'A', null), make('B_yangcho', 'B', 'yangcho'), make('B_tawi', 'B', 'tawi')];
  const avail = candidates.filter((c) => c.available).sort((a, b) => (a.jointStart as number) - (b.jointStart as number));

  let recommended: PlanCandidateId | null = null;
  let gapMinutes: number | null = null;
  let note: PlanComparison['note'];
  if (avail.length === 0) note = 'none_available';
  else if (avail.length === 1) note = 'single_candidate';
  else {
    gapMinutes = (avail[1].jointStart as number) - (avail[0].jointStart as number);
    if (gapMinutes >= TIMELINE_RULES.recommendThresholdMinutes) {
      recommended = avail[0].id;
      note = 'recommended';
    } else note = 'no_big_difference';
  }

  /* B를 고를 때 집 담당 기본 제안: 더 이른 쪽, 차이가 작으면 먼저 집에 도착한 사람 [P-143] */
  let suggestedHomePerson: PersonId | null = null;
  if (base.mealOrder === 'after') {
    const bs = avail.filter((c) => c.plan === 'B');
    const earlierHome = (): PersonId | null => {
      const hy = resolveHomeArrival(base, 'yangcho');
      const ht = resolveHomeArrival(base, 'tawi');
      if (hy === null || ht === null) return hy !== null ? 'yangcho' : ht !== null ? 'tawi' : null;
      return ht < hy ? 'tawi' : 'yangcho';
    };
    if (bs.length === 1) suggestedHomePerson = bs[0].homePerson;
    else if (bs.length === 2) {
      const gap = (bs[1].jointStart as number) - (bs[0].jointStart as number);
      suggestedHomePerson = gap >= TIMELINE_RULES.recommendThresholdMinutes ? bs[0].homePerson : earlierHome();
    } else suggestedHomePerson = earlierHome();
  }

  return { candidates, recommended, gapMinutes, note, suggestedHomePerson };
}

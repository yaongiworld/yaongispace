import { PEOPLE, type PersonId } from '@/lib/south-america/domain/types';
import { fmt } from '@/lib/south-america/domain/time';
import { TIMELINE_RULES } from '@/lib/south-america/config/timeSettings';
import { describeDinnerLine, describeDirectGym } from '@/lib/south-america/domain/timeline';
import type { MealOrder, PlanCandidate } from '@/lib/south-america/domain/timeline/types';
import { Sheet } from '../common/Sheet';
import { useToast } from '../common/Toast';
import { useDay } from '../../store/dayStore';
import { DesiredEditor } from './DinnerBlock';
import { ERROR_TEXT, findNode, homeReturnInfo, nodeTime, workoutEndInfo } from './format';

const NOTE: Record<string, string> = {
  recommended: '❤️ 시작이 더 이른 쪽을 추천해요',
  no_big_difference: '두 계획의 차이가 크지 않아요',
  single_candidate: '지금은 비교할 수 있는 계획이 하나뿐이에요',
  none_available: '지금은 계산할 수 있는 계획이 없어요 (ETA를 넣어 주세요)',
};

/**
 * PLAN 하나의 핵심 시각: 시작·운동 끝·귀가, 그리고 저녁(가능 시각과 희망과의 차이).
 * 실제로 기록한 시각(예: ❤️ 시작을 누른 뒤)은 ✓로, 예상은 ~로 보여줘요.
 */
function CandidateFacts({ c, desired }: { c: PlanCandidate; desired: number | null }) {
  const tl = c.timeline;
  const dinner = describeDinnerLine(tl.summary.mealStart, desired);
  const ret = homeReturnInfo(tl);
  const mealEnd = findNode(tl, 'joint', 'meal_end');
  return (
    <span className="cand__facts">
      <span>❤️ 시작 {nodeTime(findNode(tl, 'joint', 'joint_start')) || '--:--'}</span>
      <span>💪 끝 {workoutEndInfo(tl) ?? '--:--'}</span>
      <span>🏠 귀가 {ret?.text ?? '--:--'}</span>
      <span className={`cand__dinner dinner--${dinner.tone}`}>
        🍽 {dinner.headline.replace(/^저녁 /, '')}
        {dinner.detail && <> · {dinner.detail}</>}
        {mealEnd?.state === 'done' && mealEnd.time !== null && <> · 식사 끝 ✓{fmt(mealEnd.time)}</>}
      </span>
    </span>
  );
}

/** PLAN A/B 비교와 선택, 저녁 순서, 운동 시간, 희망 저녁 시각 */
export function PlanSheet({ onClose, onEta }: { onClose: () => void; onEta: (p: PersonId) => void }) {
  const day = useDay();
  const toast = useToast();
  const { state, live } = day;
  const cmp = live.comparison;
  const locked = live.locked;
  const guard = (r: { ok: boolean; reason?: keyof typeof ERROR_TEXT }) => {
    if (!r.ok && r.reason) toast(ERROR_TEXT[r.reason]);
  };
  const isOn = (c: PlanCandidate) => state.plan === c.plan && (c.plan === 'A' || state.homePerson === c.homePerson);
  const shown = locked ? cmp.candidates.filter(isOn) : cmp.candidates;

  return (
    <Sheet open onClose={onClose} title="계획 비교·변경">
      {locked && <p className="tiny">❤️ 함께 운동을 시작해서 PLAN·저녁 순서·운동 시간은 바꿀 수 없어요. 희망 저녁 시각만 바꿀 수 있어요.</p>}

      <div className="cands" role="radiogroup" aria-label="PLAN 선택">
        {shown.map((c) => {
          const on = isOn(c);
          const why = !c.available ? c.timeline.blockers[0] : undefined;
          return (
            <div className="cand-wrap" key={c.id}>
              <button
                role="radio"
                aria-checked={on}
                disabled={locked && !on}
                className={`cand ${on ? 'cand--on' : ''} ${!c.available ? 'cand--na' : ''}`}
                onClick={() => guard(day.setPlan(c.plan, c.homePerson ?? undefined))}
                data-testid={`cand-${c.id}`}
              >
                <span className="cand__name">
                  {c.label}
                  {cmp.recommended === c.id && <span className="chip chip--new">추천</span>}
                  {c.available && cmp.suggestedHomePerson && c.homePerson === cmp.suggestedHomePerson && cmp.recommended !== c.id && <span className="chip chip--dim">집 담당 제안</span>}
                </span>
                {c.available ? <CandidateFacts c={c} desired={state.desiredMealStart} /> : <span className="cand__time">계산 불가</span>}
                {why && <span className="cand__why">{why.message}</span>}
                {c.plan === 'B' && c.available && <span className="cand__why">{describeDirectGym(c.timeline, state.eta)?.text}</span>}
              </button>
              {why?.person && (
                <button className="btn btn--text cand__fix" onClick={() => { onClose(); onEta(why.person!); }} data-testid={`fix-${c.id}`}>
                  {PEOPLE[why.person].name} ETA에서 입력하기 ›
                </button>
              )}
            </div>
          );
        })}
      </div>
      {!locked && <p className="tiny">{NOTE[cmp.note]}{cmp.gapMinutes !== null && cmp.note === 'recommended' ? ` (${cmp.gapMinutes}분 차이)` : ''}</p>}
      {state.plan === 'B' && !locked && <p className="tiny">PLAN B는 집 담당이 집에서 두 사람 짐을 챙겨 헬스장으로 가고, 다른 사람은 집을 거치지 않고 헬스장으로 가요.</p>}

      <div className="field">
        <label className="field__label">저녁 순서</label>
        <div className="seg">
          {(['after', 'before'] as MealOrder[]).map((o) => (
            <button key={o} disabled={locked} className={`seg__btn ${state.mealOrder === o ? 'seg__btn--on' : ''}`} onClick={() => guard(day.setMealOrder(o))} data-testid={`meal-${o}`}>
              {o === 'after' ? '운동 후 저녁' : '저녁 먼저'}
            </button>
          ))}
        </div>
        {state.mealOrder === 'before' && <p className="tiny">저녁을 먼저 먹는 날은 PLAN A만 쓸 수 있고, 식후 대기 시간을 지켜요.</p>}
      </div>

      <div className="field">
        <label className="field__label">운동 시간</label>
        <div className="seg">
          {TIMELINE_RULES.workoutOptions.map((m) => (
            <button key={m} disabled={locked} className={`seg__btn ${state.workoutMinutes === m ? 'seg__btn--on' : ''}`} onClick={() => guard(day.setWorkoutMinutes(m))} data-testid={`workout-${m}`}>
              {m}분
            </button>
          ))}
        </div>
      </div>

      <DesiredEditor />

      <div className="sheet__actions">
        <button className="btn btn--primary" onClick={onClose}>확인</button>
      </div>
    </Sheet>
  );
}

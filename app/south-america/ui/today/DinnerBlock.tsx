import { TIMELINE_RULES } from '@/lib/south-america/config/timeSettings';
import { fmt } from '@/lib/south-america/domain/time';
import { describeDinnerLine, type DinnerLine } from '@/lib/south-america/domain/timeline';
import { Sheet } from '../common/Sheet';
import { TimeStepper } from '../common/Stepper';
import { useToast } from '../common/Toast';
import { useDay } from '../../store/dayStore';
import { ERROR_TEXT, findNode, nodeTime, roundUp5 } from './format';

/**
 * 저녁 안내에 쓸 값: 가능한 가장 빠른 시각과 희망 시각.
 * "저녁 준비 끝"을 눌렀어도 그것은 식사 시작의 실제 기록이 아니에요(식사 시작을 직접 기록하는 단계는 없어요).
 * 그래서 식사 시작은 항상 "가능한 시각(예상)"으로만 보여줘요. 실제 기록은 "식사 끝"을 눌렀을 때 그 시각이에요.
 */
export function useDinnerInfo() {
  const { live, state } = useDay();
  const tl = live.timeline;
  const expected = tl.summary.mealStart;
  const mealEnd = findNode(tl, 'joint', 'meal_end');
  const ended = mealEnd?.state === 'done' && mealEnd.time !== null ? mealEnd.time : null;
  const line: DinnerLine = describeDinnerLine(expected, state.desiredMealStart);
  return { tl, expected, ended, desired: state.desiredMealStart, line };
}

/** 저녁 한 줄: 가능한 시각 + (희망이 있으면) 희망과의 차이. 희망이 없으면 임의 목표를 만들지 않아요. */
export function DinnerBlock({ onEdit }: { onEdit: () => void }) {
  const day = useDay();
  const toast = useToast();
  const { tl, expected, desired, line, ended } = useDinnerInfo();
  const mealEndNode = findNode(tl, 'joint', 'meal_end');
  const late = expected !== null && expected >= TIMELINE_RULES.lateDinnerNoticeAt;
  const earliest = () => {
    const r = day.eatEarliest();
    toast(r.ok ? '희망 저녁을 가장 빠른 시각으로 맞췄어요' : ERROR_TEXT[r.reason]);
  };
  if (ended !== null) {
    return (
      <div className="dinner dinner--none" data-testid="dinner-line">
        <p className="dinner__head"><span aria-hidden>🍽</span> <b>저녁 식사 끝 ✓{fmt(ended)} (실제 기록)</b></p>
        {desired !== null && <p className="dinner__detail">희망 {fmt(desired)} · 식사 시작은 기록하지 않아서 예상 {expected === null ? '' : fmt(expected)}예요</p>}
      </div>
    );
  }
  return (
    <div className={`dinner dinner--${line.tone}`} data-testid="dinner-line">
      <p className="dinner__head">
        <span aria-hidden>{late ? '🌙' : '🍽'}</span> <b>{line.headline}</b>
        {mealEndNode && mealEndNode.time !== null && <small className="dinner__end"> · 식사 끝 {nodeTime(mealEndNode)}</small>}
      </p>
      <div className="dinner__row">
        {line.detail && <p className="dinner__detail" data-testid="dinner-detail">{line.detail}</p>}
        {desired !== null && (
          <button className="btn btn--text dinner__edit" onClick={onEdit} data-testid="edit-desired">
            변경
          </button>
        )}
      </div>
      <div className="dinner__actions">
        {desired === null && expected !== null && (
          <button className="btn btn--small btn--ghost" onClick={onEdit} data-testid="set-desired">
            희망 저녁시간 설정
          </button>
        )}
        {line.canEatEarlier && (
          <button className="btn btn--small btn--primary" onClick={earliest} data-testid="eat-earliest">
            가장 빠르게 먹기
          </button>
        )}
      </div>
    </div>
  );
}

/** 희망 저녁 시각 입력·변경·삭제. 처음 [입력]은 가장 빠른 가능 시각에서 시작해요 (20:00 같은 임의 목표 없음). */
export function DesiredEditor() {
  const day = useDay();
  const toast = useToast();
  const { expected, desired, line } = useDinnerInfo();
  const guard = (r: { ok: boolean; reason?: keyof typeof ERROR_TEXT }) => {
    if (!r.ok && r.reason) toast(ERROR_TEXT[r.reason]);
  };
  const initial = roundUp5(expected ?? day.now);
  return (
    <div className="field">
      <label className="field__label">희망 저녁 시작 시각 (선택)</label>
      <TimeStepper
        label="희망 저녁 시각"
        value={desired}
        initial={initial}
        chips={[-10, 10, 30]}
        onChange={(m) => guard(day.setDesired(m))}
        onClear={() => guard(day.setDesired(null))}
      />
      <p className={`dinner__sheetline dinner--${line.tone}`}>
        <b>{line.headline}</b>
        {line.detail && <> · {line.detail}</>}
      </p>
      {line.canEatEarlier && (
        <button className="btn btn--small btn--primary" onClick={() => guard(day.eatEarliest())} data-testid="eat-earliest-sheet">
          가장 빠르게 먹기 ({expected !== null ? fmt(expected) : ''})
        </button>
      )}
      <p className="tiny">희망은 목표일 뿐이에요. 이미 한 일이나 운동 시작 시각을 바꾸지 않고, 시각 차이만 알려 줘요.</p>
    </div>
  );
}

export function DesiredSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet open onClose={onClose} title="희망 저녁시간">
      <DesiredEditor />
      <div className="sheet__actions">
        <button className="btn btn--primary" onClick={onClose}>확인</button>
      </div>
    </Sheet>
  );
}


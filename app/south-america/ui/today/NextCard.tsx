import { useEffect, useRef, useState } from 'react';
import { fmt, type Minute } from '@/lib/south-america/domain/time';
import { nextAction } from '@/lib/south-america/domain/timeline/steps';
import type { StepId } from '@/lib/south-america/domain/timeline/types';
import type { PersonId } from '@/lib/south-america/domain/types';
import { Card } from '../common/Card';
import { useToast } from '../common/Toast';
import { useTall } from '../common/useMedia';
import { useDay } from '../../store/dayStore';
import { ERROR_TEXT, deltaText, findNode, nodeTime } from './format';

type JustDone = { lane: PersonId | 'joint'; step: StepId; label: string; emoji: string; actual: Minute; expected: Minute | null; heart: boolean };

/**
 * 지금 화면에 보여 줄 행동 [사용자 확정: 완료 버튼 최소화].
 * - 다음 일정: 일반 일정은 자동으로 예상을 보여주고, 눌러서 실제로 기록하는 것은 선택이에요.
 * - 필요한 기록: ❤️ 함께 운동 시작, 운동 끝은 직접 눌러 기록해야 해요. 시간이 지나도 사라지거나 잠기지 않아요.
 * - 예정 시각이 지났지만 안 누른 일반 일정은 완료로 처리하지 않고 "예상 시각 지남 · 실제 미확인"으로만 알려요.
 */
export function NextCard({ onOpenTimeline }: { onOpenTimeline: () => void }) {
  const day = useDay();
  const toast = useToast();
  const tall = useTall();
  const tl = day.live.timeline;
  const [done, setDone] = useState<JustDone | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const remember = (j: JustDone) => {
    setDone(j);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setDone(null), 7000);
  };
  const act = nextAction(tl, day.viewer);
  // 운동 끝은 위의 "운동 카드"에서 각자 기록해요. 여기서는 다루지 않아요.
  const record = act.record && act.record.step!.id === 'workout_end' ? null : act.record;
  const started = day.workout.session !== null;

  const press = (lane: PersonId | 'joint', step: StepId, label: string, emoji: string, expected: Minute | null, heart = false) => {
    const r = heart ? day.heart() : day.complete(lane, step);
    if (!r.ok) return toast(ERROR_TEXT[r.reason]);
    if (r.changed) remember({ lane, step, label, emoji, actual: day.now, expected, heart });
  };

  const strip = done && (
    <div className="strip pop" data-testid="just-done">
      <span>
        {done.emoji} {done.label} {fmt(done.actual)}
        {done.expected !== null && <small> · {deltaText(done.expected, done.actual)}</small>}
      </span>
      {!done.heart && (
        <button className="btn btn--text" onClick={() => { day.undo(done.lane, done.step); setDone(null); }}>↩️ 취소</button>
      )}
    </div>
  );

  const { upcoming, pastUnconfirmed } = act;
  const start = findNode(tl, 'joint', 'joint_start');
  const finished = tl.status === 'ok' && record === null && upcoming === null && pastUnconfirmed.length === 0 && start?.state === 'done' && day.workout.completions[day.viewer] !== null;

  if (!record && !upcoming && pastUnconfirmed.length === 0) {
    // 운동 완료를 기록하기 전에는 운동 카드가 주요 행동이라 이 카드를 비워 둬요
    if (started && !finished) return <>{strip}</>;
    return (
      <>
        {strip}
        <Card className="next">
          <p className="next__line">
            {finished ? <>🎉 <b>오늘 일정이 모두 끝났어요</b></> : <><span className="next__label">다음 ›</span> ETA를 넣으면 일정이 계산돼요</>}
          </p>
        </Card>
      </>
    );
  }

  const upInfo = upcoming?.step ?? null;
  const upRow = upcoming && upInfo && (
    <div className="next__row">
      <p className="next__line">
        <span className="next__label">다음 일정 ›</span> <span aria-hidden>{upInfo.emoji}</span> {upInfo.label} <b>{nodeTime(upcoming)}</b>
        {upInfo.scope === 'joint' && <span className="chip chip--dim">함께</span>}
      </p>
      <button
        className="btn btn--small btn--ghost next__opt"
        onClick={() => press(upcoming.lane, upInfo.id, upInfo.label, upInfo.emoji, upcoming.time)}
        aria-label={`${upInfo.label} 실제로 기록하기 (선택)`}
        data-testid="step-done"
      >
        {upInfo.doneLabel}
      </button>
    </div>
  );

  const pastRow = pastUnconfirmed.length > 0 && (
    <button className="next__past" onClick={onOpenTimeline} data-testid="past-unconfirmed">
      예상 시각이 지난 일정 {pastUnconfirmed.length}개 · 실제 미확인 ›
    </button>
  );

  /* 필요한 기록: ❤️ 함께 운동 시작 */
  if (record && record.step!.id === 'start_together') {
    return (
      <>
        {strip}
        <Card className="next next--cta heartcard" tone="terra">
          {upRow}
          <p className="next__line">
            ❤️ 함께 운동 시작 <b>{nodeTime(record)}</b>
            {record.overdue && <span className="chip chip--late">예상 시각 지남 · 실제 미기록</span>}
          </p>
          {/* 예정 시각 전에는 작게, 예정 시각이 되면 크게 보여요. 어느 쪽이든 눌러서 기록할 수 있고 잠기지 않아요 */}
          <button
            className={`btn btn--heart ${record.time !== null && day.now >= record.time ? 'btn--giant' : 'btn--calm'}`}
            onClick={() => press('joint', 'start_together', record.step!.label, record.step!.emoji, record.time, true)}
            data-testid="heart"
          >
            ❤️ 함께 운동 시작!
          </button>
          {tall && <p className="tiny">필요한 기록 · 함께 시작할 때 한 명이 눌러요 (누른 시각이 실제 시작)</p>}
          {pastRow}
        </Card>
      </>
    );
  }

  /* 일반 일정만 남은 때 (필요한 기록이 없을 때) */
  return (
    <>
      {strip}
      <Card className="next next--cta">
        {upRow ?? <p className="next__line"><span className="next__label">다음 일정 ›</span> 남은 예정 일정이 없어요</p>}
        {pastRow}
      </Card>
    </>
  );
}

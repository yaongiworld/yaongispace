import { useMemo, useState } from 'react';
import { fmt, type Minute } from '@/lib/south-america/domain/time';
import { groupTimeline, type GroupLane, type TimelineGroup } from '@/lib/south-america/domain/timeline';
import type { TimelineNode } from '@/lib/south-america/domain/timeline/types';
import type { PersonId } from '@/lib/south-america/domain/types';
import { PEOPLE } from '@/lib/south-america/domain/types';
import { CatMark } from '../common/CatMark';
import { Sheet } from '../common/Sheet';
import { useToast } from '../common/Toast';
import { useDay } from '../../store/dayStore';
import { ERROR_TEXT, deltaText } from './format';

/** 양초/타위/함께는 색과 글자 라벨(이름)로 둘 다 구분해요 */
function LaneLabel({ lane }: { lane: GroupLane }) {
  if (lane === 'joint') return <span className="lane lane--joint">💞 함께</span>;
  if (lane === 'both') {
    return (
      <span className="lane lane--both">
        <CatMark who="yangcho" size="sm" /> <CatMark who="tawi" size="sm" /> 각자 (양초·타위)
      </span>
    );
  }
  return (
    <span className={`lane lane--${lane}`}>
      <CatMark who={lane} size="sm" /> {PEOPLE[lane].name}
    </span>
  );
}

const BASIS_WORD = { actual: '실제', mixed: '실제+예상', estimate: '예상' } as const;

/** 색만으로 구분하지 않고 "실제 / 실제+예상 / 예상" 글자를 시각 앞에 붙여요 */
function rangeText(g: TimelineGroup): string {
  if (g.start === null) return '시각 미정';
  const a = fmt(g.start);
  const b = g.end === null ? a : fmt(g.end);
  const mark = g.timeBasis === 'actual' ? '✓' : '';
  return `${mark}${a === b ? a : `${a}~${b}`}`;
}

function rowTime(n: TimelineNode): string {
  if (n.time === null) return '—';
  if (n.state === 'done') return `✓${fmt(n.time)}`;
  if (n.state === 'skipped') return '건너뜀';
  return `${n.approx ? '~' : ''}${fmt(n.time)}`;
}

/** 눈여겨볼 상태만 한 줄로 (실제 vs 예상, 건너뜀, 예상 시각 지남, 기다림) */
function sub(n: TimelineNode): string {
  const parts: string[] = [];
  if (n.state === 'done') parts.push(n.expected !== null && n.actual !== null ? `실제 기록 · 예상 ${fmt(n.expected)} → ${deltaText(n.expected, n.actual)}` : '실제 기록');
  else if (n.state === 'skipped') parts.push('건너뜀 · 실제 기록 아님(시간에서 뺐어요)');
  else if (n.state === 'blocked') parts.push('입력이 필요해요');
  else parts.push(n.overdue ? '예상 시각 지남 · 실제 미확인' : n.approx ? '예상' : '입력한 시각');
  if (n.waitMinutes) parts.push(`기다림 ${n.waitMinutes}분`);
  return parts.join(' · ');
}

function Meta({ g, current }: { g: TimelineGroup; current: boolean }) {
  return (
    <span className="tg__meta">
      {g.needsRecord && <span className="chip chip--now">기록 필요</span>}
      {current && !g.needsRecord && <span className="chip chip--next">다음 일정</span>}
      {g.note && <span className="chip chip--dim">{g.note}</span>}
      {g.stepCount > 1 && g.state !== 'blocked' && <span className="chip chip--dim">{g.doneCount}/{g.stepCount} 실제 기록</span>}
      {g.stepCount === 1 && g.doneCount === 1 && <span className="chip chip--dim">실제 기록</span>}
      {g.skippedCount > 0 && <span className="chip chip--dim">{g.skippedCount} 건너뜀</span>}
      {g.overdue && <span className="chip chip--late">예상 시각 지남 · 실제 미확인</span>}
      {g.wait !== null && <span className="chip chip--dim">{g.wait}분 기다림</span>}
    </span>
  );
}

type RowActions = {
  viewer: PersonId;
  onUndo: (n: TimelineNode) => void;
  onRecord: (n: TimelineNode) => void;
  onSkip: (n: TimelineNode) => void;
};

function GroupItem({ g, open, current, onToggle, act }: { g: TimelineGroup; open: boolean; current: boolean; onToggle: () => void; act: RowActions }) {
  return (
    <li className={`tg tg--${g.lane} tg--${g.state} ${g.overdue ? 'tg--late' : ''} ${current ? 'tg--current' : ''}`} data-testid="tl-group" data-group={g.key}>
      <button className="tg__head" onClick={onToggle} aria-expanded={open} data-testid="tl-group-toggle">
        <span className="tg__lane"><LaneLabel lane={g.lane} /></span>
        <span className="tg__title"><span aria-hidden>{g.emoji}</span> {g.label}</span>
        <span className="tg__time">
          <small className="tg__basis">{BASIS_WORD[g.timeBasis]}</small> {rangeText(g)}
        </span>
        <span className="tg__chev" aria-hidden>{open ? '▴' : '▾'}</span>
        <Meta g={g} current={current} />
      </button>
      {open && (
        <ul className="tgr-list">
          {g.rows.map((r) => {
            const n = r.node;
            const mine = n.lane === 'joint' || n.lane === act.viewer;
            const step = n.step;
            // 상세에서 가능한 동작: 기록한 단계는 취소(❤️ 시작 제외), 아직 안 한 일반 단계는 내 것/함께 것만 기록·건너뛰기 (선택)
            const canUndo = n.state === 'done' && step !== null && !n.carried && step.id !== 'start_together' && step.id !== 'workout_end';
            const canRecord = n.state === 'pending' && step !== null && !step.required && mine;
            return (
              <li key={n.key + (n.carried ? '.c' : '')} className={`tgr tgr--${n.state}`} data-testid="tl-row">
                <span className="tgr__who" aria-hidden>{n.lane === 'joint' ? '💞' : <CatMark who={n.lane as PersonId} size="sm" />}</span>
                <span className="tgr__main">
                  <span className="tgr__line">
                    <b>{n.label}</b>
                    {r.minutes !== null && <span className="tgr__min"> {r.minutes}분</span>}
                    {n.carried && <small> (이전 계획에서 완료)</small>}
                  </span>
                  <small className="tgr__sub">{sub(n)}</small>
                  <small className="tgr__why">{n.explain}</small>
                </span>
                <span className={`tgr__time ${n.state === 'done' ? '' : 'est'}`}>
                  {rowTime(n)}
                  <small>{n.mark}</small>
                </span>
                <span className="tgr__acts">
                  {canUndo && (
                    <button className="btn btn--text tgr__undo" aria-label={`${n.label} 기록 취소`} onClick={() => act.onUndo(n)} data-testid="tl-undo">
                      ↩️ 취소
                    </button>
                  )}
                  {canRecord && step && (
                    <>
                      <button className="btn btn--text tgr__rec" aria-label={`${n.label} 실제로 기록하기 (선택)`} onClick={() => act.onRecord(n)} data-testid="tl-record">
                        {step.doneLabel}
                      </button>
                      <button className="btn btn--text tgr__skip" aria-label={`${n.label} 건너뛰기`} onClick={() => act.onSkip(n)} data-testid="tl-skip">
                        건너뛰기
                      </button>
                    </>
                  )}
                  {n.state === 'pending' && step !== null && !step.required && !mine && <small className="tgr__other">상대가 기록해요</small>}
                  {step?.required && n.state === 'pending' && <small className="tgr__other">{step.id === 'workout_end' ? '위 운동 카드에서 각자 기록해요' : '위 카드에서 기록해요'}</small>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

/**
 * 전체 일정(표시 묶음): 계산 엔진의 세부 단계는 그대로 두고, 의미 있는 일정 단위로 묶어서 보여 줘요.
 * - 기록을 마친 묶음과 "예상 시각이 지났지만 실제 미확인"인 묶음은 위쪽에 접어 두고, 지금과 앞으로의 일정이 먼저 보여요.
 * - 일반 단계는 안 눌러도 돼요. 누르지 않은 단계는 완료로 처리하지 않아요.
 */
export function TimelineSheet({ onClose }: { onClose: () => void }) {
  const day = useDay();
  const toast = useToast();
  const tl = day.live.timeline;
  const now: Minute = day.now;
  const groups = useMemo(() => groupTimeline(tl, day.state.settings), [tl, day.state.settings]);

  const resolved = (g: TimelineGroup) => g.state === 'done' || g.state === 'skipped' || g.state === 'resolved';
  const finished = groups.filter(resolved);
  // 예정 시각이 이미 지났고 기록이 필요한 단계도 없는, 실제 미확인 묶음
  const past = groups.filter((g) => !resolved(g) && !g.needsRecord && g.end !== null && g.end < now);
  const upcoming = groups.filter((g) => !resolved(g) && !past.includes(g));

  const [showDone, setShowDone] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const currentKey = upcoming.find((g) => (g.state === 'pending' || g.state === 'partial') && !g.needsRecord)?.key ?? null;
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  const lane = (n: TimelineNode) => (n.lane === 'joint' ? 'joint' : (n.lane as PersonId));
  const act: RowActions = {
    viewer: day.viewer,
    onUndo: (n) => {
      const r = day.undo(lane(n), n.step!.id);
      toast(r.ok ? '기록을 취소했어요' : ERROR_TEXT[r.reason]);
    },
    onRecord: (n) => {
      const r = day.complete(lane(n), n.step!.id);
      toast(r.ok ? `${n.label} 기록했어요 (${fmt(day.now)})` : ERROR_TEXT[r.reason]);
    },
    onSkip: (n) => {
      const r = day.skip(lane(n), n.step!.id);
      toast(r.ok ? '건너뛰기는 완료가 아니에요. 시간에서만 빼요' : ERROR_TEXT[r.reason]);
    },
  };
  const item = (g: TimelineGroup) => <GroupItem key={g.key} g={g} open={!!open[g.key]} current={g.key === currentKey} onToggle={() => toggle(g.key)} act={act} />;

  return (
    <Sheet open onClose={onClose} title="전체 일정">
      <div className="tl-legend" aria-label="구분">
        <span className="tl-legend__chip tl-legend__chip--yangcho"><CatMark who="yangcho" size="sm" /> 양초</span>
        <span className="tl-legend__chip tl-legend__chip--tawi"><CatMark who="tawi" size="sm" /> 타위</span>
        <span className="tl-legend__chip tl-legend__chip--joint">💞 함께</span>
      </div>
      <p className="tiny">
        일정은 자동으로 예상해서 보여줘요. 누르지 않아도 돼요(기록은 선택). ✓ 실제 기록 · ~ 예상. 안 누른 단계는 완료로 처리하지 않아요.
      </p>
      {tl.overdueCount > 0 && (
        <div className="strip">
          <span>예상 시각이 지난 일정 {tl.overdueCount}개(두 사람 합계) · 실제 미확인</span>
          <button className="btn btn--small btn--ghost" onClick={() => { day.recalc(); toast('지금 시각 기준으로 남은 일정을 다시 계산했어요'); }} data-testid="recalc">
            지금 기준으로 다시 계산
          </button>
        </div>
      )}
      {tl.status === 'blocked' && tl.blockers.map((b) => <p key={b.message} className="tiny">⚠️ {b.message}</p>)}

      {finished.length > 0 && (
        <button className="tl-done-toggle" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone} data-testid="tl-done-toggle">
          ✓ 기록을 마친 일정 {finished.length}개 {showDone ? '▴' : '▾'}
        </button>
      )}
      {past.length > 0 && (
        <button className="tl-done-toggle tl-done-toggle--past" onClick={() => setShowPast((v) => !v)} aria-expanded={showPast} data-testid="tl-past-toggle">
          예상 시각 지남 · 실제 미확인 {past.length}개 {showPast ? '▴' : '▾'}
        </button>
      )}
      <ol className="tl tl--groups">
        {showDone && finished.map(item)}
        {showPast && past.map(item)}
        <li className="tl__now" data-testid="tl-now">▶ 지금 {fmt(now)}</li>
        {upcoming.map(item)}
        {upcoming.length === 0 && <li className="tl__empty">남은 일정이 없어요 🎉</li>}
      </ol>
    </Sheet>
  );
}

import { useState } from 'react';
import type { WorkoutHistoryEvent, WorkoutSessionRow } from '@/lib/south-america/domain/day/workout';
import { LEGACY_JOINT_END_LABEL } from '@/lib/south-america/domain/day/session';
import { planMinuteOfInstant } from '@/lib/south-america/domain/time';
import { PEOPLE, type PersonId } from '@/lib/south-america/domain/types';
import { CatMark } from '../common/CatMark';
import { Sheet } from '../common/Sheet';
import { useDay } from '../../store/dayStore';
import { dateLabel, whenText } from '../today/format';
import { WorkoutTimeSheet, type WorkoutSheetTarget } from './WorkoutTimeSheet';

const PERSONS: readonly PersonId[] = ['yangcho', 'tawi'];
const KIND_WORD = { recorded: '기록', time_edited: '시각 수정', undone: '취소', restored: '다시 기록' } as const;

function statusText(row: WorkoutSessionRow): string {
  const { view } = row;
  const n = PERSONS.filter((p) => view.completions[p]).length;
  return view.status === 'complete' && view.completedAt !== null ? `🐱🐱 둘 다 운동 완료! · ${whenText(row.day, view.completedAt, false)}` : n === 0 ? '두 사람 모두 미기록' : `${n}/2 완료`;
}

/** 이 순간(ISO)을 그 세션 날짜 기준의 "10/17(토) 09:00"으로 */
const at = (row: WorkoutSessionRow, iso: string): string => {
  try {
    return whenText(row.day, planMinuteOfInstant(row.day, iso), true);
  } catch {
    return '';
  }
};

function eventText(row: WorkoutSessionRow, e: WorkoutHistoryEvent): string {
  const who = PEOPLE[e.person].name;
  const by = PEOPLE[e.by].name;
  const w = (m: number | null) => (m === null ? '' : whenText(row.day, m, false));
  const detail =
    e.kind === 'time_edited' && e.prevActualAt !== null ? ` ${w(e.prevActualAt)} → ${w(e.actualAt)}` : e.kind === 'undone' ? '' : e.actualAt !== null ? ` ${w(e.actualAt)}` : '';
  return `${at(row, e.at)} · ${by}가 ${who}의 운동 완료 ${KIND_WORD[e.kind]}${detail}`;
}

/**
 * 지난 운동 시트 [4단계]: 보관된 모든 날과 오늘의 운동 세션을 최신 날짜부터 보여 주고(기간 제한 없음),
 * 한 세션을 열어 사람별 완료·입력자·이력을 보고 기록·수정·취소·다시 기록을 해요.
 * 기록·수정은 오늘 탭과 같은 WorkoutTimeSheet와 같은 도메인 동작을 쓰고, 그 날짜(원래 세션 ID)만 바뀌어요.
 */
export function PastWorkoutsSheet({ onClose }: { onClose: () => void }) {
  const day = useDay();
  const [selected, setSelected] = useState<string | null>(null);
  const [target, setTarget] = useState<WorkoutSheetTarget | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // 시각 시트가 떠 있는 동안에는 목록 시트를 접어 두고(선택한 날짜는 기억), 닫으면 그 자리로 돌아와요
  if (target) return <WorkoutTimeSheet key={`${target.onDay ?? 'today'}:${target.person}:${target.mode}`} target={target} onClose={() => setTarget(null)} />;

  const rows = day.workoutSessions;
  const row = selected ? rows.find((r) => r.day === selected) ?? null : null;

  if (row) {
    const open = (person: PersonId, mode: 'record' | 'edit') => setTarget({ person, mode, onDay: row.day });
    return (
      <Sheet open onClose={onClose} title={`${dateLabel(row.day)} 운동`}>
        <button className="btn btn--text pw-back" onClick={() => { setSelected(null); setShowHistory(false); }} data-testid="pw-back">‹ 목록</button>
        <p className="pw-head" data-testid="pw-status">
          {statusText(row)}
          <small>❤️ {whenText(row.day, row.startedAt, false)} 시작 · {PEOPLE[row.startedBy].name}가 시작</small>
        </p>
        {PERSONS.map((p) => {
          const c = row.view.completions[p];
          const cancelled = row.cancelled[p];
          return (
            <div className="pw-person" key={p} data-testid={`pw-person-${p}`}>
              <div className="pw-person__main">
                <CatMark who={p} size="md" />
                <div>
                  <p className="pw-person__name">
                    <b>{PEOPLE[p].name}</b>
                    {c ? <span className="wk__ok"> ✓{whenText(row.day, c.actualCompletedAt, false)} 완료</span> : <span> {cancelled ? '취소됨' : '미기록'}</span>}
                  </p>
                  <p className="pw-person__note">
                    {c
                      ? c.proxy
                        ? `${PEOPLE[c.completedBy].name}가 ${c.recordedAt ? `${at(row, c.recordedAt)}에 ` : ''}대신 입력`
                        : c.recordedAt ? `직접 기록 · 입력 ${at(row, c.recordedAt)}` : '직접 기록'
                      : cancelled ? `완료 기록을 취소했어요 (이전 ${whenText(row.day, cancelled.actualAt, false)})` : '아직 기록되지 않았어요'}
                  </p>
                </div>
              </div>
              {c ? (
                <button className="btn btn--small btn--ghost" onClick={() => open(p, 'edit')} aria-label={`${row_label(row)} ${PEOPLE[p].name} 운동 완료 수정 또는 취소`} data-testid={`pw-edit-${p}`}>수정</button>
              ) : (
                <button className="btn btn--small btn--ghost" onClick={() => open(p, 'record')} aria-label={`${row_label(row)} ${PEOPLE[p].name} 운동 완료 기록하기`} data-testid={`pw-record-${p}`}>{cancelled ? '다시 기록' : '기록하기'}</button>
              )}
            </div>
          );
        })}
        {row.legacy && <p className="tiny" data-testid="pw-legacy">{LEGACY_JOINT_END_LABEL}</p>}
        <button className="btn btn--text pw-hist-toggle" onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory} data-testid="pw-history-toggle">
          수정 이력 ({row.events.length}) {showHistory ? '▴' : '▾'}
        </button>
        {showHistory && (
          <ul className="wk-hist pw-hist" data-testid="pw-history">
            {row.events.length === 0 && <li>아직 이력이 없어요</li>}
            {row.events.map((e, i) => <li key={i}>{eventText(row, e)}</li>)}
          </ul>
        )}
      </Sheet>
    );
  }

  return (
    <Sheet open onClose={onClose} title="지난 운동">
      {rows.length === 0 ? (
        <p className="tiny" data-testid="pw-empty">아직 함께 운동한 기록이 없어요. ❤️ 함께 운동 시작을 누른 날부터 여기에 쌓여요.</p>
      ) : (
        <ul className="pw-list" data-testid="pw-list">
          {rows.map((r) => (
            <li key={r.day}>
              <button className="pw-row" onClick={() => setSelected(r.day)} data-testid={`pw-row-${r.day}`} aria-label={`${row_label(r)} 운동 자세히 보기`}>
                <span className="pw-row__top">
                  <b>{dateLabel(r.day)}</b>
                  {r.day === day.state.day && <span className="chip chip--dim">오늘</span>}
                  <small>❤️ {whenText(r.day, r.startedAt, false)}</small>
                </span>
                <span className="pw-row__people">
                  {PERSONS.map((p) => {
                    const c = r.view.completions[p];
                    return (
                      <span key={p} className="pw-chip">
                        <CatMark who={p} size="sm" /> {PEOPLE[p].name} {c ? `✓${whenText(r.day, c.actualCompletedAt, false)}` : r.cancelled[p] ? '취소됨' : '미기록'}
                      </span>
                    );
                  })}
                </span>
                <span className="pw-row__status">{statusText(r)}{r.legacy ? ' · 이전 방식 기록 있음' : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

const row_label = (r: WorkoutSessionRow): string => dateLabel(r.day);

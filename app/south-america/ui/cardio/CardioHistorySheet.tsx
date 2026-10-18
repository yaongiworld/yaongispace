// 유산소 기록·누적 조회 시트 [5-B]: 개인별·공동·이번 주·시즌 누적, 날짜별 목록(❤️ 있는 날과 혼자 운동한 날 함께), 날짜별 상세.
// 지난 운동 시트(세션 중심)와는 별개로 두었어요. 합계는 "실제 운동 거리"이고 Adventure KM(게임 속 거리)과 별개예요.
import { useState } from 'react';
import { CARDIO_EXERCISES, cardioLabel } from '@/lib/south-america/config/cardio';
import { formatKm } from '@/lib/south-america/domain/exercise/distance';
import { listWorkoutDays } from '@/lib/south-america/domain/exercise/days';
import { cardioTotalsView, dayDistance } from '@/lib/south-america/domain/exercise/summary';
import { PEOPLE, type PersonId } from '@/lib/south-america/domain/types';
import { useClock } from '../../store/clock';
import { useDay } from '../../store/dayStore';
import { useLogs } from '../../store/logsStore';
import { CatMark } from '../common/CatMark';
import { Sheet } from '../common/Sheet';
import { useToast } from '../common/Toast';
import { dateLabel } from '../today/format';
import { LOG_ERROR_TEXT } from './cardioForm';
import { CardioRow } from './CardioRow';

type Filter = 'all' | PersonId;
const km = (m: number) => `${formatKm(m)}km`;

export function CardioHistorySheet({ selectedDay, onSelectDay, onClose, onEdit, onRecord }: { selectedDay: string | null; onSelectDay: (d: string | null) => void; onClose: () => void; onEdit: (logId: string) => void; onRecord: (day: string) => void }) {
  const day = useDay();
  const logs = useLogs();
  const { today } = useClock();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('all');
  const { book } = logs;
  const totals = cardioTotalsView(book, today);

  // 날짜별 목록: ❤️ 세션이 있는 날 ∪ 유산소 기록이 있는 날 중, 보여 줄 유산소 기록이 있는 날만
  const rows = listWorkoutDays(day.workoutSessions, book)
    .map((r) => ({ ...r, cardio: r.cardio.filter((l) => filter === 'all' || l.person === filter) }))
    .filter((r) => r.cardio.length > 0);

  const restore = (logId: string) => {
    const r = logs.controller.restore(logId, { by: day.viewer, at: day.instantNow().toISOString() });
    toast(r.ok ? (r.changed ? '기록을 복구했어요' : '이미 유효한 기록이에요') : LOG_ERROR_TEXT[r.reason]);
  };

  const filterBar = (
    <div className="seg" role="group" aria-label="운동한 사람별 보기">
      {(['all', 'yangcho', 'tawi'] as const).map((f) => (
        <button key={f} className={`seg__btn ${filter === f ? 'seg__btn--on' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)} data-testid={`cardio-filter-${f}`}>
          {f === 'all' ? '전체' : <><CatMark who={f} size="sm" /> {PEOPLE[f].name}</>}
        </button>
      ))}
    </div>
  );

  const row = selectedDay ? rows.find((r) => r.day === selectedDay) ?? null : null;
  if (selectedDay) {
    const all = listWorkoutDays(day.workoutSessions, book).find((r) => r.day === selectedDay) ?? null;
    const list = (all?.cardio ?? []).filter((l) => filter === 'all' || l.person === filter);
    const dd = dayDistance(list);
    return (
      <Sheet open onClose={onClose} title={`${dateLabel(selectedDay)} 유산소`}>
        <button className="btn btn--text data__back" onClick={() => onSelectDay(null)} data-testid="cardio-back">‹ 목록</button>
        {filterBar}
        <p className="cardio__daysum" data-testid="cardio-day-sum">
          {all?.session ? '❤️ 함께 운동한 날' : '혼자 운동한 날 (❤️ 없음)'} · 양초 {km(dd.yangcho)} · 타위 {km(dd.tawi)} · 공동 <b>{km(dd.joint)}</b>
        </p>
        {list.length === 0 ? <p className="tiny">이 날 보여 줄 유산소 기록이 없어요.</p> : (
          <ul className="cardio__list" data-testid="cardio-day-list">
            {list.map((l) => <CardioRow key={l.logId} log={l} onEdit={onEdit} onRestore={restore} />)}
          </ul>
        )}
        <div className="sheet__actions"><button className="btn btn--primary" onClick={() => onRecord(selectedDay)} data-testid="cardio-record-on-day">이 날짜에 기록하기</button></div>
        {row === null && all === null && <p className="tiny">이 날의 기록을 찾을 수 없어요.</p>}
      </Sheet>
    );
  }

  const S = totals.season;
  const W = totals.week;
  return (
    <Sheet open onClose={onClose} title="🏃 유산소 기록·누적">
      <div className="cardio__totals" data-testid="cardio-totals">
        <h3 className="set__h">시즌 누적 <small>(시즌 1)</small></h3>
        <p data-testid="cardio-season">양초 <b data-testid="cardio-season-yangcho">{km(S.yangchoM)}</b> · 타위 <b data-testid="cardio-season-tawi">{km(S.tawiM)}</b> · 공동 <b data-testid="cardio-season-joint">{km(S.jointM)}</b> <small>({S.count}건)</small></p>
        <h3 className="set__h">이번 주 <small>({dateLabel(W.weekStart)} ~ {dateLabel(W.weekEnd)})</small></h3>
        <p data-testid="cardio-week">양초 <b data-testid="cardio-week-yangcho">{km(W.yangchoM)}</b> · 타위 <b data-testid="cardio-week-tawi">{km(W.tawiM)}</b> · 공동 <b data-testid="cardio-week-joint">{km(W.jointM)}</b></p>
        {CARDIO_EXERCISES.some((e) => (S.byExercise[e.id] ?? 0) > 0) && (
          <ul className="cardio__byex" data-testid="cardio-byex">
            {CARDIO_EXERCISES.filter((e) => (S.byExercise[e.id] ?? 0) > 0).map((e) => <li key={e.id}>{cardioLabel(e.id)} {km(S.byExercise[e.id] ?? 0)}</li>)}
          </ul>
        )}
        <p className="tiny" data-testid="cardio-km-note">실제로 운동한 거리를 그대로 더한 값이에요(환산 없음). 게임 속 Adventure KM과는 별개예요.</p>
      </div>

      <h3 className="set__h">날짜별 기록</h3>
      {filterBar}
      {rows.length === 0 ? (
        <p className="tiny" data-testid="cardio-empty">아직 유산소 기록이 없어요.</p>
      ) : (
        <ul className="cardio__days-list" data-testid="cardio-days">
          {rows.map((r) => {
            const dd = dayDistance(r.cardio);
            return (
              <li key={r.day}>
                <button className="pw-row" onClick={() => onSelectDay(r.day)} data-testid={`cardio-day-${r.day}`} aria-label={`${dateLabel(r.day)} 유산소 자세히 보기`}>
                  <span className="pw-row__top">
                    <b>{dateLabel(r.day)}</b>
                    {r.day === today && <span className="chip chip--dim">오늘</span>}
                    <small>{r.session ? '❤️ 함께 운동한 날' : '혼자 운동한 날'}</small>
                  </span>
                  <span className="pw-row__status">양초 {km(dd.yangcho)} · 타위 {km(dd.tawi)} · 공동 {km(dd.joint)} · {r.cardio.length}건{r.cardio.some((l) => l.status === 'cancelled') ? ' (취소 포함)' : ''}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}

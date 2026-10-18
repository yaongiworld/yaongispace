// 운동 탭의 실제 유산소 기록 카드 [5-B]. 운동 완료 현황 카드 아래, 예시 구역(저장되지 않는 세트 예시) 위에 두는 "진짜 기록"이에요.
// 유산소 기록은 ❤️ 공동 세션·운동 완료 기록과 완전히 별개예요: 기록한다고 세션이나 완료가 생기지 않아요.
import { useState } from 'react';
import { formatKm } from '@/lib/south-america/domain/exercise/distance';
import { cardioOfDay, cardioTotalsView } from '@/lib/south-america/domain/exercise/summary';
import { PEOPLE, type PersonId } from '@/lib/south-america/domain/types';
import { useClock } from '../../store/clock';
import { useDay } from '../../store/dayStore';
import { useLogs } from '../../store/logsStore';
import { Card } from '../common/Card';
import { useToast } from '../common/Toast';
import { dateLabel } from '../today/format';
import { LOG_ERROR_TEXT } from './cardioForm';
import { CardioFormSheet, type CardioFormTarget } from './CardioFormSheet';
import { CardioHistorySheet } from './CardioHistorySheet';
import { CardioRow } from './CardioRow';

type View = null | { k: 'form'; target: CardioFormTarget; back: string | null | undefined } | { k: 'history'; day: string | null };

export function CardioCard({ page }: { page: PersonId }) {
  const day = useDay();
  const logs = useLogs();
  const { today } = useClock();
  const toast = useToast();
  const [view, setView] = useState<View>(null);
  const { book } = logs;
  const todays = cardioOfDay(book, today);
  const totals = cardioTotalsView(book, today);
  const writeBlocked = logs.blocked || logs.frozen;
  const noticeText = logs.notices.map((n) => n.message);

  const restore = (logId: string) => {
    const r = logs.controller.restore(logId, { by: day.viewer, at: day.instantNow().toISOString() });
    toast(r.ok ? (r.changed ? '기록을 복구했어요' : '이미 유효한 기록이에요') : LOG_ERROR_TEXT[r.reason]);
  };
  // 시트를 열었던 곳(조회 시트의 날짜)으로 돌아가요
  const backOf = (v: View): string | null | undefined => (v && v.k === 'history' ? v.day : undefined);

  return (
    <>
      <Card className="cardio" data-testid="cardio-card">
        <p className="cardio__title">🏃 유산소 <small>오늘 {dateLabel(today)}</small></p>
        {writeBlocked && <p className="data__warn" role="alert" data-testid="cardio-card-blocked">⚠️ {LOG_ERROR_TEXT.storage_blocked}</p>}
        {noticeText.length > 0 && <p className="tiny" data-testid="cardio-notices">{noticeText.join(' ')}</p>}
        {todays.length === 0 ? (
          <p className="tiny" data-testid="cardio-empty-today">오늘 기록한 유산소가 아직 없어요.</p>
        ) : (
          <ul className="cardio__list" data-testid="cardio-today-list">
            {todays.map((l) => <CardioRow key={l.logId} log={l} onEdit={(id) => setView({ k: 'form', target: { mode: 'edit', logId: id }, back: undefined })} onRestore={restore} />)}
          </ul>
        )}
        <p className="cardio__sum" data-testid="cardio-sum">
          시즌 누적 공동 <b data-testid="cardio-card-season">{formatKm(totals.season.jointM)}km</b> · 이번 주 <b data-testid="cardio-card-week">{formatKm(totals.week.jointM)}km</b>
        </p>
        <p className="tiny">실제로 운동한 거리예요 (Adventure KM과 별개).</p>
        <div className="cardio__actions">
          <button className="btn btn--primary" onClick={() => setView({ k: 'form', target: { mode: 'new', person: page }, back: undefined })} disabled={writeBlocked} data-testid="cardio-open">
            유산소 기록하기{page !== day.viewer ? ` (${PEOPLE[page].name})` : ''}
          </button>
          <button className="btn btn--ghost" onClick={() => setView({ k: 'history', day: null })} data-testid="cardio-history-open">전체 기록·누적 ›</button>
        </div>
      </Card>

      {view?.k === 'form' && (
        <CardioFormSheet
          key={view.target.mode === 'edit' ? `edit:${view.target.logId}` : `new:${view.target.person}:${view.target.day ?? ''}`}
          target={view.target}
          onClose={() => setView(view.back === undefined ? null : { k: 'history', day: view.back })}
        />
      )}
      {view?.k === 'history' && (
        <CardioHistorySheet
          selectedDay={view.day}
          onSelectDay={(d) => setView({ k: 'history', day: d })}
          onClose={() => setView(null)}
          onEdit={(id) => setView({ k: 'form', target: { mode: 'edit', logId: id }, back: backOf(view) })}
          onRecord={(d) => setView({ k: 'form', target: { mode: 'new', person: page, day: d }, back: backOf(view) })}
        />
      )}
    </>
  );
}

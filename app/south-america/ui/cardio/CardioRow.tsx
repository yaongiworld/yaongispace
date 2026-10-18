// 유산소 기록 한 줄 [5-B]: 운동한 사람, 종목·시간·거리, 입력자(대신 입력이면 표시), 취소됨. 카드와 조회 시트가 같이 써요.
import { cardioLabel } from '@/lib/south-america/config/cardio';
import { formatKm } from '@/lib/south-america/domain/exercise/distance';
import type { CardioLog } from '@/lib/south-america/domain/exercise/types';
import { PEOPLE } from '@/lib/south-america/domain/types';
import { CatMark } from '../common/CatMark';

export function CardioRow({ log, onEdit, onRestore, showDay }: { log: CardioLog; onEdit?: (id: string) => void; onRestore?: (id: string) => void; showDay?: string }) {
  const off = log.status === 'cancelled';
  const proxy = log.enteredBy !== log.person;
  return (
    <li className={`cardio__row ${off ? 'cardio__row--off' : ''}`} data-testid={`cardio-row-${log.logId}`} data-status={log.status}>
      <div className="cardio__main">
        <CatMark who={log.person} size="sm" />
        <div>
          <p className="cardio__line">
            <b>{PEOPLE[log.person].name}</b> {cardioLabel(log.exerciseId, log.customName)} · {log.minutes}분 · <b>{formatKm(log.distanceM)}km</b>
            {off && <span className="chip chip--dim" data-testid={`cardio-off-${log.logId}`}> 취소됨</span>}
          </p>
          {(proxy || showDay) && (
            <p className="cardio__note">
              {showDay ? `${showDay} ` : ''}
              {proxy ? `${PEOPLE[log.enteredBy].name}가 대신 입력` : ''}
            </p>
          )}
        </div>
      </div>
      {off ? (
        onRestore && <button className="btn btn--small btn--ghost" onClick={() => onRestore(log.logId)} data-testid={`cardio-restore-${log.logId}`} aria-label={`${PEOPLE[log.person].name} ${cardioLabel(log.exerciseId, log.customName)} 기록 복구`}>복구</button>
      ) : (
        onEdit && <button className="btn btn--small btn--ghost" onClick={() => onEdit(log.logId)} data-testid={`cardio-edit-${log.logId}`} aria-label={`${PEOPLE[log.person].name} ${cardioLabel(log.exerciseId, log.customName)} 기록 수정 또는 취소`}>수정</button>
      )}
    </li>
  );
}

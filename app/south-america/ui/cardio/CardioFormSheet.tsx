// 유산소 기록하기·수정 시트 [5-B]. 값은 [기록하기]/[저장]을 눌러야 저장돼요 (지난번 값 제안·미리 채운 값도 자동 저장 없음, D-063).
// 모든 검사는 5-A 도메인 규칙을 따르고, 저장에 실패하면 저장된 것처럼 보이지 않고 이유를 알려요.
import { useMemo, useRef, useState } from 'react';
import { CARDIO_EXERCISES, OTHER_EXERCISE_ID, cardioLabel, type CardioExerciseId } from '@/lib/south-america/config/cardio';
import { formatKm } from '@/lib/south-america/domain/exercise/distance';
import { findSimilarLogs, findLog } from '@/lib/south-america/domain/exercise/logs';
import { isCardioLog, type CardioLog, type LogRevision } from '@/lib/south-america/domain/exercise/types';
import { addDays } from '@/lib/south-america/domain/time';
import { PEOPLE, type PersonId } from '@/lib/south-america/domain/types';
import { useClock } from '../../store/clock';
import { useDay } from '../../store/dayStore';
import { useLogs } from '../../store/logsStore';
import { CatMark } from '../common/CatMark';
import { Sheet } from '../common/Sheet';
import { useToast } from '../common/Toast';
import { dateLabel } from '../today/format';
import { LOG_ERROR_TEXT, dayInputMax, isUntouched, lastExerciseOf, newLogId, parseDraft, stepKm, stepMinutes, suggestFor, type CardioDraft } from './cardioForm';

export type CardioFormTarget = { mode: 'new'; person: PersonId; day?: string } | { mode: 'edit'; logId: string };

const REV_WORD = { recorded: '기록', edited: '수정', cancelled: '취소', restored: '복구' } as const;
const FIELD_WORD = { day: '날짜', exerciseId: '종류', customName: '운동 이름', minutes: '시간', distanceM: '거리' } as const;

function revisionText(r: LogRevision): string {
  const by = PEOPLE[r.by].name;
  if (r.kind === 'edited') {
    const parts = r.changes.map((c) => {
      const show = (v: string | number | null) => (c.field === 'distanceM' && typeof v === 'number' ? `${formatKm(v)}km` : c.field === 'minutes' ? `${v}분` : c.field === 'exerciseId' && typeof v === 'string' ? cardioLabel(v as CardioExerciseId) : String(v ?? '없음'));
      return `${FIELD_WORD[c.field]} ${show(c.before)} → ${show(c.after)}`;
    });
    return `${by}가 수정 · ${parts.join(', ')}`;
  }
  return `${by}가 ${REV_WORD[r.kind]}`;
}

const draftOfLog = (l: CardioLog): CardioDraft => ({ person: l.person, exerciseId: l.exerciseId, customName: l.customName ?? '', minutes: String(l.minutes), km: formatKm(l.distanceM), day: l.day });

export function CardioFormSheet({ target, onClose }: { target: CardioFormTarget; onClose: () => void }) {
  const day = useDay();
  const logs = useLogs();
  const { today } = useClock();
  const toast = useToast();
  const { book } = logs;
  const viewer = day.viewer;
  const editing = target.mode === 'edit' ? findLog(book, target.logId) : undefined;
  const editLog = editing && isCardioLog(editing) ? editing : null;

  // 시트를 열 때 한 번만 만들어요: 같은 시트에서 두 번 눌러도 같은 ID라서 한 건만 저장돼요
  const [logId] = useState(() => (target.mode === 'new' ? newLogId() : target.logId));
  const [draft, setDraft] = useState<CardioDraft>(() => {
    if (editLog) return draftOfLog(editLog);
    const person = target.mode === 'new' ? target.person : viewer;
    const d = target.mode === 'new' && target.day ? target.day : today;
    const last = lastExerciseOf(book, person);
    const base: CardioDraft = { person, exerciseId: last?.exerciseId ?? null, customName: last?.customName ?? '', minutes: '', km: '', day: d };
    const s = suggestFor(book, person, base.exerciseId, base.customName);
    return s ? { ...base, minutes: s.minutes, km: s.km } : base;
  });
  const touched = useRef({ minutes: false, km: false });
  const [attempted, setAttempted] = useState(false);
  const [similar, setSimilar] = useState<CardioLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const isNew = target.mode === 'new';
  const parsed = useMemo(() => parseDraft(draft, today), [draft, today]);
  const untouched = isUntouched(draft);
  const errors = parsed.ok ? {} : parsed.errors;
  const writeBlocked = logs.blocked || logs.frozen;
  const suggestion = isNew ? suggestFor(book, draft.person, draft.exerciseId, draft.customName) : null;
  const suggestDiffers = suggestion !== null && (suggestion.minutes !== draft.minutes || suggestion.km !== draft.km);

  /** 입력이 바뀌면 중복 안내와 이전 오류는 다시 계산해요 */
  const change = (patch: Partial<CardioDraft>, from: 'minutes' | 'km' | 'other' = 'other') => {
    if (from !== 'other') touched.current[from] = true;
    setSimilar(null);
    setError(null);
    setErrorCode(null);
    setDraft((d) => ({ ...d, ...patch }));
  };

  /** 사람이나 종목을 바꾸면 같은 사람·같은 종목의 지난번 값을 미리 채워요 (직접 고친 칸은 건드리지 않아요) */
  const withSuggestion = (next: CardioDraft): CardioDraft => {
    if (!isNew) return next;
    const s = suggestFor(book, next.person, next.exerciseId, next.customName);
    return {
      ...next,
      minutes: touched.current.minutes ? next.minutes : s ? s.minutes : '',
      km: touched.current.km ? next.km : s ? s.km : '',
    };
  };
  const pick = (patch: Partial<CardioDraft>) => {
    setSimilar(null);
    setError(null);
    setErrorCode(null);
    setDraft((d) => withSuggestion({ ...d, ...patch }));
  };

  const submit = (ack: boolean) => {
    if (!parsed.ok) {
      setAttempted(true);
      return;
    }
    const v = parsed.value;
    if (!ack) {
      const found = findSimilarLogs(book, { person: v.person, day: v.day, exerciseId: v.exerciseId, customName: v.customName, minutes: v.minutes, distanceM: v.distanceM, exceptLogId: logId });
      if (found.length > 0) {
        setSimilar(found);
        return;
      }
    }
    const at = day.instantNow().toISOString();
    const r = isNew
      ? logs.controller.record({ logId, person: v.person, enteredBy: viewer, recordedAt: at, day: v.day, exerciseId: v.exerciseId, customName: v.customName, minutes: v.minutes, distanceM: v.distanceM })
      : logs.controller.edit(logId, { day: v.day, exerciseId: v.exerciseId, customName: v.customName, minutes: v.minutes, distanceM: v.distanceM }, { by: viewer, at });
    if (!r.ok) {
      setSimilar(null);
      setError(LOG_ERROR_TEXT[r.reason]);
      setErrorCode(r.reason);
      return;
    }
    toast(!r.changed ? (isNew ? '이미 기록돼 있어요' : '바뀐 내용이 없어요') : isNew ? `${PEOPLE[v.person].name}의 유산소 ${formatKm(v.distanceM)}km 기록했어요` : '기록을 수정했어요');
    onClose();
  };

  const cancelLog = () => {
    if (!editLog) return;
    const r = logs.controller.cancel(editLog.logId, { by: viewer, at: day.instantNow().toISOString() });
    if (!r.ok) {
      setError(LOG_ERROR_TEXT[r.reason]);
      setErrorCode(r.reason);
      setConfirmCancel(false);
      return;
    }
    toast('기록을 취소했어요 (이력은 남아 있어요)');
    onClose();
  };

  const title = isNew ? '🏃 유산소 기록하기' : '🏃 유산소 기록 수정';
  if (!isNew && !editLog) {
    return (
      <Sheet open onClose={onClose} title={title}>
        <p className="tiny" role="alert">기록을 찾을 수 없어요.</p>
      </Sheet>
    );
  }
  if (editLog && editLog.status === 'cancelled') {
    return (
      <Sheet open onClose={onClose} title={title}>
        <p className="tiny" role="status" data-testid="cardio-cancelled-note">이 기록은 취소돼 있어요. 먼저 복구한 뒤에 고칠 수 있어요.</p>
        <div className="sheet__actions"><button className="btn btn--primary" onClick={onClose}>닫기</button></div>
      </Sheet>
    );
  }

  const person = draft.person;
  const yesterday = addDays(today, -1);
  const showErr = (k: 'minutes' | 'km') => errors[k] && (attempted || !untouched[k]);

  return (
    <Sheet open onClose={onClose} title={title}>
      {writeBlocked && <p className="data__warn" role="alert" data-testid="cardio-blocked">⚠️ {LOG_ERROR_TEXT.storage_blocked}</p>}

      <h3 className="set__h">운동한 사람</h3>
      {isNew ? (
        <div className="seg" role="group" aria-label="운동한 사람">
          {(['yangcho', 'tawi'] as const).map((p) => (
            <button key={p} className={`seg__btn ${person === p ? 'seg__btn--on' : ''}`} aria-pressed={person === p} onClick={() => pick({ person: p })} data-testid={`cardio-person-${p}`}>
              <CatMark who={p} size="sm" /> {PEOPLE[p].name}
            </button>
          ))}
        </div>
      ) : (
        <p className="cardio__fixed" data-testid="cardio-person-fixed"><CatMark who={person} size="sm" /> <b>{PEOPLE[person].name}</b> <small>운동한 사람은 바꿀 수 없어요. 잘못 골랐다면 이 기록을 취소하고 다시 기록해요.</small></p>
      )}
      {person !== viewer && <p className="tiny" data-testid="cardio-proxy-note">입력은 {PEOPLE[viewer].name}(나)로 기록돼요</p>}

      <h3 className="set__h">운동 종류</h3>
      <div className="cardio__chips" role="group" aria-label="운동 종류">
        {CARDIO_EXERCISES.map((e) => (
          <button key={e.id} className={`cardio__chip ${draft.exerciseId === e.id ? 'cardio__chip--on' : ''}`} aria-pressed={draft.exerciseId === e.id} onClick={() => pick({ exerciseId: e.id })} data-testid={`cardio-ex-${e.id}`}>
            {e.label}
          </button>
        ))}
      </div>
      {attempted && errors.exercise && <p className="tiny data__err" data-testid="cardio-err-exercise">{errors.exercise}</p>}
      {draft.exerciseId === OTHER_EXERCISE_ID && (
        <>
          <input className="cardio__text" placeholder="운동 이름 (1~30글자)" value={draft.customName} onChange={(e) => pick({ customName: e.target.value })} aria-label="운동 이름" data-testid="cardio-custom-name" />
          {errors.customName && (attempted || draft.customName !== '') && <p className="tiny data__err" data-testid="cardio-err-name">{errors.customName}</p>}
        </>
      )}

      <h3 className="set__h">운동 시간 <small>(분)</small></h3>
      <div className="cardio__num">
        <button className="stepper__btn" onClick={() => change({ minutes: stepMinutes(draft.minutes, -5) }, 'minutes')} aria-label="5분 줄이기" data-testid="cardio-minutes-minus5">－5</button>
        <button className="stepper__btn" onClick={() => change({ minutes: stepMinutes(draft.minutes, -1) }, 'minutes')} aria-label="1분 줄이기" data-testid="cardio-minutes-minus1">－</button>
        <input className="cardio__input" inputMode="numeric" value={draft.minutes} onChange={(e) => change({ minutes: e.target.value }, 'minutes')} placeholder="0" aria-label="운동 시간(분)" data-testid="cardio-minutes" />
        <button className="stepper__btn" onClick={() => change({ minutes: stepMinutes(draft.minutes, 1) }, 'minutes')} aria-label="1분 늘리기" data-testid="cardio-minutes-plus1">＋</button>
        <button className="stepper__btn" onClick={() => change({ minutes: stepMinutes(draft.minutes, 5) }, 'minutes')} aria-label="5분 늘리기" data-testid="cardio-minutes-plus5">＋5</button>
      </div>
      {showErr('minutes') && <p className="tiny data__err" data-testid="cardio-err-minutes">{errors.minutes}</p>}

      <h3 className="set__h">실제 운동 거리 <small>(km, 기구 화면 값)</small></h3>
      <div className="cardio__num">
        <button className="stepper__btn" onClick={() => change({ km: stepKm(draft.km, -1) }, 'km')} aria-label="1킬로미터 줄이기" data-testid="cardio-km-minus1">－1</button>
        <button className="stepper__btn" onClick={() => change({ km: stepKm(draft.km, -0.1) }, 'km')} aria-label="0.1킬로미터 줄이기" data-testid="cardio-km-minus01">－</button>
        <input className="cardio__input" inputMode="decimal" value={draft.km} onChange={(e) => change({ km: e.target.value }, 'km')} placeholder="0.0" aria-label="운동 거리(km)" data-testid="cardio-km" />
        <button className="stepper__btn" onClick={() => change({ km: stepKm(draft.km, 0.1) }, 'km')} aria-label="0.1킬로미터 늘리기" data-testid="cardio-km-plus01">＋</button>
        <button className="stepper__btn" onClick={() => change({ km: stepKm(draft.km, 1) }, 'km')} aria-label="1킬로미터 늘리기" data-testid="cardio-km-plus1">＋1</button>
      </div>
      {showErr('km') && <p className="tiny data__err" data-testid="cardio-err-km">{errors.km}</p>}
      <p className="tiny">0.1km 단위예요. 2.75처럼 더 자세한 값은 받지 않고 자동으로 반올림하지도 않아요.</p>

      {isNew && suggestion && (
        <div className="cardio__suggest" data-testid="cardio-suggest">
          <span>💡 {PEOPLE[draft.person].name}의 지난번 {cardioLabel(suggestion.log.exerciseId, suggestion.log.customName)} ({dateLabel(suggestion.log.day)}): <b>{suggestion.minutes}분 · {suggestion.km}km</b></span>
          <small>미리 채워 둔 값이에요. [기록하기]를 눌러야 저장돼요.</small>
          {suggestDiffers && (
            <button className="btn btn--small btn--ghost" onClick={() => { touched.current = { minutes: false, km: false }; change({ minutes: suggestion.minutes, km: suggestion.km }); }} data-testid="cardio-suggest-apply">지난번 값으로 채우기</button>
          )}
        </div>
      )}

      <h3 className="set__h">운동한 날</h3>
      <div className="cardio__days" role="group" aria-label="운동한 날">
        <button className={`cardio__chip ${draft.day === today ? 'cardio__chip--on' : ''}`} aria-pressed={draft.day === today} onClick={() => change({ day: today })} data-testid="cardio-day-today">오늘 {dateLabel(today)}</button>
        <button className={`cardio__chip ${draft.day === yesterday ? 'cardio__chip--on' : ''}`} aria-pressed={draft.day === yesterday} onClick={() => change({ day: yesterday })} data-testid="cardio-day-yesterday">어제 {dateLabel(yesterday)}</button>
        <input type="date" className="cardio__date" max={dayInputMax(today)} value={draft.day} onChange={(e) => change({ day: e.target.value })} aria-label="다른 날짜 고르기" data-testid="cardio-day-input" />
      </div>
      {errors.day && <p className="tiny data__err" data-testid="cardio-err-day">{errors.day}</p>}
      <p className="tiny">새벽 4시 전에는 전날이 &lsquo;오늘&rsquo;이에요. 지난 날짜도 기록할 수 있어요.</p>

      {similar && similar.length > 0 && (
        <div className="data__warn" role="alert" data-testid="cardio-similar">
          <b>⚠️ 같은 기록이 이미 있는 것 같아요</b>
          <ul>
            {similar.map((l) => (
              <li key={l.logId}>{PEOPLE[l.person].name} · {dateLabel(l.day)} · {cardioLabel(l.exerciseId, l.customName)} {l.minutes}분 {formatKm(l.distanceM)}km <small>({PEOPLE[l.enteredBy].name}가 입력)</small></li>
            ))}
          </ul>
          <p className="tiny">같은 운동을 두 번 입력한 것이 아니라면 그대로 {isNew ? '기록' : '저장'}해도 돼요.</p>
          <div className="data__btns">
            <button className="btn btn--small btn--ghost" onClick={() => setSimilar(null)} data-testid="cardio-similar-back">돌아가서 확인</button>
            <button className="btn btn--small btn--primary" onClick={() => submit(true)} data-testid="cardio-similar-confirm">그래도 {isNew ? '기록하기' : '저장하기'}</button>
          </div>
        </div>
      )}

      {error && (
        <div role="alert" data-testid="cardio-error">
          <p className="tiny data__err">{error}</p>
          {errorCode === 'storage_changed' && (
            <button className="btn btn--small btn--ghost" onClick={() => { logs.controller.reload(); toast('최신 기록을 불러왔어요'); onClose(); }} data-testid="cardio-reload">최신 기록 불러오기</button>
          )}
        </div>
      )}

      <div className="sheet__actions">
        <button className="btn btn--ghost" onClick={onClose} data-testid="cardio-close">닫기</button>
        <button className="btn btn--primary" onClick={() => submit(false)} disabled={!parsed.ok || writeBlocked || similar !== null} data-testid="cardio-submit">{isNew ? '기록하기' : '저장'}</button>
      </div>

      {editLog && (
        <div className="cardio__manage">
          {confirmCancel ? (
            <div className="data__box" data-testid="cardio-cancel-box">
              <p><b>이 기록을 취소할까요?</b></p>
              <p className="tiny">기록은 지워지지 않고 &lsquo;취소됨&rsquo;으로 남아요. 합계에서만 빠지고, 나중에 복구할 수 있어요.</p>
              <div className="data__btns">
                <button className="btn btn--small btn--ghost" onClick={() => setConfirmCancel(false)}>그만두기</button>
                <button className="btn btn--small btn--primary" onClick={cancelLog} disabled={writeBlocked} data-testid="cardio-cancel-yes">기록 취소하기</button>
              </div>
            </div>
          ) : (
            <button className="btn btn--text" onClick={() => setConfirmCancel(true)} data-testid="cardio-cancel">이 기록 취소하기</button>
          )}
          <button className="btn btn--text" onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory} data-testid="cardio-history-toggle">
            수정 이력 ({editLog.revisions.length}) {showHistory ? '▴' : '▾'}
          </button>
          {showHistory && (
            <ul className="wk-hist" data-testid="cardio-history">
              {editLog.revisions.map((r, i) => <li key={i}>{revisionText(r)}</li>)}
            </ul>
          )}
        </div>
      )}
    </Sheet>
  );
}

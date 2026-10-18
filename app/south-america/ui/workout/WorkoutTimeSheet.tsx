import { useMemo, useRef, useState } from 'react';
import type { ActionError } from '@/lib/south-america/domain/day/day';
import { cancelledWorkout, checkWorkoutTime, workoutTimeBounds } from '@/lib/south-america/domain/day/workout';
import { PEOPLE, type PersonId } from '@/lib/south-america/domain/types';
import { formatClock, planMinuteOfInstant, type Minute } from '@/lib/south-america/domain/time';
import { Sheet } from '../common/Sheet';
import { CatMark } from '../common/CatMark';
import { useToast } from '../common/Toast';
import { useDay } from '../../store/dayStore';
import { DIRECT_HINT, LONG_CONFIRM_MINUTES, needsLongConfirm, parseDirectDraft } from './directTime';
import { ERROR_TEXT, dateLabel, whenText } from '../today/format';

export type WorkoutSheetTarget = {
  /** 실제로 운동한 사람 */
  person: PersonId;
  /** record: 새로 기록 / edit: 기록한 시각 수정·취소 */
  mode: 'record' | 'edit';
  /** 지난 세션의 날짜. 없으면 오늘 세션이에요 */
  onDay?: string;
};

const STEP = 5;
const REVISION_WORD = { recorded: '기록', time_edited: '시각 수정', undone: '취소', restored: '다시 기록' } as const;

/**
 * 운동 완료 시각 시트: [아까 끝났어요] · 상대 대신 기록 · 완료 시각 수정/취소를 한 곳에서 해요.
 * 오늘 탭과 (4단계의) 지난 세션 화면이 같이 써요. 규칙(범위·날짜 확인·기록 동작)은 모두 domain/day/workout.ts의 것을 써요.
 * - 오늘 세션은 지금 시각으로 시작하고, 지난 세션은 오늘 시각을 쓰지 않고 시각을 직접 고르게 해요.
 * - 어떤 경우에도 [기록]을 눌러야 저장돼요. 예상 종료·이전 시각 칩도 값만 채울 뿐 자동으로 완료하지 않아요.
 */
export function WorkoutTimeSheet({ target, onClose }: { target: WorkoutSheetTarget; onClose: () => void }) {
  const { person, mode, onDay } = target;
  const day = useDay();
  const toast = useToast();
  const src = day.workoutFor(onDay);
  const [confirmCancel, setConfirmCancel] = useState(false);
  /** 오래 걸린 날짜 확인 화면에 보여 주는 값 (확인 화면의 값만 저장돼요) */
  const [longConfirm, setLongConfirm] = useState<Minute | null>(null);
  const [directOpen, setDirectOpen] = useState(false);
  const [hh, setHh] = useState('');
  const [mm, setMm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const state = src?.state ?? null;
  const session = src?.view.session ?? null;
  const completion = src?.view.completions[person] ?? null;
  const cancelled = state ? cancelledWorkout(state, person) : null;
  const past = onDay !== undefined && state !== null && onDay !== day.state.day;
  const expectedEnd = session && state ? session.startedAt + state.workoutMinutes : null;

  /** 시작값: 수정이면 기록된 시각, 오늘 새 기록이면 지금 시각(범위 안일 때), 지난 세션은 비워 둬요 */
  const [value, setValue] = useState<Minute | null>(() => {
    if (!state || !session) return null;
    if (mode === 'edit') return completion?.actualCompletedAt ?? null;
    if (past) return null;
    return checkWorkoutTime(state, day.now, day.instantNow().toISOString()) === null ? day.now : null;
  });

  /** 마지막으로 확인을 통과한 값: 직접 입력을 취소하면 여기로 돌아와요 */
  const lastValid = useRef<Minute | null>(value !== null && state && checkWorkoutTime(state, value, day.instantNow().toISOString()) === null ? value : null);

  /** 직접 입력으로 정해졌거나(±·−30 같은 상대 조정으로 이어진) 값들. 지금·예상 끝·이전 기록 칩은 직접 입력이 아니에요 */
  const typed = useRef<Set<Minute>>(new Set());

  const check = (v: Minute): ActionError | null => (state ? checkWorkoutTime(state, v, day.instantNow().toISOString()) : 'no_session');
  const problem = useMemo(() => {
    if (value === null || !state) return null;
    return checkWorkoutTime(state, value, day.instantNow().toISOString());
    // 시계가 바뀔 때마다 다시 확인해요
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, state, day.now]);

  if (!src || !state || !session) {
    return (
      <Sheet open onClose={onClose} title="운동 완료">
        <p className="tiny" role="alert">{ERROR_TEXT.no_session}</p>
      </Sheet>
    );
  }

  const who = PEOPLE[person];
  const byMe = person === day.viewer;
  const withDate = past;
  const text = (m: Minute) => whenText(session.day, m, withDate);
  const unchanged = mode === 'edit' && completion !== null && value === completion.actualCompletedAt;
  /** 직접 입력 중이면 입력칸의 내용이 완성돼야 해요. 완성되기 전에는 이전 값이 남아 있어도 저장할 수 없어요 */
  const draft = directOpen ? parseDirectDraft(session.startedAt, hh, mm) : null;
  const directPending = draft !== null && draft.status !== 'ok';

  const fillDirect = (v: Minute) => {
    const { hhmm } = formatClock(v);
    setHh(hhmm.slice(0, 2));
    setMm(hhmm.slice(3, 5));
  };
  /** 값을 바꿔요 (±5분·칩). 직접 입력 칸이 열려 있으면 그 칸도 같은 값으로 맞춰서 서로 어긋나지 않게 해요 */
  const change = (v: number, absolute = false) => {
    setError(null);
    if (absolute) typed.current.delete(v);
    else if (value !== null && typed.current.has(value)) typed.current.add(v);
    setValue(v);
    if (check(v) === null) lastValid.current = v;
    if (directOpen) fillDirect(v);
  };
  /** 5분·15분 등 앞뒤로 옮긴 값. 입력칸이 미완성이면 기준이 되는 값이 없으니 쓰지 않아요 */
  const shifted = (delta: number): Minute => (value ?? session.startedAt) + delta;
  const canStep = (delta: number) => !directPending && value !== null && check(shifted(delta)) === null;

  /** 입력칸이 바뀔 때: 두 자리씩 완성되고 올바른 시각일 때만 값으로 확정해요. 아니면 값은 그대로 두고 저장만 막아요 */
  const onDirect = (nextH: string, nextM: string) => {
    setHh(nextH);
    setMm(nextM);
    setError(null);
    const d = parseDirectDraft(session.startedAt, nextH, nextM);
    if (d.status === 'ok') {
      typed.current.add(d.minute);
      setValue(d.minute);
      if (check(d.minute) === null) lastValid.current = d.minute;
    }
  };

  const toggleDirect = () => {
    if (!directOpen) {
      setDirectOpen(true);
      setError(null);
      if (value !== null) fillDirect(value);
      else { setHh(''); setMm(''); }
      return;
    }
    // 닫을 때: 미완성이거나 올바르지 않은 값이면 이전 정상값으로 되돌려요
    if (directPending || problem !== null) setValue(lastValid.current);
    setDirectOpen(false);
    setError(null);
  };

  /** 실제 저장. 확인 화면에서는 그 화면에 보인 값(minute)만 저장해요 */
  const commit = (minute: Minute) => {
    const r = mode === 'edit' ? day.editWorkoutTime(person, minute, onDay) : day.completeWorkout(person, minute, onDay);
    if (!r.ok) {
      setLongConfirm(null);
      setError(ERROR_TEXT[r.reason]);
      return;
    }
    if (mode === 'edit') toast(r.changed ? `${who.name}의 운동 완료를 ${text(minute)}로 고쳤어요` : '시각이 그대로예요');
    else toast(r.changed ? `${who.name}의 운동 완료 ${text(minute)} 기록했어요` : `${who.name}의 운동 완료가 이미 기록돼 있어요`);
    onClose();
  };
  const save = () => {
    if (value === null) return;
    if (needsLongConfirm(session.startedAt, value, typed.current.has(value))) {
      setLongConfirm(value);
      return;
    }
    commit(value);
  };
  /** [다시 수정]: 확인 화면을 닫고 직접 입력 칸을 현재 값으로 열어 둬요. 저장은 다시 [기록]을 눌러야 하고 그때 다시 확인해요 */
  const reedit = () => {
    setLongConfirm(null);
    setDirectOpen(true);
    if (value !== null) fillDirect(value);
  };

  const cancel = () => {
    const r = day.undoWorkout(person, onDay);
    if (!r.ok) {
      setError(ERROR_TEXT[r.reason]);
      setConfirmCancel(false);
      return;
    }
    toast(`${who.name}의 운동 완료를 취소했어요. 기록은 남아 있어요`);
    onClose();
  };

  const title = mode === 'edit' ? `${who.name}의 운동 완료 시각 수정` : past ? `${who.name}의 운동 완료 기록` : byMe ? '운동이 끝난 시각' : `${who.name}의 운동 완료를 대신 기록`;
  const proxy = !byMe;
  const noValue = value === null;
  const bounds = workoutTimeBounds(state, day.instantNow().toISOString());

  /* 오래 걸린 날짜 확인: 직접 입력이 다음 날로 해석되고 6시간 이상일 때만 (오입력 방지) */
  if (longConfirm !== null) {
    const span = longConfirm - session.startedAt;
    return (
      <Sheet open onClose={onClose} title="날짜와 시각이 맞나요?">
        <div className="wk-long" data-testid="wk-long-confirm">
          <p className="wk-long__lead">운동이 {LONG_CONFIRM_MINUTES / 60}시간 이상 걸린 것으로 기록돼요. 날짜가 맞는지 확인해 주세요.</p>
          <dl className="wk-long__rows">
            <div><dt>대상</dt><dd><CatMark who={person} size="sm" /> {who.name}</dd></div>
            <div><dt>시작</dt><dd data-testid="wk-long-start">{whenText(session.day, session.startedAt, true)}</dd></div>
            <div><dt>완료</dt><dd data-testid="wk-long-end">{whenText(session.day, longConfirm, true)}</dd></div>
            <div><dt>총 경과</dt><dd data-testid="wk-long-span">{elapsedText(span)}</dd></div>
          </dl>
        </div>
        <div className="sheet__actions">
          <button className="btn btn--ghost" onClick={reedit} data-testid="wk-long-back">다시 수정</button>
          <button className="btn btn--primary" onClick={() => commit(longConfirm)} data-testid="wk-long-ok">맞아요, 기록할게요</button>
        </div>
      </Sheet>
    );
  }

  /* 취소 확인 (한 번) */
  if (confirmCancel) {
    return (
      <Sheet open onClose={onClose} title="운동 완료 취소">
        <p className="wk-confirm" data-testid="wk-cancel-confirm">
          운동 완료 기록을 취소할까요?
          <br />
          기록은 남으며 다시 완료할 수 있어요.
        </p>
        <p className="tiny">
          <CatMark who={person} size="sm" /> {who.name} · {completion ? `✓${text(completion.actualCompletedAt)} 완료` : ''}
        </p>
        {error && <p className="wk-error" role="alert">{error}</p>}
        <div className="sheet__actions">
          <button className="btn btn--ghost" onClick={() => setConfirmCancel(false)} data-testid="wk-cancel-back">돌아가기</button>
          <button className="btn btn--primary" onClick={cancel} data-testid="wk-cancel-ok">취소할게요</button>
        </div>
      </Sheet>
    );
  }

  const lastRevisions = completion ? completion.revisions.slice(-3) : [];
  const showProblem = problem !== null && value !== null;

  return (
    <Sheet open onClose={onClose} title={title}>
      <div className="wk-who" data-testid="wk-who">
        <CatMark who={person} size="md" />
        <span>
          <span>
            <b>{who.name}</b>
            {proxy && (
              <>
                {' '}의 운동 · 입력은 <b>{PEOPLE[day.viewer].name}</b>
              </>
            )}
          </span>
          <small>
            {past ? `${dateLabel(session.day)} 세션 · ` : ''}❤️ {text(session.startedAt)} 시작{!past && ` · 지금 ${text(day.now)}`}
          </small>
        </span>
      </div>

      {mode === 'edit' && completion && (
        <p className="tiny" data-testid="wk-current">
          지금 기록: ✓{text(completion.actualCompletedAt)} 완료
          {completion.proxy ? ` · ${PEOPLE[completion.completedBy].name}가 입력` : ''}
          {completion.recordedAt && <> · 입력 {whenText(session.day, planMinuteOfInstant(session.day, completion.recordedAt), true)}</>}
        </p>
      )}
      {bounds !== null && bounds.max < bounds.min && !past && (
        <p className="wk-error" role="alert">지금 시각이 ❤️ 시작보다 앞이에요. 개발용 시계를 옮겨 둔 상태일 수 있어요.</p>
      )}
      {past && mode === 'record' && <p className="tiny">지난 세션이라 지금 시각을 쓰지 않아요. 실제로 끝난 시각을 골라 주세요.</p>}

      <div className="wk-time" role="group" aria-label={`${who.name} 운동 완료 시각`}>
        <button className="stepper__btn" onClick={() => change(shifted(-STEP))} disabled={!canStep(-STEP)} aria-label={`${STEP}분 빠르게`} data-testid="wk-minus">－</button>
        <span className={`wk-time__val ${noValue || directPending ? 'wk-time__val--none' : ''} ${showProblem && !directPending ? 'wk-time__val--bad' : ''}`} data-testid="wk-value" aria-live="polite">
          {directPending ? `${hh || '--'}:${mm || '--'}` : value === null ? '--:--' : text(value)}
        </span>
        <button className="stepper__btn" onClick={() => change(shifted(STEP))} disabled={!canStep(STEP)} aria-label={`${STEP}분 늦게`} data-testid="wk-plus">＋</button>
      </div>

      {value !== null && !showProblem && !directPending && (
        <p className="wk-elapsed" data-testid="wk-elapsed">❤️ 시작 후 {elapsedText(value - session.startedAt)}</p>
      )}

      {draft?.status === 'ok' && draft.rolled && value !== null && (
        <p className="wk-rolled" data-testid="wk-rolled">시작 시각보다 이른 시:분이라 <b>다음 날</b>로 해석했어요 → {text(value)}</p>
      )}
      <p className={`wk-error ${draft?.status === 'incomplete' && error === null ? 'wk-error--soft' : ''}`} role="alert" aria-live="polite" data-testid="wk-error">
        {error ?? (draft?.status === 'invalid' ? DIRECT_HINT.invalid : draft?.status === 'incomplete' ? DIRECT_HINT.incomplete : showProblem ? ERROR_TEXT[problem] : '')}
      </p>

      <div className="wk-direct">
        <button className="btn btn--text" onClick={toggleDirect} aria-expanded={directOpen} data-testid="wk-direct-toggle">
          {directOpen ? (directPending || problem !== null ? '직접 입력 취소' : '직접 입력 닫기') : '직접 입력'}
        </button>
        {directOpen && (
          <div className="wk-direct__fields">
            <label className="wk-direct__f">
              <span>시</span>
              <input
                className="wk-input"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={2}
                autoComplete="off"
                enterKeyHint="done"
                value={hh}
                placeholder="00"
                onChange={(e) => onDirect(e.target.value.replace(/\D/g, '').slice(0, 2), mm)}
                aria-label="시 (0부터 23)"
                data-testid="wk-hh"
              />
            </label>
            <b aria-hidden>:</b>
            <label className="wk-direct__f">
              <span>분</span>
              <input
                className="wk-input"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={2}
                autoComplete="off"
                enterKeyHint="done"
                value={mm}
                placeholder="00"
                onChange={(e) => onDirect(hh, e.target.value.replace(/\D/g, '').slice(0, 2))}
                aria-label="분 (0부터 59)"
                data-testid="wk-mm"
              />
            </label>
            <small className="tiny">❤️ 시작 이후 처음 오는 그 시각으로 정해요 (자정을 넘기면 다음 날)</small>
          </div>
        )}
      </div>

      <div className="tstep__chips" aria-label="빠른 선택">
        {[-30, -15].map((d) => (
          <button key={d} className="chip chip--btn" disabled={!canStep(d)} onClick={() => change(shifted(d))} data-testid={`wk-chip${d}`}>
            {d}분
          </button>
        ))}
        {!past && (
          <button className="chip chip--btn" disabled={check(day.now) !== null} onClick={() => change(day.now, true)} data-testid="wk-chip-now">
            지금
          </button>
        )}
        {expectedEnd !== null && (
          <button className="chip chip--btn" disabled={check(expectedEnd) !== null} onClick={() => change(expectedEnd, true)} data-testid="wk-chip-expected" aria-label={`예상 끝 ${text(expectedEnd)}로 맞추기 (참고용, 기록은 아니에요)`}>
            예상 끝 {text(expectedEnd)}
          </button>
        )}
        {cancelled && mode === 'record' && (
          <button className="chip chip--btn" disabled={check(cancelled.actualAt) !== null} onClick={() => change(cancelled.actualAt, true)} data-testid="wk-chip-prev">
            이전 기록 {text(cancelled.actualAt)}
          </button>
        )}
      </div>

      {lastRevisions.length > 1 && (
        <ul className="wk-hist" aria-label="수정 이력">
          {lastRevisions.map((r, i) => (
            <li key={i}>
              {REVISION_WORD[r.kind]} · {PEOPLE[r.by].name}{r.actualAt !== null ? ` · ${text(r.actualAt)}` : ''}
            </li>
          ))}
        </ul>
      )}

      {mode === 'edit' && (
        <button className="btn btn--text wk-cancelbtn" onClick={() => setConfirmCancel(true)} data-testid="wk-cancel">
          완료 취소
        </button>
      )}

      <div className="sheet__actions">
        <button className="btn btn--ghost" onClick={onClose}>닫기</button>
        <button className="btn btn--primary" onClick={save} disabled={noValue || problem !== null || unchanged || directPending} data-testid="wk-save">
          {mode === 'edit' ? '수정 저장' : '기록'}
        </button>
      </div>
    </Sheet>
  );
}

/** "55분", "1시간 5분" (잘못 넣은 시각을 알아채기 쉽게 시작부터 얼마나 지났는지 보여 줘요) */
function elapsedText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h === 0 ? `${m}분` : m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

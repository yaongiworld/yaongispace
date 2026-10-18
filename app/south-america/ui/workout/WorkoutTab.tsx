import { useState } from 'react';
import { cancelledWorkout, checkWorkoutTime, workoutTimeBounds } from '@/lib/south-america/domain/day/workout';
import { PEOPLE } from '@/lib/south-america/domain/types';
import type { PersonId } from '@/lib/south-america/domain/types';
import { planMinuteOfInstant } from '@/lib/south-america/domain/time';
import { workout } from '../../fixtures/preview';
import type { SetFixture } from '../../fixtures/preview';
import { useDev } from '../../devtools/devState';
import { useDay } from '../../store/dayStore';
import { Card } from '../common/Card';
import { CatMark } from '../common/CatMark';
import { Sheet } from '../common/Sheet';
import { useToast } from '../common/Toast';
import { ERROR_TEXT, whenText } from '../today/format';
import { CardioCard } from '../cardio/CardioCard';
import { PastWorkoutsSheet } from './PastWorkoutsSheet';
import { WorkoutTimeSheet, type WorkoutSheetTarget } from './WorkoutTimeSheet';

/** 한 세트의 확정 상태. 추천값은 사람이 직접 누르기 전까지 "기록"이 아니에요 [D-063, D-069]. */
type SetState = SetFixture & { confirmedBy: PersonId | null; edited: boolean };

const initialSets = (p: PersonId): SetState[] =>
  workout.exercise.byPerson[p].sets.map((s) => ({ ...s, confirmedBy: null, edited: false }));

export function WorkoutTab() {
  const dev = useDev();
  const toast = useToast();
  const viewer = dev.user; // 지금 이 폰을 쓰는 사람
  const [page, setPage] = useState<PersonId>(viewer); // 보고 있는 운동 페이지
  const [sets, setSets] = useState<Record<PersonId, SetState[]>>({
    yangcho: initialSets('yangcho'),
    tawi: initialSets('tawi'),
  });
  const [editing, setEditing] = useState<number | null>(null);
  const [timeSheet, setTimeSheet] = useState<WorkoutSheetTarget | null>(null);
  const [pastOpen, setPastOpen] = useState(false);

  const ex = workout.exercise.byPerson[page];
  const mine = page === viewer;
  const cur = sets[page];
  const patch = (i: number, fn: (s: SetState) => SetState) =>
    setSets((all) => ({ ...all, [page]: all[page].map((s, j) => (j === i ? fn(s) : s)) }));

  const toggle = (i: number) =>
    patch(i, (s) => (s.confirmedBy ? { ...s, confirmedBy: null, edited: false } : { ...s, confirmedBy: viewer }));
  const confirmAll = () => setSets((all) => ({ ...all, [page]: all[page].map((s) => (s.confirmedBy ? s : { ...s, confirmedBy: viewer })) }));
  const allDone = cur.every((s) => s.confirmedBy);

  return (
    <>
      <div className="seg seg--wide" role="tablist" aria-label="운동 페이지">
        {(['yangcho', 'tawi'] as const).map((id) => (
          <button key={id} role="tab" aria-selected={page === id} className={`seg__btn ${page === id ? 'seg__btn--on' : ''}`} onClick={() => setPage(id)}>
            <CatMark who={id} size="sm" /> {PEOPLE[id].name}
          </button>
        ))}
        <button className="seg__btn seg__btn--walk" onClick={() => toast('걷기 기록은 후속 단계에서 만들어요 🥾')}>🥾 걷기</button>
      </div>

      {!mine && (
        <p className="proxy-band">
          <CatMark who={viewer} size="sm" /> {PEOPLE[viewer].name}가 {PEOPLE[page].name}의 페이지를 편집 중이에요
        </p>
      )}

      <button className="past-link" onClick={() => setPastOpen(true)} data-testid="past-open">
        <span aria-hidden>🗓</span> 지난 운동 <span aria-hidden>›</span>
      </button>

      <WorkoutStatus page={page} />

      {/* 실제 유산소 기록 (5-B): 운동 완료·❤️ 세션과 별개로 저장돼요 */}
      <CardioCard page={page} />

      {/* ───── 아래는 예시 화면이에요: 세트 기록은 아직 저장 연결 전이라 새로고침하면 사라져요 ───── */}
      <section className="sample" aria-label="예시 운동 기록 (저장되지 않아요)" data-testid="sample-section">
        <p className="sample__head">
          <span className="sample__chip" data-testid="sample-chip">예시 · 저장되지 않아요</span>
          <small>운동 종목·세트 기록은 아직 연결 전이에요. 운동 완료는 아래 버튼으로 기록해요.</small>
        </p>

      <p className="done-line">✓ {workout.stretchDone}</p>

      <Card className="exercise">
        <h2 className="exercise__name"><span className="chip chip--together">👫 함께</span> {workout.exercise.name}</h2>
        <p className="exercise__last">지난번 {ex.last}</p>
        <p className="exercise__rec">추천 {ex.recText}</p>

        <ul className="sets">
          {cur.map((s, i) => (
            <li key={i}>
              <button
                className={`set ${s.confirmedBy ? 'set--on' : ''}`}
                onClick={() => toggle(i)}
                aria-pressed={!!s.confirmedBy}
                aria-label={`${i + 1}세트 ${s.weight}킬로그램 ${s.reps}회 ${s.confirmedBy ? '확정됨' : '아직 추천값'}`}
              >
                <span className="set__no">{'①②③④⑤'[i]}</span>
                <span className="set__val">{s.weight} × {s.reps}</span>
                {s.edited && <span className="set__tag" aria-label="수정함">✏️</span>}
                {s.confirmedBy && s.confirmedBy !== page && <span className="set__tag">{PEOPLE[s.confirmedBy].name} 입력</span>}
                <span className="set__dot" aria-hidden>{s.confirmedBy ? '●' : '○'}</span>
              </button>
              <button className="set__edit" onClick={() => setEditing(i)} aria-label={`${i + 1}세트 수정`}>수정</button>
            </li>
          ))}
        </ul>

        <div className="exercise__actions">
          <button className="btn btn--primary btn--block" onClick={confirmAll} disabled={allDone}>
            {allDone ? '모두 확정했어요 ✓' : '추천대로 전부 완료 ✓'}
          </button>
        </div>
        <p className="tiny">회색 ○은 아직 추천값이에요. 직접 누른 세트만 기록돼요.</p>
        {!mine && <p className="tiny">{PEOPLE[viewer].name}가 대신 완료하면 “대신 완료”로 표시돼요.</p>}
      </Card>

      <div className="folded">
        <button className="folded__btn" onClick={() => toast('복근·코어 기록은 후속 단계에서 만들어요')}>▸ 복근·코어</button>
      </div>
      </section>

      <CompletionBar page={page} onSheet={setTimeSheet} />

      {pastOpen && <PastWorkoutsSheet onClose={() => setPastOpen(false)} />}
      {timeSheet && <WorkoutTimeSheet key={`${timeSheet.person}:${timeSheet.mode}`} target={timeSheet} onClose={() => setTimeSheet(null)} />}

      <StepperSheet
        open={editing !== null}
        title={editing !== null ? `${'①②③④⑤'[editing]} 세트 수정` : ''}
        weight={editing !== null ? cur[editing].weight : 0}
        reps={editing !== null ? cur[editing].reps : 0}
        onClose={() => setEditing(null)}
        onConfirm={(w, r) => {
          if (editing !== null) patch(editing, (s) => ({ ...s, weight: w, reps: r, confirmedBy: viewer, edited: true }));
          setEditing(null);
        }}
      />
    </>
  );
}

/** 숫자는 [－][＋] 스테퍼로. 키패드는 쓰지 않아요 [P-056]. */
function StepperSheet({ open, title, weight, reps, onClose, onConfirm }: { open: boolean; title: string; weight: number; reps: number; onClose: () => void; onConfirm: (w: number, r: number) => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={title || '세트 수정'}>
      {open && <StepperBody weight={weight} reps={reps} onConfirm={onConfirm} />}
    </Sheet>
  );
}

function StepperBody({ weight, reps, onConfirm }: { weight: number; reps: number; onConfirm: (w: number, r: number) => void }) {
  const [w, setW] = useState(weight);
  const [r, setR] = useState(reps);
  return (
    <>
      <div className="stepper-row">
        <span>중량</span>
        <div className="stepper">
          <button className="stepper__btn" onClick={() => setW((v) => Math.max(0, v - 2.5))} aria-label="2.5킬로그램 줄이기">－</button>
          <span className="stepper__val">{w} kg</span>
          <button className="stepper__btn" onClick={() => setW((v) => v + 2.5)} aria-label="2.5킬로그램 늘리기">＋</button>
        </div>
      </div>
      <div className="stepper-row">
        <span>횟수</span>
        <div className="stepper">
          <button className="stepper__btn" onClick={() => setR((v) => Math.max(1, v - 1))} aria-label="1회 줄이기">－</button>
          <span className="stepper__val">{r} 회</span>
          <button className="stepper__btn" onClick={() => setR((v) => v + 1)} aria-label="1회 늘리기">＋</button>
        </div>
      </div>
      <div className="sheet__actions">
        <button className="btn btn--primary btn--big btn--block" onClick={() => onConfirm(w, r)}>확정 ●</button>
      </div>
    </>
  );
}

/**
 * 운동 완료 현황 (진짜 기록): 오늘 탭과 같은 데이터예요. 한 명만 끝내면 "1/2 완료"이고,
 * 둘 다 끝났을 때만 "둘 다 운동 완료!"를 보여줘요. 세트 예시와 달리 실선 카드로 구분해요.
 */
function WorkoutStatus({ page }: { page: PersonId }) {
  const day = useDay();
  const view = day.workout;
  const session = view.session;
  if (!session) {
    return (
      <Card className="wkstat" data-testid="wkstat">
        <p className="wkstat__title">💪 아직 ❤️ 함께 운동 시작 전이에요</p>
        <p className="tiny">❤️를 누르면 이곳과 오늘 탭에서 운동 완료를 기록할 수 있어요.</p>
      </Card>
    );
  }
  const n = (['yangcho', 'tawi'] as const).filter((p) => view.completions[p]).length;
  const complete = view.status === 'complete' && view.completedAt !== null;
  return (
    <Card tone={complete ? 'glacier' : 'plain'} className="wkstat" data-testid="wkstat">
      <p className="wkstat__title">
        {complete ? (
          <span data-testid="wkstat-complete"><CatMark who="yangcho" size="sm" /><CatMark who="tawi" size="sm" /> 둘 다 운동 완료! · <b>{whenText(day.state.day, view.completedAt!, false)}</b></span>
        ) : (
          <>💪 함께 운동 중 <span className="chip chip--dim" data-testid="wkstat-count">{n}/2 완료</span></>
        )}
      </p>
      <p className="wkstat__sub">❤️ {whenText(day.state.day, session.startedAt, false)} 시작</p>
      <ul className="wkstat__rows">
        {(['yangcho', 'tawi'] as const).map((p) => {
          const c = view.completions[p];
          return (
            <li key={p} className={p === page ? 'wkstat__row wkstat__row--page' : 'wkstat__row'} data-testid={`wkstat-${p}`}>
              <CatMark who={p} size="sm" /> <b>{PEOPLE[p].name}</b>
              {c ? (
                <span className="wk__ok"> ✓{whenText(day.state.day, c.actualCompletedAt, false)} 완료</span>
              ) : (
                <span> 운동 중</span>
              )}
              {c?.proxy && (
                <small>
                  {' '}· {PEOPLE[c.completedBy].name}가 {c.recordedAt ? `${whenText(day.state.day, planMinuteOfInstant(day.state.day, c.recordedAt), false)}에 ` : ''}대신 입력
                </small>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/**
 * 하단 고정 운동 완료 영역 [H-7]. 보고 있는 페이지의 사람(page) 기준이에요:
 * - 내 페이지: [지금 완료했어요] / [아까 끝났어요 ›]
 * - 상대 페이지: [○○의 운동 완료 대신 기록] (시각 시트를 거치고, 입력자는 지금 폰을 쓰는 사람)
 * - 이미 완료: 시각과 입력자, [수정]
 * 누르는 대상(page)과 입력자(viewer)를 글자로 나눠서 보여줘요.
 */
function CompletionBar({ page, onSheet }: { page: PersonId; onSheet: (t: WorkoutSheetTarget) => void }) {
  const day = useDay();
  const toast = useToast();
  const view = day.workout;
  const viewer = day.viewer;
  const mine = page === viewer;
  const name = PEOPLE[page].name;
  const c = view.completions[page];
  const cancelled = c ? null : cancelledWorkout(day.state, page);
  const sessionDay = day.state.day;

  if (!view.session) {
    return (
      <div className="sticky-cta sticky-cta--workout" data-testid="wkbar">
        <button className="btn btn--primary btn--giant" disabled data-testid="wkbar-disabled">{mine ? '내 운동 완료' : `${name}의 운동 완료`}</button>
        <p className="tiny">❤️ 함께 운동을 시작한 뒤에 기록할 수 있어요</p>
      </div>
    );
  }

  if (c) {
    return (
      <div className="sticky-cta sticky-cta--workout" data-testid="wkbar">
        <div className="wkbar__done">
          <p data-testid="wkbar-done">
            <CatMark who={page} size="sm" /> {name}{mine ? ' (나)' : ''} <span className="wk__ok">✓{whenText(sessionDay, c.actualCompletedAt, false)} 완료</span>
            <small>{c.proxy ? ` · ${PEOPLE[c.completedBy].name}가 대신 입력` : ' · 직접 기록'}</small>
          </p>
          <button className="btn btn--small btn--ghost" onClick={() => onSheet({ person: page, mode: 'edit' })} aria-label={`${name} 운동 완료 시각 수정 또는 취소`} data-testid="wkbar-edit">수정</button>
        </div>
      </div>
    );
  }

  const bounds = workoutTimeBounds(day.state, day.instantNow().toISOString());
  const behind = bounds !== null && bounds.max < bounds.min; // 개발용 시계가 ❤️ 시작보다 앞일 때
  const nowBlocked = behind || checkWorkoutTime(day.state, day.now, day.instantNow().toISOString()) !== null;
  const pressNow = () => {
    const r = day.completeWorkout(page, day.now);
    if (!r.ok) return toast(ERROR_TEXT[r.reason]);
    toast(r.changed ? `${name}의 운동 완료 ✓${whenText(sessionDay, day.now, false)} 기록했어요` : '이미 기록돼 있어요');
  };

  return (
    <div className="sticky-cta sticky-cta--workout" data-testid="wkbar">
      {mine ? (
        <>
          <button className="btn btn--primary btn--giant" onClick={pressNow} disabled={nowBlocked} data-testid="wkbar-now">지금 완료했어요</button>
          <button className="btn btn--text" onClick={() => onSheet({ person: page, mode: 'record' })} data-testid="wkbar-earlier">아까 끝났어요 ›</button>
        </>
      ) : (
        <>
          <button className="btn btn--primary btn--giant" onClick={() => onSheet({ person: page, mode: 'record' })} data-testid="wkbar-proxy">{name}의 운동 완료 대신 기록</button>
          <p className="tiny" data-testid="wkbar-by">입력은 {PEOPLE[viewer].name}(나)로 기록돼요</p>
        </>
      )}
      {cancelled && <p className="tiny">완료 기록을 취소했어요 (이전 {whenText(sessionDay, cancelled.actualAt, false)}). 다시 기록할 수 있어요</p>}
      {behind && <p className="tiny" role="status">지금 시각이 ❤️ 시작보다 앞이에요. 개발용 시계를 옮겨 둔 상태일 수 있어요.</p>}
    </div>
  );
}

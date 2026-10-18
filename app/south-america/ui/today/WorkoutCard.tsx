import { cancelledWorkout, checkWorkoutTime, workoutTimeBounds, type WorkoutCompletion } from '@/lib/south-america/domain/day/workout';
import { LEGACY_JOINT_END_LABEL, legacyJointEnd } from '@/lib/south-america/domain/day/session';
import { planMinuteOfInstant } from '@/lib/south-america/domain/time';
import { PEOPLE, otherPerson, type PersonId } from '@/lib/south-america/domain/types';
import { Card } from '../common/Card';
import { CatMark } from '../common/CatMark';
import { useToast } from '../common/Toast';
import { useDay } from '../../store/dayStore';
import type { WorkoutSheetTarget } from '../workout/WorkoutTimeSheet';
import { ERROR_TEXT, dateLabel, findNode, nodeTime, whenText } from './format';

/**
 * 오늘 운동 카드 [D-167·168·171]: ❤️ 공동 시작 이후에만 나타나요.
 * 운동 완료는 각자 따로 기록하고, 두 사람이 모두 실제로 기록했을 때만 "둘 다 운동 완료"예요.
 * 계산(공동 완료 시각·범위·날짜 확인)은 domain/day/workout.ts가 하고, 여기서는 보여 주고 버튼만 이어요.
 */
export function WorkoutCard({ onSheet }: { onSheet: (t: WorkoutSheetTarget) => void }) {
  const day = useDay();
  const toast = useToast();
  const view = day.workout;
  const session = view.session;
  if (!session) return null;

  const me = day.viewer;
  const partner = otherPerson(me);
  const done = (['yangcho', 'tawi'] as const).filter((p) => view.completions[p]).length;
  const complete = view.status === 'complete' && view.completedAt !== null;
  const legacy = legacyJointEnd(day.state);
  const bounds = workoutTimeBounds(day.state, day.instantNow().toISOString());
  const clockBehind = bounds !== null && bounds.max < bounds.min; // 개발용 시계가 ❤️ 시작보다 앞일 때

  const pressNow = () => {
    const r = day.completeWorkout(me, day.now);
    if (!r.ok) return toast(ERROR_TEXT[r.reason]);
    toast(r.changed ? `${PEOPLE[me].name}의 운동 완료 ✓${whenText(day.state.day, day.now, false)} 기록했어요` : '이미 기록돼 있어요');
  };

  return (
    <Card tone={complete ? 'glacier' : 'terra'} className="wk" data-testid="wk-card">
      <div className="wk__head" data-testid="wk-head">
        {complete ? (
          <p className="wk__title" data-testid="wk-complete">
            <span aria-hidden><CatMark who="yangcho" size="sm" /><CatMark who="tawi" size="sm" /></span> 둘 다 운동 완료! · <b>{whenText(day.state.day, view.completedAt!, false)}</b>
          </p>
        ) : (
          <p className="wk__title">
            <span aria-hidden>💪</span> 함께 운동 중
            <span className="chip chip--dim" data-testid="wk-count">{done}/2 완료</span>
          </p>
        )}
        <p className="wk__sub">❤️ {whenText(day.state.day, session.startedAt, false)} 시작 · 완료는 각자 기록해요</p>
      </div>

      {[me, partner].map((p) => (
        <Row key={p} person={p} me={me} completion={view.completions[p]} onSheet={onSheet} onNow={pressNow} nowBlocked={clockBehind || checkWorkoutTime(day.state, day.now, day.instantNow().toISOString()) !== null} />
      ))}

      {clockBehind && <p className="tiny" role="status">지금 시각이 ❤️ 시작보다 앞이에요. 개발용 시계를 옮겨 둔 상태일 수 있어요.</p>}
      {legacy && <p className="tiny" data-testid="wk-legacy">{LEGACY_JOINT_END_LABEL}</p>}
    </Card>
  );
}

function Row({ person, me, completion, onSheet, onNow, nowBlocked }: { person: PersonId; me: PersonId; completion: WorkoutCompletion | null; onSheet: (t: WorkoutSheetTarget) => void; onNow: () => void; nowBlocked: boolean }) {
  const day = useDay();
  const who = PEOPLE[person];
  const mine = person === me;
  const node = findNode(day.live.timeline, person, 'workout_end');
  const cancelled = completion ? null : cancelledWorkout(day.state, person);
  const sessionDay = day.state.day;

  return (
    <div className={`wk__row ${completion ? 'wk__row--done' : ''}`} data-testid={`wk-row-${person}`}>
      <div className="wk__who">
        <CatMark who={person} size="md" />
        <div className="wk__state">
          <p className="wk__name">
            <b>{who.name}</b>{mine && <span className="wk__me"> (나)</span>}
            {completion ? <span className="wk__ok"> ✓{whenText(sessionDay, completion.actualCompletedAt, false)} 완료</span> : <span> 운동 중</span>}
          </p>
          {completion ? (
            <p className="wk__note">
              {completion.proxy
                ? `${PEOPLE[completion.completedBy].name}가 ${completion.recordedAt ? `${whenText(sessionDay, planMinuteOfInstant(sessionDay, completion.recordedAt), false)}에 ` : ''}대신 입력`
                : completion.revisions.length > 1 ? '시각을 고쳤어요' : '직접 기록'}
            </p>
          ) : (
            <p className="wk__note">
              예상 끝 <b>{nodeTime(node)}</b>
              {node?.overdue && <span className="chip chip--late">예상 시각 지남 · 실제 미기록</span>}
              {cancelled && <> · 완료 기록을 취소했어요 (이전 {whenText(sessionDay, cancelled.actualAt, false)})</>}
            </p>
          )}
        </div>
        {completion && (
          <button className="btn btn--small btn--ghost wk__edit" onClick={() => onSheet({ person, mode: 'edit' })} aria-label={`${who.name} 운동 완료 시각 수정 또는 취소`} data-testid={`wk-edit-${person}`}>
            수정
          </button>
        )}
        {!completion && !mine && (
          <button className="btn btn--small btn--ghost wk__edit" onClick={() => onSheet({ person, mode: 'record' })} aria-label={`${who.name}의 운동 완료를 대신 기록하기`} data-testid={`wk-proxy-${person}`}>
            대신 기록
          </button>
        )}
      </div>
      {!completion && mine && (
        <div className="wk__acts">
          <button className="btn btn--primary btn--big btn--block" onClick={onNow} disabled={nowBlocked} data-testid="wk-now">
            지금 완료했어요
          </button>
          <button className="btn btn--ghost btn--block" onClick={() => onSheet({ person, mode: 'record' })} data-testid="wk-earlier">
            아까 끝났어요 ›
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * 이전 세션 중 개인 운동 완료가 아직 없는 사람이 있는 경우의 작은 입구 [D-170].
 * 날짜와 미기록자를 한 줄씩 보여 주고, 눌러서 그 세션에 시각 시트로 기록해요. 전체 지난 기록 화면은 4단계예요.
 * 입력 기한(O-134)은 정해지지 않아서 날짜가 오래돼도 숨기지 않아요.
 */
export function PastWorkoutNotice({ onSheet }: { onSheet: (t: WorkoutSheetTarget) => void }) {
  const day = useDay();
  const list = day.pendingPast;
  if (list.length === 0) return null;
  const rows = list.flatMap((s) => s.missing.map((p) => ({ s, p })));
  return (
    <Card className="wk-past" data-testid="wk-past">
      <h2 className="card__title"><span className="card__emoji" aria-hidden>🗓</span>이전 운동 완료가 아직 기록되지 않았어요</h2>
      <ul className="wk-past__list">
        {rows.map(({ s, p }) => (
          <li key={`${s.day}:${p}`} className="wk-past__row" data-testid={`wk-past-${s.day}-${p}`}>
            <span className="wk-past__txt">
              <span><b>{dateLabel(s.day)}</b> · <CatMark who={p} size="sm" /> {PEOPLE[p].name}</span>
              <small>❤️ {whenText(s.day, s.startedAt, false)} 시작{s.legacy ? ' · 이전 방식 기록만 있음(개인별 미확인)' : ''}</small>
            </span>
            <button className="btn btn--small btn--ghost" onClick={() => onSheet({ person: p, mode: 'record', onDay: s.day })} aria-label={`${dateLabel(s.day)} ${PEOPLE[p].name} 운동 완료 기록하기`}>
              기록하기
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

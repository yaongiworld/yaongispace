// 2단계: 개인별 운동 완료와 공동 세션 완료 [D-167, D-168, D-170, D-171].
// 핵심: 한 명만 끝내면 진행 중, 둘 다 실제 완료해야 공동 완료(늦은 쪽 시각), 늦게 입력해도 원래 세션에 붙는다.
import { describe, expect, it } from 'vitest';
import { completeStep, createDayState, pressHeart, setEtaMode, skipStep, undoStep, type DayState } from '@/lib/south-america/domain/day/day';
import { emptyBook, parseDayState, sameState, stableStringify, switchDay, updateArchived } from '@/lib/south-america/domain/day/daybook';
import { LEGACY_JOINT_END_LABEL, legacyJointEnd, sessionIdOf, sessionOf } from '@/lib/south-america/domain/day/session';
import {
  cancelledWorkout,
  checkWorkoutTime,
  completeWorkout,
  editWorkoutTime,
  listWorkoutSessions,
  pendingWorkoutSessions,
  resolveClockForSession,
  undoWorkout,
  workoutEvents,
  workoutKey,
  workoutSession,
  workoutTimeBounds,
} from '@/lib/south-america/domain/day/workout';
import { planDayOf } from '@/lib/south-america/domain/time';
import { C, DAY, at, must, newDay, node, tlOf } from './dayHelpers';

/** 기록을 입력한 실제 순간 (한국 시간) */
const REC = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+09:00`).toISOString();
const D = DAY; // 2026-10-15
const SID = `ws:${D}`;

/** 19:40에 양초가 ❤️을 눌러 시작한 날 */
const started = (): DayState => must(pressHeart(newDay(), C('19:40'), 'yangcho'));
const rec = (by: 'yangcho' | 'tawi', hhmm: string, date = D) => ({ by, recordedAt: REC(date, hhmm) });

describe('개인별 완료 / 공동 완료 판정', () => {
  it('1. 한 명만 완료하면 공동 세션은 진행 중이고, 아직 공동 완료·모닥불 시각이 없다', () => {
    const s = must(completeWorkout(started(), 'yangcho', C('20:40'), rec('yangcho', '20:41')));
    const w = workoutSession(s);
    expect(w.status).toBe('in_progress');
    expect(w.completions.yangcho).toMatchObject({ person: 'yangcho', sessionId: SID, actualCompletedAt: C('20:40'), completedBy: 'yangcho', proxy: false });
    expect(w.completions.tawi).toBeNull();
    expect(w.completedAt).toBeNull();
    expect(w.bonfireAt).toBeNull();
    // 상대의 운동 끝은 여전히 "예상"일 뿐 실제 완료가 아니다
    const tl = tlOf(s, C('20:45'));
    expect(node(tl, 'yangcho', 'workout_end')).toMatchObject({ state: 'done', actual: C('20:40') });
    expect(node(tl, 'tawi', 'workout_end').state).not.toBe('done');
  });

  it('2. 둘 다 완료하면 공동 완료이고, 공동 완료·모닥불 시각은 늦은 쪽 실제 시각이다', () => {
    let s = must(completeWorkout(started(), 'yangcho', C('20:40'), rec('yangcho', '20:41')));
    s = must(completeWorkout(s, 'tawi', C('20:55'), rec('tawi', '20:56')));
    const w = workoutSession(s);
    expect(w.status).toBe('complete');
    expect(w.completedAt).toBe(C('20:55'));
    expect(w.bonfireAt).toBe(C('20:55'));
    expect(w.completedAtInstant).toBe(REC(D, '20:55'));
  });

  it('3. 완료 순서가 바뀌어도 결과는 같다 (늦은 시각이 먼저 입력돼도 공동 완료는 늦은 쪽)', () => {
    let a = must(completeWorkout(started(), 'yangcho', C('20:40'), rec('yangcho', '21:00')));
    a = must(completeWorkout(a, 'tawi', C('20:55'), rec('tawi', '21:01')));
    let b = must(completeWorkout(started(), 'tawi', C('20:55'), rec('tawi', '21:00')));
    b = must(completeWorkout(b, 'yangcho', C('20:40'), rec('yangcho', '21:01')));
    for (const s of [a, b]) {
      const w = workoutSession(s);
      expect(w.status).toBe('complete');
      expect(w.completedAt).toBe(C('20:55'));
    }
    // 먼저 끝낸 사람이 나중 입력이어도: 양초 20:55, 타위 20:40
    let c = must(completeWorkout(started(), 'tawi', C('20:40'), rec('tawi', '21:00')));
    c = must(completeWorkout(c, 'yangcho', C('20:55'), rec('yangcho', '21:01')));
    expect(workoutSession(c).completedAt).toBe(C('20:55'));
  });

  it('샤워·귀가는 공동 완료의 조건이 아니다', () => {
    let s = must(completeWorkout(started(), 'yangcho', C('20:40'), rec('yangcho', '20:41')));
    s = must(completeWorkout(s, 'tawi', C('20:45'), rec('tawi', '20:46')));
    expect(workoutSession(s).status).toBe('complete');
    const tl = tlOf(s, C('20:50'));
    expect(node(tl, 'yangcho', 'shower_end').state).not.toBe('done');
    expect(node(tl, 'tawi', 'home_return').state).not.toBe('done');
  });

  it('공동 세션이 없으면(❤️ 전) 완료를 기록할 수 없다', () => {
    const s = newDay();
    expect(completeWorkout(s, 'yangcho', C('20:40'), rec('yangcho', '20:41'))).toMatchObject({ ok: false, reason: 'no_session' });
    expect(workoutSession(s).status).toBe('none');
  });
});

describe('대신 기록하기 [D-168]', () => {
  it('4. 상대 대신 기록하면 운동한 사람과 기록한 사람이 구분되고 "대신"으로 표시된다', () => {
    const s = must(completeWorkout(started(), 'tawi', C('20:50'), rec('yangcho', '20:52')));
    const c = workoutSession(s).completions.tawi!;
    expect(c).toMatchObject({ person: 'tawi', completedBy: 'yangcho', proxy: true, actualCompletedAt: C('20:50'), recordedAt: REC(D, '20:52') });
    expect(c.rewardKey).toBe(`workout:tawi:${SID}`); // 보상 대상은 운동한 사람
    expect(workoutSession(s).completions.yangcho).toBeNull();
  });

  it('5. 같은 세션·같은 사람의 중복 완료는 만들어지지 않고 기존 기록이 그대로다', () => {
    const s1 = must(completeWorkout(started(), 'yangcho', C('20:40'), rec('yangcho', '20:41')));
    const again = completeWorkout(s1, 'yangcho', C('20:50'), rec('tawi', '20:55'));
    expect(again).toMatchObject({ ok: true, changed: false });
    expect(sameState(again.state, s1)).toBe(true);
    // 내가 이미 완료했는데 상대가 대신 또 눌러도 마찬가지
    const proxyAgain = completeWorkout(s1, 'yangcho', C('20:40'), rec('tawi', '20:42'));
    expect(proxyAgain).toMatchObject({ ok: true, changed: false });
    expect(Object.keys(s1.actuals.steps).filter((k) => k.endsWith('workout_end'))).toEqual([workoutKey('yangcho')]);
  });

  it('일반 완료·건너뛰기·되돌리기 경로로는 운동 끝을 기록할 수 없다 (옛 공동 버튼 차단)', () => {
    const s = started();
    for (const lane of ['joint', 'yangcho', 'tawi'] as const) {
      expect(completeStep(s, lane, 'workout_end', C('21:00'), 'tawi')).toMatchObject({ ok: false, reason: 'use_workout_completion' });
      expect(skipStep(s, lane, 'workout_end', 'tawi', C('21:00'))).toMatchObject({ ok: false, reason: 'use_workout_completion' });
      expect(undoStep(s, lane, 'workout_end')).toMatchObject({ ok: false, reason: 'use_workout_completion' });
    }
    expect(Object.keys(s.actuals.steps)).toEqual(['joint.start_together']);
  });
});

describe('실제 완료 시각 수정·취소·복구 [D-171]', () => {
  const both = () => {
    let s = must(completeWorkout(started(), 'yangcho', C('20:40'), rec('yangcho', '20:41')));
    s = must(completeWorkout(s, 'tawi', C('20:50'), rec('tawi', '20:51')));
    return s;
  };

  it('6. 실제 완료 시각을 고치면 개인·공동·모닥불 시각과 이후 일정이 다시 계산되고, 원래 값은 이력에 남는다', () => {
    const s0 = both();
    const before = tlOf(s0, C('21:00'));
    // 늦은 쪽(타위)을 20:50 → 21:05
    const s1 = must(editWorkoutTime(s0, 'tawi', C('21:05'), rec('yangcho', '21:10')));
    const w = workoutSession(s1);
    expect(w.completions.tawi!.actualCompletedAt).toBe(C('21:05'));
    expect(w.completedAt).toBe(C('21:05'));
    expect(w.bonfireAt).toBe(C('21:05'));
    const after = tlOf(s1, C('21:10'));
    expect(node(after, 'tawi', 'shower_end').time! - node(before, 'tawi', 'shower_end').time!).toBe(15);
    expect(node(after, 'yangcho', 'shower_end').time).toBe(node(before, 'yangcho', 'shower_end').time); // 양초 쪽은 그대로
    expect(w.completions.tawi!.revisions.map((r) => [r.kind, r.actualAt, r.prevActualAt ?? null, r.by])).toEqual([
      ['recorded', C('20:50'), null, 'tawi'],
      ['time_edited', C('21:05'), C('20:50'), 'yangcho'],
    ]);
    expect(w.completions.tawi!.rewardKey).toBe(`workout:tawi:${SID}`); // 식별자는 그대로
    // 이른 쪽(양초)을 20:40 → 20:30 으로 고쳐도 공동 완료는 늦은 쪽 그대로
    const s2 = must(editWorkoutTime(s0, 'yangcho', C('20:30'), rec('yangcho', '20:55')));
    expect(workoutSession(s2).completedAt).toBe(C('20:50'));
    // 늦은 쪽을 양초보다 일찍 고치면 공동 완료는 양초 시각이 된다
    const s3 = must(editWorkoutTime(s0, 'tawi', C('20:35'), rec('tawi', '20:56')));
    expect(workoutSession(s3).completedAt).toBe(C('20:40'));
  });

  it('고칠 때도 ❤️ 시작보다 앞서거나 입력 순간보다 미래일 수 없다. 같은 시각이면 아무것도 바뀌지 않는다', () => {
    const s = both();
    expect(editWorkoutTime(s, 'tawi', C('19:30'), rec('tawi', '21:00'))).toMatchObject({ ok: false, reason: 'completion_before_start' });
    expect(editWorkoutTime(s, 'tawi', C('21:30'), rec('tawi', '21:00'))).toMatchObject({ ok: false, reason: 'completion_in_future' });
    expect(editWorkoutTime(s, 'tawi', C('20:50'), rec('tawi', '21:00'))).toMatchObject({ ok: true, changed: false });
    expect(editWorkoutTime(started(), 'tawi', C('20:50'), rec('tawi', '21:00'))).toMatchObject({ ok: false, reason: 'not_done' });
  });

  it('7. 취소해도 기록은 지워지지 않고 이력으로 남으며, 복구하면 같은 기록(같은 식별자)이 된다', () => {
    const s0 = both();
    const key = workoutKey('tawi');
    const s1 = must(undoWorkout(s0, 'tawi', rec('yangcho', '21:00')));
    expect(s1.actuals.steps[key]).toMatchObject({ status: 'undone', person: 'tawi', sessionId: SID, rewardKey: `workout:tawi:${SID}` });
    const w1 = workoutSession(s1);
    expect(w1.completions.tawi).toBeNull(); // 취소는 유효 완료가 아님
    expect(w1.status).toBe('in_progress');
    expect(w1.completedAt).toBeNull();
    expect(w1.bonfireAt).toBeNull();
    expect(tlOf(s1, C('21:00')).nodes.find((n) => n.lane === 'tawi' && n.id === 'workout_end')!.state).not.toBe('done');

    // 취소를 다시 취소하거나 없는 것을 취소할 수 없다
    expect(undoWorkout(s1, 'tawi', rec('yangcho', '21:01'))).toMatchObject({ ok: false, reason: 'not_done' });
    expect(undoWorkout(started(), 'tawi', rec('yangcho', '21:01'))).toMatchObject({ ok: false, reason: 'not_done' });

    // 복구: 시각을 새로 줘서 다시 완료 (같은 기록에 이어서)
    const s2 = must(completeWorkout(s1, 'tawi', C('20:58'), rec('tawi', '21:02')));
    const w2 = workoutSession(s2);
    expect(w2.status).toBe('complete');
    expect(w2.completedAt).toBe(C('20:58'));
    expect(w2.completions.tawi!.rewardKey).toBe(`workout:tawi:${SID}`);
    expect(w2.completions.tawi!.revisions.map((r) => r.kind)).toEqual(['recorded', 'undone', 'restored']);
    expect(Object.keys(s2.actuals.steps).filter((k) => k.endsWith('workout_end'))).toHaveLength(2); // 새 기록이 따로 생기지 않음
  });
});

describe('늦게 입력해도 원래 세션에 붙는다 [D-170]', () => {
  it('8. 하루 경계(04:00) 이후에 입력해도 같은 세션 ID, 새 날짜 세션을 만들지 않는다', () => {
    const s0 = must(pressHeart(newDay(), C('22:30'), 'yangcho'));
    const sessionBefore = sessionOf(s0)!;
    // 다음날 05:00(이미 다음 계획 하루)에 어젯밤 운동을 입력: 실제 완료는 23:50
    const late = rec('tawi', '05:00', '2026-10-16');
    expect(planDayOf(late.recordedAt)).toBe('2026-10-16');
    let s = must(completeWorkout(s0, 'yangcho', C('23:50'), late));
    s = must(completeWorkout(s, 'tawi', C('23:50'), late));
    expect(s.day).toBe(D);
    expect(sessionOf(s)!.id).toBe(SID);
    expect(sessionOf(s)).toEqual(sessionBefore);
    const c = workoutSession(s).completions.yangcho!;
    expect(c).toMatchObject({ sessionId: SID, actualCompletedAt: C('23:50'), recordedDay: '2026-10-16', recordedAt: late.recordedAt });
    expect(c.actualCompletedInstant).toBe(REC(D, '23:50'));
    expect(workoutSession(s).status).toBe('complete');
  });

  it('보관된 지난 날에 입력하면 보관함의 그 날짜에만 반영되고 새 날짜 상태가 생기지 않는다', () => {
    const s0 = must(pressHeart(newDay(), C('22:30'), 'yangcho'));
    let book = emptyBook(s0);
    book = switchDay(book, '2026-10-16', REC('2026-10-16', '04:30'));
    expect(Object.keys(book.days)).toEqual([D]);
    expect(book.current.day).toBe('2026-10-16');

    const r = completeWorkout(book.days[D].state, 'yangcho', C('23:50'), rec('tawi', '05:10', '2026-10-16'));
    expect(r.ok).toBe(true);
    const b2 = updateArchived(book, D, must(r));
    expect(Object.keys(b2.days)).toEqual([D]); // 새 날짜 항목 없음
    expect(b2.current).toBe(book.current); // 오늘은 그대로
    expect(b2.days[D]).toMatchObject({ sessionId: SID, archivedAt: book.days[D].archivedAt, reason: 'rollover' });
    expect(workoutSession(b2.days[D].state).completions.yangcho).toMatchObject({ sessionId: SID, completedBy: 'tawi', proxy: true });
    // 없는 날짜·다른 날짜 상태는 받지 않는다
    expect(updateArchived(book, '2026-10-01', must(r))).toBe(book);
    expect(updateArchived(book, D, createDayState('2026-10-17'))).toBe(book);
  });

  it('9. 자정 이후·04:00 직전 완료는 "시:분 글자"가 아니라 실제 날짜로 비교한다', () => {
    // 23:40 시작 → 00:10(다음 날 새벽) 완료. 시:분 글자로는 "00:10" < "23:40"이지만 실제로는 30분 뒤다
    const s0 = must(pressHeart(newDay('20:30', '21:00'), C('23:40'), 'yangcho'));
    expect(C('00:10')).toBe(24 * 60 + 10);
    expect(completeWorkout(s0, 'tawi', C('23:30'), rec('tawi', '23:55'))).toMatchObject({ ok: false, reason: 'completion_before_start' });
    const plusDay = C('00:10');
    const ok = completeWorkout(s0, 'tawi', plusDay, rec('tawi', '00:20', '2026-10-16'));
    expect(ok.ok).toBe(true);
    expect(workoutSession(must(ok)).completions.tawi).toMatchObject({ actualCompletedAt: plusDay, actualCompletedInstant: REC('2026-10-16', '00:10') });
    // 입력 순간(00:05)보다 미래의 완료(00:10)는 거부
    expect(completeWorkout(s0, 'tawi', plusDay, rec('tawi', '00:05', '2026-10-16'))).toMatchObject({ ok: false, reason: 'completion_in_future' });
    // 날짜가 어제인 입력 순간 (같은 시각 글자라도) 은 미래
    expect(completeWorkout(s0, 'tawi', plusDay, rec('tawi', '23:59', D))).toMatchObject({ ok: false, reason: 'completion_in_future' });
    // 04:00 직전(03:50+1)은 03:55 입력이면 정상, 03:45 입력이면 미래
    const late = 24 * 60 + 3 * 60 + 50;
    expect(completeWorkout(s0, 'tawi', late, rec('tawi', '03:55', '2026-10-16')).ok).toBe(true);
    expect(completeWorkout(s0, 'tawi', late, rec('tawi', '03:45', '2026-10-16'))).toMatchObject({ ok: false, reason: 'completion_in_future' });
    // 04:00 이후 새 날 05:00에 입력해도 같은 세션
    const after = must(completeWorkout(s0, 'tawi', late, rec('tawi', '05:00', '2026-10-16')));
    expect(workoutSession(after).completions.tawi!.sessionId).toBe(sessionIdOf(D));
    // 잘못된 입력 순간·시각
    expect(completeWorkout(s0, 'tawi', plusDay, { by: 'tawi', recordedAt: '아님' })).toMatchObject({ ok: false, reason: 'invalid_recorded_at' });
    expect(completeWorkout(s0, 'tawi', Number.NaN, rec('tawi', '00:20', '2026-10-16'))).toMatchObject({ ok: false, reason: 'invalid_time' });
  });

  it('실제 완료 시각과 기록 입력 시각은 따로 저장된다', () => {
    const s = must(completeWorkout(started(), 'yangcho', C('20:40'), rec('tawi', '23:10')));
    const c = workoutSession(s).completions.yangcho!;
    expect(c.actualCompletedAt).toBe(C('20:40'));
    expect(c.recordedAt).toBe(REC(D, '23:10'));
    expect(s.actuals.steps[workoutKey('yangcho')]).toMatchObject({ time: C('20:40'), recordedAt: REC(D, '23:10'), by: 'tawi', person: 'yangcho' });
  });
});

describe('예상과 실제, 개인별 샤워·귀가', () => {
  it('10. 실제 완료 기록이 없으면 예상일 뿐이고, 시간이 지나도 자동으로 실제가 되지 않는다', () => {
    const s = started();
    const w = workoutSession(s);
    expect(w.status).toBe('in_progress');
    const late = tlOf(s, C('23:30')); // 예상 종료(20:55)를 한참 지남
    for (const p of ['yangcho', 'tawi']) {
      const n = node(late, p, 'workout_end');
      expect(n.state).toBe('pending');
      expect(n.actual).toBeNull();
      expect(n.overdue).toBe(true);
      expect(n.time).toBe(C('20:55')); // 예상 시각 유지
    }
    expect(workoutSession(s).completions).toEqual({ yangcho: null, tawi: null });
    expect(Object.keys(s.actuals.steps)).toEqual(['joint.start_together']);
  });

  it('ETA·PLAN 같은 계획 변경은 이미 기록한 실제 완료 시각을 바꾸지 않는다', () => {
    let s = must(completeWorkout(started(), 'yangcho', C('20:40'), rec('yangcho', '20:41')));
    const snap = stableStringify(s.actuals);
    s = setEtaMode(s, 'tawi', 'subway', { station_arrival: C('19:20') }, 'tawi');
    s = { ...s, workoutMinutes: 90 };
    expect(stableStringify(s.actuals)).toBe(snap);
    expect(workoutSession(s).completions.yangcho!.actualCompletedAt).toBe(C('20:40'));
    expect(at(tlOf(s, C('20:45')), 'yangcho', 'workout_end')).toBe('20:40');
  });

  it('11. 샤워·귀가는 각자 자기 실제 운동 끝에서 이어지고, 저녁 준비는 둘 다 귀가한 뒤에 시작한다', () => {
    const base = tlOf(started());
    const baseShowerY = node(base, 'yangcho', 'shower_end').time!;
    const baseShowerT = node(base, 'tawi', 'shower_end').time!;
    const s = must(completeWorkout(started(), 'yangcho', C('20:40'), rec('yangcho', '20:41')));
    const one = tlOf(s, C('20:45'));
    // 양초는 15분 일찍 끝났으니 양초 샤워만 15분 앞당겨지고 타위는 예상 그대로
    expect(node(one, 'yangcho', 'shower_end').time).toBe(baseShowerY - 15);
    expect(node(one, 'tawi', 'shower_end').time).toBe(baseShowerT);
    // 둘 다 실제 완료 (타위가 10분 늦게)
    const s2 = must(completeWorkout(s, 'tawi', C('21:05'), rec('tawi', '21:06')));
    const two = tlOf(s2, C('21:10'));
    expect(node(two, 'yangcho', 'shower_end').time).toBe(baseShowerY - 15);
    expect(node(two, 'tawi', 'shower_end').time).toBe(baseShowerT + 10);
    const homeY = node(two, 'yangcho', 'home_return').time!;
    const homeT = node(two, 'tawi', 'home_return').time!;
    expect(homeT).toBeGreaterThan(homeY);
    expect(node(two, 'joint', 'dinner_prep_start').time).toBe(Math.max(homeY, homeT)); // 변하지 않은 규칙
    // 요약의 운동 끝은 두 사람 중 늦은 쪽
    expect(two.summary.workoutEnd).toBe(C('21:05'));
  });
});

describe('기존 데이터 보존과 호환', () => {
  const legacy = (s: DayState): DayState => ({
    ...s,
    actuals: {
      steps: { ...s.actuals.steps, 'joint.workout_end': { status: 'done', time: C('21:05'), expectedAtDone: C('20:55'), by: 'tawi', label: '운동 끝', rewardKey: null } },
    },
  });

  it('12-a. 옛 공동 종료 기록은 그대로 남고, 개인 완료로 바뀌지 않으며, 세션 완료로도 읽히지 않는다', () => {
    const s = legacy(started());
    const original = JSON.stringify(s.actuals.steps['joint.workout_end']);
    expect(legacyJointEnd(s)).toEqual({ key: 'joint.workout_end', label: LEGACY_JOINT_END_LABEL });
    const w = workoutSession(s);
    expect(w.status).toBe('in_progress');
    expect(w.completions).toEqual({ yangcho: null, tawi: null });
    // 타임라인도 옛 기록을 실제 완료로 쓰지 않는다
    const tl = tlOf(s, C('21:30'));
    expect(node(tl, 'yangcho', 'workout_end').state).not.toBe('done');
    expect(node(tl, 'tawi', 'workout_end').state).not.toBe('done');
    expect(tl.nodes.some((n) => n.id === 'workout_end' && n.lane === 'joint')).toBe(false);
    // 이후 개인 완료를 넣어도 원본은 그대로
    const after = must(completeWorkout(s, 'yangcho', C('21:00'), rec('yangcho', '21:10')));
    expect(JSON.stringify(after.actuals.steps['joint.workout_end'])).toBe(original);
    expect(legacyJointEnd(after)).not.toBeNull();
  });

  it('12-b. 새 필드(person·sessionId·recordedAt·revisions)가 없는 기록도 오류 없이 읽는다', () => {
    const s: DayState = {
      ...started(),
      actuals: {
        steps: {
          'joint.start_together': { status: 'done', time: C('19:40'), expectedAtDone: C('19:40'), by: 'yangcho', label: '❤️', rewardKey: null },
          'yangcho.workout_end': { status: 'done', time: C('20:50'), expectedAtDone: C('20:55'), by: 'yangcho', label: '운동 끝', rewardKey: null },
        },
      },
    };
    const w = workoutSession(s);
    expect(w.completions.yangcho).toMatchObject({ sessionId: SID, actualCompletedAt: C('20:50'), recordedAt: null, recordedDay: null, revisions: [], proxy: false, rewardKey: `workout:yangcho:${SID}` });
    // 시각을 고치면 이력이 새로 시작되고 원래 시각이 남는다
    const e = must(editWorkoutTime(s, 'yangcho', C('20:45'), rec('yangcho', '21:00')));
    expect(workoutSession(e).completions.yangcho!.revisions).toEqual([{ at: REC(D, '21:00'), by: 'yangcho', kind: 'time_edited', actualAt: C('20:45'), prevActualAt: C('20:50') }]);
  });

  it('12-c. 저장했다가 다시 읽어도 개인 완료·이력이 그대로이고, 반복해서 읽어도 같은 결과다', () => {
    let s = must(completeWorkout(started(), 'yangcho', C('20:40'), rec('tawi', '20:41')));
    s = must(completeWorkout(s, 'tawi', C('20:55'), rec('tawi', '20:56')));
    s = must(editWorkoutTime(s, 'tawi', C('20:58'), rec('tawi', '21:00')));
    s = must(undoWorkout(s, 'yangcho', rec('tawi', '21:01')));
    const once = parseDayState(JSON.parse(JSON.stringify(s)))!;
    const twice = parseDayState(JSON.parse(JSON.stringify(once)))!;
    expect(sameState(once, s)).toBe(true);
    expect(sameState(twice, once)).toBe(true);
    expect(workoutSession(once)).toEqual(workoutSession(s));
    // 날짜 장부로 보관·복원해도 그대로
    let book = emptyBook(s);
    book = switchDay(book, '2026-10-16', REC('2026-10-16', '05:00'));
    expect(sameState(book.days[D].state, s)).toBe(true);
    const back = switchDay(book, D, REC('2026-10-16', '05:01'));
    expect(sameState(back.current, s)).toBe(true);
    expect(switchDay(back, D, REC('2026-10-16', '05:02'))).toBe(back);
  });

  it('보상 식별자는 준비만 되어 있고 점수·스티커 같은 값은 만들지 않는다', () => {
    let s = must(completeWorkout(started(), 'yangcho', C('20:40'), rec('yangcho', '20:41')));
    s = must(completeWorkout(s, 'tawi', C('20:50'), rec('tawi', '20:51')));
    for (const k of [workoutKey('yangcho'), workoutKey('tawi')]) {
      expect(Object.keys(s.actuals.steps[k]).sort()).toEqual(['by', 'expectedAtDone', 'label', 'person', 'recordedAt', 'revisions', 'rewardKey', 'sessionId', 'status', 'time']);
    }
    expect(s.actuals.steps['joint.start_together'].rewardKey).toBeNull();
  });
});

describe('3단계: 화면이 쓰는 도움 함수 (규칙은 도메인 한 곳)', () => {
  it('checkWorkoutTime은 기록·수정 동작이 쓰는 검사와 같은 결과를 준다', () => {
    const s0 = newDay();
    expect(checkWorkoutTime(s0, C('20:40'), REC(D, '20:41'))).toBe('no_session');
    const s = started();
    const cases: [number, string, string | null][] = [
      [C('19:30'), '20:00', 'completion_before_start'],
      [C('20:40'), '20:30', 'completion_in_future'],
      [C('20:40'), '20:40', null],
      [C('20:40'), '20:41', null],
    ];
    for (const [actual, recAt, expected] of cases) {
      const r = REC(D, recAt);
      expect(checkWorkoutTime(s, actual, r)).toBe(expected);
      const done = completeWorkout(s, 'yangcho', actual, { by: 'yangcho', recordedAt: r });
      expect(done.ok).toBe(expected === null);
    }
    expect(checkWorkoutTime(s, C('20:40'), '아님')).toBe('invalid_recorded_at');
  });

  it('workoutTimeBounds: 시작 시각부터 입력 순간까지. 개발용 시계가 시작보다 앞이면 범위가 비어 있다', () => {
    expect(workoutTimeBounds(newDay(), REC(D, '21:00'))).toBeNull();
    expect(workoutTimeBounds(started(), REC(D, '21:00'))).toEqual({ min: C('19:40'), max: C('21:00') });
    const empty = workoutTimeBounds(started(), REC(D, '19:00'))!;
    expect(empty.max).toBeLessThan(empty.min);
    // 자정을 넘긴 입력 순간은 1440 이상으로 계산돼요 (실제 날짜 포함)
    expect(workoutTimeBounds(started(), REC('2026-10-16', '00:30'))).toEqual({ min: C('19:40'), max: C('00:30') });
    // 지난 세션은 입력 순간(오늘)이 아주 뒤라서 상한이 큰 값이에요
    expect(workoutTimeBounds(started(), REC('2026-10-18', '09:00'))!.max).toBeGreaterThan(2 * 1440);
    expect(workoutTimeBounds(started(), 'x')).toBeNull();
  });

  it('resolveClockForSession: 시작 이후 처음 오는 시각 (자정·04:00 경계 포함)', () => {
    const st = C('19:40');
    const R = (h: number, m: number, start = st) => resolveClockForSession(start, h, m);
    expect(R(19, 40)).toBe(st);
    expect(R(20, 55)).toBe(C('20:55'));
    expect(R(1, 10)).toBe(C('01:10')); // 다음 날 새벽
    expect(R(1, 10)).toBe(25 * 60 + 10);
    expect(R(19, 30)).toBe(24 * 60 + 19 * 60 + 30); // 시작보다 앞선 시계 → 다음 날 (미래라서 동작이 거부해요)
    expect(R(3, 55, C('03:50'))).toBe(24 * 60 + 3 * 60 + 55); // 03:50 시작, 03:55 완료
    expect(R(24, 0)).toBeNull();
    expect(R(5, 60)).toBeNull();
    expect(R(-1, 0)).toBeNull();
    expect(R(1.5, 0)).toBeNull();
  });

  it('cancelledWorkout: 취소된 기록에서만 이전 시각을 알려 준다', () => {
    const s0 = started();
    expect(cancelledWorkout(s0, 'yangcho')).toBeNull();
    const s1 = must(completeWorkout(s0, 'yangcho', C('20:40'), rec('yangcho', '20:41')));
    expect(cancelledWorkout(s1, 'yangcho')).toBeNull();
    const s2 = must(undoWorkout(s1, 'yangcho', rec('tawi', '21:00')));
    expect(cancelledWorkout(s2, 'yangcho')).toEqual({ actualAt: C('20:40'), cancelledBy: 'tawi', cancelledAt: REC(D, '21:00') });
  });

  it('pendingWorkoutSessions: 오늘이 아닌 날 중 ❤️가 있고 완료 안 한 사람이 있는 세션만, 최근 날짜부터', () => {
    const day = (d: string) => createDayState(d);
    const withHeart = (d: string, hhmm = '20:00') => must(pressHeart(setEtaMode(setEtaMode(day(d), 'yangcho', 'subway', { station_arrival: C('18:20') }, 'yangcho'), 'tawi', 'subway', { station_arrival: C('18:50') }, 'tawi'), C(hhmm), 'yangcho'));
    const both = (s: DayState) => {
      const a = must(completeWorkout(s, 'yangcho', C('21:00'), { by: 'yangcho', recordedAt: REC('2026-10-20', '09:00') }));
      return must(completeWorkout(a, 'tawi', C('21:10'), { by: 'tawi', recordedAt: REC('2026-10-20', '09:01') }));
    };
    const one = (s: DayState) => must(completeWorkout(s, 'yangcho', C('21:00'), { by: 'yangcho', recordedAt: REC('2026-10-20', '09:00') }));
    const legacy = (s: DayState): DayState => ({ ...s, actuals: { steps: { ...s.actuals.steps, 'joint.workout_end': { status: 'done', time: C('21:05'), expectedAtDone: C('20:55'), by: 'tawi', label: '운동 끝', rewardKey: null } } } });
    const days = [
      { day: '2026-10-10', state: both(withHeart('2026-10-10')) }, // 둘 다 완료 → 제외
      { day: '2026-10-11', state: day('2026-10-11') }, // 세션 없음 → 제외
      { day: '2026-10-12', state: one(withHeart('2026-10-12', '19:50')) }, // 타위만 미기록
      { day: '2026-10-13', state: withHeart('2026-10-13', '19:45') }, // 둘 다 미기록
      { day: '2026-10-14', state: legacy(withHeart('2026-10-14')) }, // 옛 공동 종료 기록만 → 여전히 미기록
      { day: '2026-10-15', state: withHeart('2026-10-15') }, // 오늘 → 제외
    ];
    const list = pendingWorkoutSessions(days, '2026-10-15');
    expect(list.map((x) => [x.day, x.missing, x.legacy])).toEqual([
      ['2026-10-14', ['yangcho', 'tawi'], true],
      ['2026-10-13', ['yangcho', 'tawi'], false],
      ['2026-10-12', ['tawi'], false],
    ]);
    expect(list[2]).toMatchObject({ sessionId: 'ws:2026-10-12', startedAt: C('19:50') });
    // 오래된 날짜도 빼지 않는다 (기한 O-134 미정)
    expect(pendingWorkoutSessions([{ day: '2025-01-01', state: withHeart('2025-01-01') }], '2026-10-15')).toHaveLength(1);
  });
});

describe('4단계: 지난 운동 목록 (읽기 전용 계산)', () => {
  const heart = (d: string, hhmm = '20:00') => must(pressHeart(setEtaMode(setEtaMode(createDayState(d), 'yangcho', 'subway', { station_arrival: C('18:20') }, 'yangcho'), 'tawi', 'subway', { station_arrival: C('18:50') }, 'tawi'), C(hhmm), 'yangcho'));
  const R = (d: string, hhmm: string, by: 'yangcho' | 'tawi' = 'yangcho') => ({ by, recordedAt: new Date(`${d}T${hhmm}:00+09:00`).toISOString() });
  const legacy = (s: DayState): DayState => ({ ...s, actuals: { steps: { ...s.actuals.steps, 'joint.workout_end': { status: 'done', time: C('21:05'), expectedAtDone: C('20:55'), by: 'tawi', label: '운동 끝', rewardKey: null } } } });

  it('오늘과 모든 보관 세션을 최신 날짜부터 보여 주고, ❤️ 없는 날은 뺀다 (기간 제한 없음)', () => {
    const today = '2026-10-18';
    const cur = heart(today, '19:40');
    const days = [
      { day: '2025-01-01', state: heart('2025-01-01') }, // 아주 오래된 날도 유지
      { day: '2026-10-10', state: createDayState('2026-10-10') }, // ❤️ 없음 → 제외
      { day: '2026-10-16', state: heart('2026-10-16') },
      { day: '2026-10-13', state: legacy(heart('2026-10-13')) },
    ];
    const rows = listWorkoutSessions(days, cur);
    expect(rows.map((r) => r.day)).toEqual([today, '2026-10-16', '2026-10-13', '2025-01-01']);
    expect(rows[0]).toMatchObject({ sessionId: 'ws:2026-10-18', startedAt: C('19:40'), startedBy: 'yangcho', legacy: false });
    expect(rows[2].legacy).toBe(true);
    // 읽기만 한다: 입력 상태는 그대로
    expect(sameState(days[2].state, heart('2026-10-16'))).toBe(true);
    // 보관함에 오늘과 같은 날짜가 따로 있어도 오늘 상태만 쓴다 (한 날짜는 한 줄)
    expect(listWorkoutSessions([{ day: today, state: heart(today, '18:00') }], cur).map((r) => [r.day, r.startedAt])).toEqual([[today, C('19:40')]]);
    // ❤️가 없으면 목록이 비어 있다
    expect(listWorkoutSessions([], createDayState(today))).toEqual([]);
  });

  it('행마다 상태·완료 시각·취소 정보·이력이 계산된다', () => {
    let s = heart('2026-10-16');
    s = must(completeWorkout(s, 'yangcho', C('21:00'), R('2026-10-16', '21:01')));
    s = must(completeWorkout(s, 'tawi', C('21:10'), R('2026-10-16', '21:12', 'tawi')));
    s = must(editWorkoutTime(s, 'tawi', C('21:20'), R('2026-10-17', '09:00', 'yangcho')));
    s = must(undoWorkout(s, 'yangcho', R('2026-10-17', '09:05')));
    const [row] = listWorkoutSessions([{ day: '2026-10-16', state: s }], createDayState('2026-10-18'));
    expect(row.view.status).toBe('in_progress'); // 양초 취소 → 한 명만 유효
    expect(row.view.completions.yangcho).toBeNull();
    expect(row.view.completions.tawi).toMatchObject({ actualCompletedAt: C('21:20'), completedBy: 'tawi' });
    expect(row.cancelled).toEqual({ yangcho: { actualAt: C('21:00') }, tawi: null });
    // 이력: 최신이 먼저, 취소된 사람의 이력도 포함
    expect(row.events.map((e) => [e.person, e.kind, e.by])).toEqual([
      ['yangcho', 'undone', 'yangcho'],
      ['tawi', 'time_edited', 'yangcho'],
      ['tawi', 'recorded', 'tawi'],
      ['yangcho', 'recorded', 'yangcho'],
    ]);
    expect(row.events[1]).toMatchObject({ actualAt: C('21:20'), prevActualAt: C('21:10') });
    expect(workoutEvents(s)).toEqual(row.events);
  });

  it('지난 날의 수정은 그 날짜만 바꾸고 목록의 다른 날·세션 ID는 그대로다', () => {
    const a = heart('2026-10-15');
    const b = heart('2026-10-16');
    const cur = createDayState('2026-10-18');
    const before = listWorkoutSessions([{ day: '2026-10-15', state: a }, { day: '2026-10-16', state: b }], cur);
    const a2 = must(completeWorkout(a, 'tawi', C('21:30'), R('2026-10-18', '10:00', 'yangcho'))); // 늦은 대신 기록
    const after = listWorkoutSessions([{ day: '2026-10-15', state: a2 }, { day: '2026-10-16', state: b }], cur);
    expect(after.map((r) => [r.day, r.sessionId])).toEqual(before.map((r) => [r.day, r.sessionId]));
    expect(after[1].view.completions.tawi).toMatchObject({ completedBy: 'yangcho', proxy: true, sessionId: 'ws:2026-10-15' });
    expect(after[0]).toEqual(before[0]);
  });
});

